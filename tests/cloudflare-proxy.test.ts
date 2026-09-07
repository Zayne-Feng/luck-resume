import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import worker from '../cloudflare/worker.mjs';

const origin = 'https://resume.lunelu.com';
const secret = 'a'.repeat(64);
const environment = {
  LUCK_PUBLIC_ORIGIN: origin,
  LUCK_TUNNEL_ORIGIN: 'https://resume-api.lunelu.com',
  LUCK_PROXY_TOKEN: secret,
  ASSETS: { fetch: async () => new Response('Static fixture') },
};

test('deployment enables request cancellation and reserves API routes before static assets', async () => {
  const text = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', text);
  assert.equal(parsed.error, undefined);
  const config = parsed.config;
  assert.ok(
    config.compatibility_date >= '2026-11-17' ||
      config.compatibility_flags?.includes('enable_request_signal'),
  );
  assert.deepEqual(config.assets.run_worker_first, ['/api', '/api/*']);
  assert.equal(config.assets.binding, 'ASSETS');
  assert.equal(config.vars.LUCK_PUBLIC_ORIGIN, origin);
});

test('static content is independent of backend credentials and availability', async () => {
  const response = await worker.fetch(new Request(`${origin}/`), {
    ASSETS: environment.ASSETS,
  });
  assert.equal(await response.text(), 'Static fixture');
});

test('API configuration and cross-origin failures return JSON without fetching upstream', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('Unexpected upstream request');
  try {
    let response = await worker.fetch(new Request(`${origin}/api/health`), {});
    assert.equal(response.status, 503);
    for (const url of ['http://127.0.0.1:5176', origin, 'https://user:pass@upstream.example']) {
      response = await worker.fetch(new Request(`${origin}/api/health`), {
        ...environment,
        LUCK_TUNNEL_ORIGIN: url,
      });
      assert.equal(response.status, 503);
    }
    for (const request of [
      new Request('https://unrelated.example/api/health'),
      new Request(`${origin}/api/health`, { headers: { Origin: 'https://unrelated.example' } }),
      new Request(`${origin}/api/health`, { headers: { Origin: 'http://resume.lunelu.com' } }),
      new Request(`${origin}/api/health`, { headers: { 'Sec-Fetch-Site': 'cross-site' } }),
    ]) {
      response = await worker.fetch(request, environment);
      assert.equal(response.status, 403);
      assert.match(response.headers.get('content-type')!, /application\/json/);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('proxy forwards bounded API requests without client cookies or forged credentials', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.url, 'https://resume-api.lunelu.com/api/ai/test?fixture=1');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('origin'), origin);
    assert.equal(request.headers.get('x-luck-proxy-token'), secret);
    assert.equal(request.headers.get('cookie'), null);
    assert.equal(request.headers.get('authorization'), null);
    assert.equal(init?.redirect, 'manual');
    assert.deepEqual(await request.json(), { config: { apiKey: 'synthetic-provider-key' } });
    return new Response('PDF fixture', {
      headers: { 'Content-Type': 'application/pdf', 'Set-Cookie': 'upstream=fixture' },
    });
  };
  try {
    const response = await worker.fetch(
      new Request(`${origin}/api/ai/test?fixture=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'browser=fixture',
          Authorization: 'Bearer browser-fixture',
          'X-Luck-Proxy-Token': 'forged',
        },
        body: JSON.stringify({ config: { apiKey: 'synthetic-provider-key' } }),
      }),
      environment,
    );
    assert.equal(await response.text(), 'PDF fixture');
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('x-luck-proxy-token'), null);
  } finally {
    globalThis.fetch = original;
  }
});

test('proxy preserves streaming chunks and propagates client cancellation', async () => {
  const original = globalThis.fetch;
  let controller: ReadableStreamDefaultController;
  let forwardedSignal: AbortSignal;
  const stream = new ReadableStream({
    start(value) {
      controller = value;
    },
  });
  globalThis.fetch = async (_input, init) => {
    forwardedSignal = init!.signal!;
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const abort = new AbortController();
  try {
    const response = await worker.fetch(
      new Request(`${origin}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: abort.signal,
      }),
      environment,
    );
    const reader = response.body!.getReader();
    controller!.enqueue(new TextEncoder().encode('data: {"delta":"first"}\n\n'));
    assert.match(new TextDecoder().decode((await reader.read()).value), /first/);
    controller!.enqueue(new TextEncoder().encode('data: {"done":true}\n\n'));
    assert.match(new TextDecoder().decode((await reader.read()).value), /done/);
    abort.abort();
    assert.equal(forwardedSignal!.aborted, true);
    await reader.cancel();
  } finally {
    globalThis.fetch = original;
  }
});

test('offline, HTML gateway errors and redirects become safe JSON errors', async () => {
  const original = globalThis.fetch;
  try {
    for (const action of [
      async () => {
        throw new Error('Internal fixture detail');
      },
      async () => new Response('<html>Gateway fixture</html>', { status: 502 }),
      async () => Response.redirect('https://unrelated.example/', 302),
    ]) {
      globalThis.fetch = action;
      const response = await worker.fetch(new Request(`${origin}/api/health`), environment);
      assert.equal(response.status, 503);
      const data = await response.json();
      assert.equal(typeof data.error, 'string');
      assert.doesNotMatch(data.error, /fixture|<html>/);
      assert.equal(response.headers.get('location'), null);
    }
    globalThis.fetch = async () => Response.json({ error: 'Provider rate limit' }, { status: 429 });
    const response = await worker.fetch(new Request(`${origin}/api/health`), environment);
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: 'Provider rate limit' });
  } finally {
    globalThis.fetch = original;
  }
});

test('unsupported methods and oversized bodies are rejected before upstream work', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('Unexpected upstream request');
  try {
    const cases: [Request, number][] = [
      [new Request(`${origin}/api`), 404],
      [new Request(`${origin}/api/health`, { method: 'PUT' }), 405],
      [new Request(`${origin}/api/ai/test`, { method: 'POST', body: '{}' }), 415],
      [
        new Request(`${origin}/api/ai/test`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(33 * 1024 * 1024),
          },
          body: '{}',
        }),
        413,
      ],
    ];
    for (const [request, status] of cases) {
      assert.equal((await worker.fetch(request, environment)).status, status);
    }
  } finally {
    globalThis.fetch = original;
  }
});
