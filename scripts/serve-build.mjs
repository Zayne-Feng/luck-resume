import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { apiMiddleware } from '../server/http.mjs';

const root = resolve('dist');
const port = Number(process.env.PORT || 5175);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.txt': 'text/plain; charset=utf-8',
};
const headers = Object.fromEntries(
  (await readFile(resolve(root, '_headers'), 'utf8'))
    .split(/\r?\n/)
    .filter((line) => /^\s+\S+:/u.test(line))
    .map((line) => {
      const index = line.indexOf(':');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
createServer(async (request, response) => {
  try {
    if (await apiMiddleware(request, response, undefined, { allowLocalProviders: true })) return;
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    } catch {
      if (extname(pathname)) {
        response.writeHead(404, headers).end('Not found');
        return;
      }
      file = resolve(root, 'index.html');
    }
    const data = await readFile(file);
    response.writeHead(200, {
      ...headers,
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(400).end('Invalid request');
  }
}).listen(port, '127.0.0.1', () => console.log(`Local build: http://127.0.0.1:${port}`));
