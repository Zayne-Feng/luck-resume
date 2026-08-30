import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { handleAiRequest } from '../server/ai.mjs';
import { MAX_AI_PDF_BYTES, pdfAttachments } from '../src/ai/pdf.ts';

test('direct PDF input shares the 20 MiB boundary with file selection and the gateway', async () => {
  const signal = new AbortController().signal;
  const file = new File([new Uint8Array(MAX_AI_PDF_BYTES)], 'resume.pdf', {
    type: 'application/pdf',
  });
  const [attachment] = await pdfAttachments(file, 'responses', signal);
  assert.equal(attachment.mime, 'application/pdf');
  assert.equal(Buffer.from(attachment.data, 'base64').length, MAX_AI_PDF_BYTES);
  await assert.rejects(
    () =>
      pdfAttachments(
        new File([new Uint8Array(MAX_AI_PDF_BYTES + 1)], 'resume.pdf'),
        'responses',
        signal,
      ),
    /20 MiB/,
  );
});

test('semantic gateway accepts a full 20 MiB PDF and requests independent source fields', async () => {
  let captured: any;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    captured = JSON.parse(body);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ output_text: 'OK' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const config = {
      endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      protocol: 'responses',
      apiKey: '',
      model: 'synthetic',
    };
    const request = (attachments: { mime: string; data: string }[]) =>
      handleAiRequest({
        path: '/api/ai/generate',
        body: { config, operation: 'semantic', attachments },
        allowLocalProviders: true,
      });
    const encoded = Buffer.alloc(20 * 1024 * 1024).toString('base64');
    const accepted = await request([{ mime: 'application/pdf', data: encoded }]);
    assert.equal(accepted.status, 200);
    assert.ok(captured.instructions.includes('"degree":""'));
    assert.ok(captured.instructions.includes('"gpa":""'));
    assert.ok(captured.instructions.includes('"linkLabel":""'));
    const oversized = await request([
      { mime: 'application/pdf', data: Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64') },
    ]);
    assert.equal(oversized.status, 400);
    const aggregate = await request([
      { mime: 'application/pdf', data: encoded },
      { mime: 'application/pdf', data: encoded },
    ]);
    assert.equal(aggregate.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
