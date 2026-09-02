import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { handleAiRequest } from '../server/ai.mjs';

test('native protocols send credentials and decode real HTTP responses', async () => {
  const seen: { path: string; body: any; headers: any }[] = [];
  const upstream = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    seen.push({ path: req.url!, body, headers: req.headers });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/models') res.end(JSON.stringify({ data: [{ id: 'synthetic-model' }] }));
    else if (req.url?.includes('generateContent'))
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Reviewed' }] } }] }));
    else if (req.url === '/v1/messages')
      res.end(JSON.stringify({ content: [{ type: 'text', text: 'Reviewed' }] }));
    else if (req.url === '/v1/responses')
      res.end(
        JSON.stringify({ output: [{ content: [{ type: 'output_text', text: 'Reviewed' }] }] }),
      );
    else res.end(JSON.stringify({ choices: [{ message: { content: 'Reviewed' } }] }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const port = (upstream.address() as { port: number }).port;
  try {
    for (const protocol of ['chat', 'responses', 'anthropic', 'gemini']) {
      const response = await handleAiRequest({
        path: '/api/ai/generate',
        method: 'POST',
        body: {
          config: {
            protocol,
            endpoint: `http://127.0.0.1:${port}/v1`,
            apiKey: 'synthetic-key',
            model: 'synthetic-model',
          },
          operation: 'polish',
          text: 'Synthetic draft',
          stream: false,
        },
        allowLocalProviders: true,
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).text, 'Reviewed');
    }
    assert.equal(seen[0].headers.authorization, 'Bearer synthetic-key');
    assert.equal(seen[1].body.store, false);
    assert.equal(seen[2].headers['x-api-key'], 'synthetic-key');
    assert.equal(seen[3].headers['x-goog-api-key'], 'synthetic-key');
    const models = await handleAiRequest({
      path: '/api/ai/models',
      method: 'POST',
      body: {
        config: {
          protocol: 'chat',
          endpoint: `http://127.0.0.1:${port}/v1`,
          apiKey: 'synthetic-key',
        },
      },
      allowLocalProviders: true,
    });
    assert.deepEqual(
      (await models.json()).models.map((m: any) => m.id),
      ['synthetic-model'],
    );
  } finally {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('rejects nonlocal private endpoints and invalid operations before fetch', async () => {
  for (const endpoint of [
    'http://127.0.0.1:9000/v1',
    'http://169.254.169.254/latest',
    'file:///tmp/model',
  ]) {
    const response = await handleAiRequest({
      path: '/api/ai/models',
      method: 'POST',
      body: { config: { protocol: 'chat', endpoint, apiKey: 'key' } },
    });
    assert.equal(response.status, 400);
  }
});

test('bodyless provider responses return controlled errors without stopping the API server', async () => {
  let status = 204;
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(status === 200 ? JSON.stringify({ data: [{ id: 'synthetic-model' }] }) : undefined);
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  assert.ok(address && typeof address === 'object');
  const moduleUrl = new URL('../server/http.mjs', import.meta.url).href;
  const code = `import { createServer } from 'node:http';
    import { apiMiddleware } from ${JSON.stringify(moduleUrl)};
    const server = createServer((req, res) => {
      void apiMiddleware(req, res, undefined, { allowLocalProviders: true });
    });
    server.listen(0, '127.0.0.1', () => console.log(server.address().port));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  const exited = once(child, 'exit');
  let errors = '';
  child.stderr!.on('data', (data) => {
    errors += data.toString();
  });
  try {
    const [data] = await once(child.stdout!, 'data');
    const base = `http://127.0.0.1:${Number(data.toString().trim())}`;
    const config = {
      protocol: 'chat',
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      apiKey: '',
      model: 'synthetic-model',
    };
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(2000),
      });
    for (const code of [204, 205, 304]) {
      status = code;
      for (const stream of [false, true]) {
        const response = await post('/api/ai/generate', {
          config,
          operation: 'polish',
          text: 'Synthetic draft',
          stream,
        });
        assert.equal(response.status, 502);
        assert.match((await response.json()).error, /no response body|HTTP 304/);
      }
      const response = await post('/api/ai/models', { config });
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /no response body|HTTP 304/);
      status = 200;
      const healthy = await post('/api/ai/models', { config });
      assert.equal(healthy.status, 200);
      assert.deepEqual(
        (await healthy.json()).models.map((model: { id: string }) => model.id),
        ['synthetic-model'],
      );
    }
  } catch (error) {
    assert.fail(`${error instanceof Error ? error.message : error}\n${errors}`);
  } finally {
    child.kill();
    await exited.catch(() => {});
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
