import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createAssetsHandler } from '../server/assets.mjs';
test('remote SVG logos become bounded embedded raster images', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="24"><rect width="36" height="24" fill="#c9dfd1"/><script>throw Error("must not execute")</script></svg>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const response = await createAssetsHandler()({
      path: '/api/assets/image',
      method: 'POST',
      body: { url: `http://127.0.0.1:${address.port}/logo.svg` },
      signal: new AbortController().signal,
      allowLocalProviders: true,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const image = Buffer.from(await response.arrayBuffer());
    assert.equal(image.subarray(1, 4).toString(), 'PNG');
    assert.equal(image.readUInt32BE(16), 36);
    assert.equal(image.readUInt32BE(20), 24);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
