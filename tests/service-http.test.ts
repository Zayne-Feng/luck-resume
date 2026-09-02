import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { apiMiddleware } from '../server/http.mjs';

test('public API requires the proxy token and exact HTTPS origin with local providers disabled', async () => {
  const publicOrigin = 'https://resume.lunelu.com';
  const token = 'b'.repeat(64);
  let calls = 0;
  const server = createServer((req, res) =>
    apiMiddleware(req, res, undefined, {
      publicOrigin,
      proxyToken: token,
      allowLocalProviders: true,
      handlers: [
        async (input) => {
          calls++;
          assert.equal(input.allowLocalProviders, false);
          assert.equal(input.origin, publicOrigin);
          return Response.json({ ok: true });
        },
      ],
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const headers of [
      {},
      { 'X-Luck-Proxy-Token': 'wrong' },
      { 'X-Luck-Proxy-Token': token },
      { 'X-Luck-Proxy-Token': token, Origin: 'https://unrelated.example' },
      { 'X-Luck-Proxy-Token': token, Origin: 'http://resume.lunelu.com' },
      { 'X-Luck-Proxy-Token': token, Origin: publicOrigin + '/path' },
      { 'X-Luck-Proxy-Token': token, Origin: 'null' },
    ]) {
      const response = await fetch(`${base}/api/health`, { headers });
      assert.equal(response.status, 403);
    }
    for (const origin of [publicOrigin]) {
      const response = await fetch(`${base}/api/health`, {
        headers: { 'X-Luck-Proxy-Token': token, ...(origin ? { Origin: origin } : {}) },
      });
      assert.equal(response.status, 200);
    }
    assert.equal(calls, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('same-origin API accepts bounded JSON, streams responses and rejects cross-origin posts', async () => {
  let calls = 0;
  const server = createServer((req, res) =>
    apiMiddleware(req, res, undefined, {
      maxBodyBytes: 128,
      handlers: [
        async ({ body }) => {
          calls++;
          return new Response(JSON.stringify(body), {
            headers: { 'Content-Type': 'application/json' },
          });
        },
      ],
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    let response = await fetch(`${base}/api/ai/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: '{"value":42}',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { value: 42 });
    response = await fetch(`${base}/api/ai/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' },
      body: '{}',
    });
    assert.equal(response.status, 403);
    response = await fetch(`${base}/api/ai/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'null' },
      body: '{}',
    });
    assert.equal(response.status, 403);
    response = await fetch(`${base}/api/ai/test`, { method: 'POST', body: '{}' });
    assert.equal(response.status, 415);
    response = await fetch(`${base}/api/ai/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(256) }),
    });
    assert.equal(response.status, 413);
    assert.equal(calls, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('unknown API paths return JSON 404 rather than the application shell', async () => {
  const server = createServer((req, res) => apiMiddleware(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/unknown`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type')!, /application\/json/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('chunked requests over the limit receive 413 without invoking a handler', async () => {
  let calls = 0;
  const server = createServer((req, res) => {
    void apiMiddleware(req, res, undefined, {
      maxBodyBytes: 32,
      handlers: [
        () => {
          calls++;
          return Response.json({ ok: true });
        },
      ],
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const result = await new Promise<{ status: number | undefined; body: string }>(
      (resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port: address.port,
            path: '/api/test',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
          },
          (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => resolve({ status: res.statusCode, body }));
          },
        );
        req.setTimeout(1000, () => req.destroy(new Error('Response timed out')));
        req.on('error', reject);
        req.write('"' + 'x'.repeat(64));
      },
    );
    assert.equal(result.status, 413);
    assert.match(JSON.parse(result.body).error, /size limit/);
    assert.equal(calls, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('malformed Host returns 400 and leaves the server running', async () => {
  const moduleUrl = pathToFileURL(process.cwd() + '/server/http.mjs').href;
  const code = `import { createServer } from 'node:http';
    import { apiMiddleware } from ${JSON.stringify(moduleUrl)};
    const server = createServer((req, res) => { void apiMiddleware(req, res); });
    server.listen(0, '127.0.0.1', () => console.log(server.address().port));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  try {
    const [data] = await once(child.stdout!, 'data');
    const port = Number(data.toString().trim());
    const result = await new Promise<{ status: number | undefined; body: string }>(
      (resolve, reject) => {
        const req = request(
          { host: '127.0.0.1', port, path: '/api/health', headers: { Host: '[bad' } },
          (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => resolve({ status: res.statusCode, body }));
          },
        );
        req.setTimeout(1000, () => req.destroy(new Error('Response timed out')));
        req.on('error', reject);
        req.end();
      },
    );
    assert.equal(result.status, 400);
    assert.match(JSON.parse(result.body).error, /request/i);
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
  } finally {
    child.kill();
    await exited.catch(() => {});
  }
});

test('disconnecting a streaming response aborts the handler and cancels the stream', async () => {
  let finish!: (value: { aborted: boolean }) => void;
  const cancelled = new Promise<{ aborted: boolean }>((resolve) => {
    finish = resolve;
  });
  const server = createServer((req, res) => {
    void apiMiddleware(req, res, undefined, {
      handlers: [
        ({ signal }) =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('data: first\n\n'));
              },
              cancel() {
                finish({ aborted: signal.aborted });
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
      ],
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/test`);
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    const first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value), 'data: first\n\n');
    await reader.cancel();
    const result = await Promise.race([
      cancelled,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Cancellation timed out')), 1000),
      ),
    ]);
    assert.equal(result.aborted, true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('aborting a partial upload does not invoke a handler', async () => {
  let calls = 0;
  let finish!: () => void;
  let started!: () => void;
  const aborted = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const received = new Promise<void>((resolve) => {
    started = resolve;
  });
  const server = createServer((req, res) => {
    req.once('aborted', finish);
    req.once('data', started);
    void apiMiddleware(req, res, undefined, {
      handlers: [
        () => {
          calls++;
          return Response.json({ ok: true });
        },
      ],
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const req = request({
      host: '127.0.0.1',
      port: address.port,
      path: '/api/test',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    req.on('error', () => {});
    req.write('{"partial":');
    await received;
    req.destroy();
    await Promise.race([
      aborted,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Abort timed out')), 1000),
      ),
    ]);
    assert.equal(calls, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
