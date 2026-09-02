import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { timingSafeEqual } from 'node:crypto';

function failure(status, message) {
  return Response.json({ error: message }, { status });
}
function validProxyToken(value, expected) {
  if (typeof value !== 'string' || typeof expected !== 'string' || expected.length < 32)
    return false;
  const supplied = Buffer.from(value);
  const required = Buffer.from(expected);
  return supplied.length === required.length && timingSafeEqual(supplied, required);
}
function matchesOrigin(value, expected) {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      url.host === expected.host &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

async function readBody(request, limit) {
  if (Number(request.headers['content-length'] || 0) > limit)
    throw Object.assign(new Error('The request exceeds the size limit.'), { status: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit)
      throw Object.assign(new Error('The request exceeds the size limit.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('The request contains invalid JSON.'), { status: 400 });
  }
}

async function dispatch(input) {
  if (input.path === '/api/health')
    return Response.json({ version: 1, ai: true, assets: true, pdf: true });
  if (input.path.startsWith('/api/ai/')) {
    const { handleAiRequest } = await import('./ai.mjs');
    return handleAiRequest(input);
  }
  if (input.path.startsWith('/api/assets/')) {
    const { handleAssetsRequest } = await import('./assets.mjs');
    return handleAssetsRequest(input);
  }
  if (input.path === '/api/pdf') {
    const { handlePdfRequest } = await import('./pdf.mjs');
    return handlePdfRequest(input);
  }
  return null;
}

export async function apiMiddleware(request, response, next, options = {}) {
  const base = `http://${request.headers.host || '127.0.0.1'}`;
  let url;
  try {
    url = new URL(request.url || '/', base);
  } catch {
    response.writeHead(400, { 'Content-Type': 'application/json', Connection: 'close' });
    response.end(JSON.stringify({ error: 'Invalid request URL or host.' }));
    return true;
  }
  if (!url.pathname.startsWith('/api/')) {
    next?.();
    return false;
  }
  const controller = new AbortController();
  const abort = () => {
    if (!response.writableEnded) controller.abort();
  };
  request.once('aborted', abort);
  response.once('close', abort);
  try {
    const publicMode = Boolean(options.publicOrigin);
    const expected = new URL(options.publicOrigin || base);
    const supplied = request.headers.origin;
    let result;
    if (
      publicMode &&
      (!validProxyToken(request.headers['x-luck-proxy-token'], options.proxyToken) ||
        supplied !== expected.origin)
    )
      result = failure(403, 'This API requires the configured application proxy.');
    else if (
      !publicMode &&
      options.allowLocalProviders &&
      !['localhost', '127.0.0.1', '[::1]'].includes(expected.hostname)
    )
      result = failure(403, 'Local services require a loopback hostname.');
    else if (!publicMode && supplied && !matchesOrigin(supplied, expected))
      result = failure(403, 'Cross-origin API requests are not allowed.');
    else if (!['GET', 'POST'].includes(request.method || ''))
      result = failure(405, 'This API supports GET and POST requests only.');
    else if (
      request.method === 'POST' &&
      !/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')
    )
      result = failure(415, 'Use application/json for this request.');
    else {
      const body =
        request.method === 'POST'
          ? await readBody(request, options.maxBodyBytes ?? 32 * 1024 * 1024)
          : {};
      const input = {
        path: url.pathname,
        url,
        method: request.method,
        headers: new Headers(
          Object.entries(request.headers).flatMap(([key, value]) =>
            value === undefined ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]],
          ),
        ),
        body,
        signal: controller.signal,
        origin: publicMode ? expected.origin : supplied || expected.origin,
        allowLocalProviders: publicMode ? false : (options.allowLocalProviders ?? false),
      };
      if (options.handlers) {
        for (const handler of options.handlers) {
          result = await handler(input);
          if (result) break;
        }
      } else result = await dispatch(input);
      result ??= failure(404, 'This API endpoint does not exist.');
    }
    response.writeHead(result.status, {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...Object.fromEntries(result.headers),
    });
    if (result.body) await pipeline(Readable.fromWeb(result.body), response);
    else response.end();
  } catch (error) {
    if (controller.signal.aborted || response.destroyed) return true;
    if (response.headersSent) response.end();
    else {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 413 ? { Connection: 'close' } : {}),
      });
      response.end(
        JSON.stringify({
          error:
            status === 500 ? 'The local service could not complete this operation.' : error.message,
        }),
      );
    }
  } finally {
    request.removeListener('aborted', abort);
    response.removeListener('close', abort);
  }
  return true;
}
