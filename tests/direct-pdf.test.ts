import assert from 'node:assert/strict';
import test from 'node:test';
import { handlePdfRequest } from '../server/pdf.mjs';

test('direct PDF rejects malformed input before launching a browser', async () => {
  const common = { path: '/api/pdf', method: 'POST', signal: new AbortController().signal };
  assert.equal((await handlePdfRequest({ ...common, body: { html: '' } })).status, 400);
  assert.equal(
    (await handlePdfRequest({ ...common, body: { html: 'x'.repeat(24 * 1024 * 1024 + 1) } }))
      .status,
    413,
  );
});

test('direct PDF returns actual paginated selectable-text bytes without executing scripts', async () => {
  const response = await handlePdfRequest({
    path: '/api/pdf',
    method: 'POST',
    signal: new AbortController().signal,
    body: {
      html: '<!doctype html><html><head><style>@page{size:A4;margin:0}body{margin:0}.page{height:280mm;break-after:page}</style></head><body><div class="page">FIRST PAGE</div><div>SECOND PAGE</div><script>document.body.innerHTML="REMOVED"</script></body></html>',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 1000);
  assert.equal(Number(/\/Count (\d+)/.exec(bytes.toString('latin1'))?.[1]), 2);
  assert.ok(bytes.toString('latin1').includes('/ToUnicode'));
});
