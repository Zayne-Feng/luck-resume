import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import worker from '../cloudflare/worker.mjs';
import { apiMiddleware } from '../server/http.mjs';

test('edge proxy reaches the real loopback API and streams without exposing proxy credentials', async () => {
  const secret = 'c'.repeat(64);
  const publicOrigin = 'https://resume.lunelu.com';
  let streamController: ReadableStreamDefaultController;
  let cancelled = false;
  let aborted = false;
  const server = createServer((request, response) =>
    apiMiddleware(request, response, undefined, {
      publicOrigin,
      proxyToken: secret,
      handlers: [
        async (input) => {
          assert.equal(input.origin, publicOrigin);
          assert.equal(input.allowLocalProviders, false);
          if (input.path === '/api/fixture') return Response.json(input.body);
          if (input.path === '/api/stream') {
            input.signal.addEventListener(
              'abort',
              () => {
                aborted = true;
              },
              { once: true },
            );
            return new Response(
              new ReadableStream({
                start(controller) {
                  streamController = controller;
                  controller.enqueue(new TextEncoder().encode('data: first\n\n'));
                },
                cancel() {
                  cancelled = true;
                },
              }),
              { headers: { 'Content-Type': 'text/event-stream' } },
            );
          }
          return null;
        },
      ],
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const networkFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://resume-api.lunelu.com');
    return networkFetch(base + url.pathname + url.search, init);
  };
  const env = {
    LUCK_PUBLIC_ORIGIN: publicOrigin,
    LUCK_TUNNEL_ORIGIN: 'https://resume-api.lunelu.com',
    LUCK_PROXY_TOKEN: secret,
  };
  const abort = new AbortController();
  try {
    let response = await worker.fetch(
      new Request(`${publicOrigin}/api/fixture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Synthetic draft', apiKey: 'synthetic-key' }),
      }),
      env,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: 'Synthetic draft', apiKey: 'synthetic-key' });
    response = await worker.fetch(
      new Request(`${publicOrigin}/api/stream`, {
        signal: abort.signal,
      }),
      env,
    );
    const reader = response.body!.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: first\n\n');
    streamController!.enqueue(new TextEncoder().encode('data: second\n\n'));
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: second\n\n');
    abort.abort();
    await reader.cancel().catch(() => {});
    for (let attempt = 0; attempt < 100 && (!aborted || !cancelled); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(aborted, true);
    assert.equal(cancelled, true);
    const direct = await networkFetch(`${base}/api/fixture`, {
      headers: { Origin: publicOrigin },
    });
    assert.equal(direct.status, 403);
  } finally {
    globalThis.fetch = networkFetch;
    abort.abort();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
