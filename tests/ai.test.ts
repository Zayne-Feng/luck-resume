import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { handleAiRequest } from '../server/ai.mjs';
import { defaultSettings, saveSettings, readSettings } from '../src/ai/settings.ts';
import { parseGrammar, parseSemanticResume } from '../src/ai/results.ts';
import { validateDocument } from '../src/resume/files.ts';
import { applyGrammar, grammarFields, grammarSource } from '../src/ai/grammar.ts';
import { createDocument, createEntry, createSection, textContent } from '../src/resume/model.ts';

test('AI credentials use session storage by default and are removed when cleared', () => {
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
      values,
    };
  };
  const local = storage();
  const session = storage();
  const settings = defaultSettings();
  settings.providers.openai.apiKey = 'SYNTHETIC_SECRET';
  saveSettings(settings, local, session);
  assert.ok(![...local.values.values()].join('').includes('SYNTHETIC_SECRET'));
  assert.equal(readSettings(local, session).providers.openai.apiKey, 'SYNTHETIC_SECRET');
  settings.providers.openai.remember = true;
  saveSettings(settings, local, session);
  assert.ok([...local.values.values()].join('').includes('SYNTHETIC_SECRET'));
  assert.ok(![...session.values.values()].join('').includes('SYNTHETIC_SECRET'));
  settings.providers.openai.apiKey = '';
  saveSettings(settings, local, session);
  assert.ok(
    ![...local.values.values(), ...session.values.values()].join('').includes('SYNTHETIC_SECRET'),
  );
});

test('semantic import creates fresh identities and ignores foreign data and credentials', () => {
  const input = JSON.stringify({
    id: 'foreign',
    title: 'Synthetic',
    apiKey: 'SECRET',
    profile: { name: 'Tester', photo: 'https://invalid.test' },
    sections: [
      {
        id: 'foreign-section',
        type: 'experience',
        title: 'Work',
        items: [{ id: 'foreign-entry', title: 'Engineer', description: ['One', 'Two'] }],
      },
    ],
  });
  const first = parseSemanticResume(input);
  const second = parseSemanticResume(input);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.sections[0].items[0].id, second.sections[0].items[0].id);
  assert.equal(textContent(first.sections[0].items[0].description), 'One\nTwo');
  assert.ok(!JSON.stringify(first).includes('SECRET'));
  assert.ok(!JSON.stringify(first).includes('invalid.test'));
  assert.throws(() => parseSemanticResume('{"sections":[]}'));
});

test('semantic import preserves profile extras, labeled custom fields and publication data', () => {
  const result = parseSemanticResume(
    JSON.stringify({
      profile: {
        name: 'Synthetic',
        birthDate: '2000-01',
        employmentStatus: 'Available',
        customFields: [{ label: 'Portfolio', value: 'https://example.test', kind: 'link' }],
      },
      sections: [
        {
          type: 'publications',
          items: [
            {
              title: 'Synthetic Research',
              customFields: [{ label: 'DOI', value: '10.0000/synthetic' }],
              publication: {
                authors: 'A. Tester; B. Tester',
                highlightedAuthor: 'A. Tester',
                venue: 'Synthetic Journal',
                status: 'accepted',
              },
            },
          ],
        },
      ],
    }),
  );
  assert.equal(result.profile.birthday, '2000-01');
  assert.ok(!result.profile.customFields?.some((field) => field.label === 'Birth date'));
  assert.equal(result.profile.employmentStatus, 'Available');
  assert.equal(result.profile.customFields?.[0].kind, 'link');
  assert.equal(result.sections[0].items[0].customFields?.[0].value, '10.0000/synthetic');
  assert.equal(result.sections[0].items[0].publication?.authors, 'A. Tester; B. Tester');
  assert.equal(result.sections[0].items[0].publication?.status, 'accepted');
});

test('semantic import rejects oversized native fields and preserves incomplete birthdays without invented dates', () => {
  assert.throws(
    () => parseSemanticResume(JSON.stringify({ profile: { name: 'x'.repeat(101) }, sections: [] })),
    /length|长度/,
  );
  const partial = parseSemanticResume(
    JSON.stringify({ profile: { name: 'Synthetic', birthday: '1990' }, sections: [] }),
  );
  assert.equal(partial.profile.birthday, '');
  assert.equal(partial.profile.customFields?.[0].value, '1990');
  assert.doesNotThrow(() => validateDocument(partial));
  const valid = parseSemanticResume(
    JSON.stringify({ profile: { name: 'Synthetic', birthday: '1990-02-28' }, sections: [] }),
  );
  assert.equal(valid.profile.birthday, '1990-02-28');
  valid.profile.name = 'x'.repeat(101);
  assert.throws(() => validateDocument(valid));
});

test('grammar validates exact offsets and preserves formatting when accepting a correction', () => {
  const doc = createDocument();
  const section = createSection('experience');
  const entry = createEntry();
  entry.description = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'I has ', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'experience.' },
        ],
      },
    ],
  };
  section.items = [entry];
  doc.sections = [section];
  doc.profile.headline = '';
  const field = grammarFields(doc).find((field) => field.field === 'description')!;
  const suggestions = parseGrammar(
    JSON.stringify({
      suggestions: [
        { original: 'has', replacement: 'have', reason: 'Agreement', start: field.start + 2 },
      ],
    }),
    grammarSource(grammarFields(doc)),
  );
  assert.equal(suggestions.length, 1);
  assert.equal(applyGrammar(doc, field, suggestions[0]), true);
  assert.equal(textContent(entry.description), 'I have experience.');
  assert.equal(entry.description.content?.[0].content?.[0].marks?.[0].type, 'bold');
  assert.equal(applyGrammar(doc, field, suggestions[0]), false);
  doc.profile.headline = 'a'.repeat(300);
  const headline = grammarFields(doc).find((field) => field.field === 'headline')!;
  assert.equal(
    applyGrammar(doc, headline, {
      id: 'limit',
      original: 'a',
      replacement: 'aa',
      reason: 'Synthetic',
      start: 0,
    }),
    false,
  );
  assert.equal(doc.profile.headline.length, 300);
  assert.equal(
    parseGrammar('{"suggestions":[{"original":"x","replacement":"y","start":99}]}', 'x x').length,
    0,
  );
});

test('all four upstream protocols support catalog, connection, visual input and normalized streaming', async () => {
  const received: { url: string; headers: Record<string, unknown>; body: any }[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    received.push({ url: req.url!, headers: req.headers, body });
    if (req.url?.startsWith('/models') && !req.url.includes(':')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: [{ id: 'stub-model' }] }));
      return;
    }
    const protocol = req.url?.includes(':')
      ? 'gemini'
      : req.url?.endsWith('/messages')
        ? 'anthropic'
        : req.url?.endsWith('/responses')
          ? 'responses'
          : 'chat';
    if (body.stream || req.url?.includes('streamGenerateContent')) {
      res.setHeader('Content-Type', 'text/event-stream');
      const event =
        protocol === 'chat'
          ? { choices: [{ delta: { content: 'Synthetic ' } }] }
          : protocol === 'responses'
            ? { type: 'response.output_text.delta', delta: 'Synthetic ' }
            : protocol === 'anthropic'
              ? { type: 'content_block_delta', delta: { text: 'Synthetic ' } }
              : { candidates: [{ content: { parts: [{ text: 'Synthetic ' }] } }] };
      res.write(`data: ${JSON.stringify(event)}\r\n\r\n`);
      if (protocol === 'chat')
        res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
      else if (protocol === 'anthropic')
        res.write('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n');
      const terminal =
        protocol === 'chat'
          ? '[DONE]'
          : JSON.stringify(
              protocol === 'responses'
                ? { type: 'response.completed' }
                : protocol === 'anthropic'
                  ? { type: 'message_stop' }
                  : { candidates: [{ finishReason: 'STOP' }] },
            );
      res.end(`data: ${terminal}\n\n`);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify(
          protocol === 'chat'
            ? { choices: [{ message: { content: 'OK' } }] }
            : protocol === 'responses'
              ? { output: [{ content: [{ type: 'output_text', text: 'OK' }] }] }
              : protocol === 'anthropic'
                ? { content: [{ type: 'text', text: 'OK' }] }
                : { candidates: [{ content: { parts: [{ text: 'OK' }] } }] },
        ),
      );
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  const endpoint = `http://127.0.0.1:${address.port}`;
  try {
    for (const protocol of ['chat', 'responses', 'anthropic', 'gemini']) {
      const config = { endpoint, protocol, apiKey: 'synthetic-key', model: 'stub-model' };
      const request = (path: string, body: any) =>
        handleAiRequest({
          path: `/api/ai/${path}`,
          body: { config, ...body },
          allowLocalProviders: true,
        });
      const models = await request('models', {});
      assert.equal(models.status, 200);
      assert.equal((await models.json()).models[0].id, 'stub-model');
      const connection = await request('test', {});
      assert.equal(connection.status, 200);
      assert.equal((await connection.json()).text, 'OK');
      const vision = await request('test', {
        vision: true,
        attachments: [{ mime: 'image/png', data: 'YWJj' }],
      });
      assert.equal(vision.status, 200);
      const visualRequest = received.at(-1)!;
      assert.ok(JSON.stringify(visualRequest.body).includes('YWJj'));
      assert.ok(!JSON.stringify(visualRequest.body).includes('synthetic-key'));
      const generation = await request('generate', {
        operation: 'polish',
        text: 'Synthetic field',
        stream: true,
      });
      assert.equal(generation.status, 200);
      const streamed = await generation.text();
      assert.ok(streamed.includes('Synthetic '));
      assert.ok(streamed.includes('"done":true'));
      if (protocol === 'responses') assert.equal(received.at(-1)!.body.store, false);
    }
    const blocked = await handleAiRequest({
      path: '/api/ai/test',
      body: { config: { endpoint, protocol: 'chat', apiKey: '', model: 'stub-model' } },
    });
    assert.equal(blocked.status, 400);
    const unsupported = await handleAiRequest({
      path: '/api/ai/generate',
      body: {
        config: { endpoint, protocol: 'chat', apiKey: '', model: 'stub-model' },
        operation: 'semantic',
        attachments: [{ mime: 'application/pdf', data: 'YWJj' }],
      },
      allowLocalProviders: true,
    });
    assert.equal(unsupported.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Orca PKCE exchanges a synthetic code using discovery and never returns verifier', async () => {
  let received: any;
  const old = process.env.LUCK_ORCA_ISSUER;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/.well-known/openid-configuration') {
      const origin = `http://${req.headers.host}`;
      res.end(
        JSON.stringify({
          authorization_endpoint: `${origin}/auth`,
          token_endpoint: `${origin}/token`,
        }),
      );
    } else {
      let body = '';
      for await (const chunk of req) body += chunk;
      received = JSON.parse(body);
      res.end(JSON.stringify({ key: 'synthetic-oauth-key', scope: 'api' }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  process.env.LUCK_ORCA_ISSUER = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const verifier = 'a'.repeat(64);
    const result = await handleAiRequest({
      path: '/api/ai/oauth/exchange',
      body: { code: 'synthetic-code', verifier },
      allowLocalProviders: true,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { key: 'synthetic-oauth-key' });
    assert.equal(received.code_verifier, verifier);
    assert.equal(received.code_challenge_method, 'S256');
  } finally {
    if (old === undefined) delete process.env.LUCK_ORCA_ISSUER;
    else process.env.LUCK_ORCA_ISSUER = old;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('streaming rejects truncated output and native provider errors', async () => {
  let content = '';
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.end(content);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const [protocol, frame] of [
      ['chat', { choices: [{ delta: { content: 'Partial' } }] }],
      ['responses', { type: 'response.output_text.delta', delta: 'Partial' }],
      ['anthropic', { type: 'content_block_delta', delta: { text: 'Partial' } }],
      ['gemini', { candidates: [{ content: { parts: [{ text: 'Partial' }] } }] }],
    ] as const) {
      content = `data: ${JSON.stringify(frame)}\n\n`;
      const response = await handleAiRequest({
        path: '/api/ai/generate',
        body: {
          config: { endpoint, protocol, model: 'stub', apiKey: '' },
          operation: 'polish',
          text: 'Synthetic',
          stream: true,
        },
        allowLocalProviders: true,
      });
      const output = await response.text();
      assert.ok(output.includes('Partial'));
      assert.ok(output.includes('"error":'));
      assert.ok(!output.includes('"done":true'));
    }
    content = 'data: {"type":"error","error":{"message":"Synthetic provider failure"}}\n\n';
    const response = await handleAiRequest({
      path: '/api/ai/generate',
      body: {
        config: { endpoint, protocol: 'anthropic', model: 'stub', apiKey: '' },
        operation: 'polish',
        text: 'Synthetic',
        stream: true,
      },
      allowLocalProviders: true,
    });
    assert.ok((await response.text()).includes('"error":'));
    for (const [protocol, event, terminal] of [
      ['chat', { choices: [{ delta: { content: 'Partial' }, finish_reason: 'length' }] }, '[DONE]'],
      ['responses', { type: 'response.incomplete' }, { type: 'response.completed' }],
      [
        'anthropic',
        { type: 'message_delta', delta: { stop_reason: 'max_tokens' } },
        { type: 'message_stop' },
      ],
      [
        'gemini',
        { candidates: [{ finishReason: 'MAX_TOKENS' }] },
        { candidates: [{ finishReason: 'STOP' }] },
      ],
    ] as const) {
      content = `data: ${JSON.stringify(event)}\n\ndata: ${typeof terminal === 'string' ? terminal : JSON.stringify(terminal)}\n\n`;
      const limited = await handleAiRequest({
        path: '/api/ai/generate',
        body: {
          config: { endpoint, protocol, model: 'stub', apiKey: '' },
          operation: 'polish',
          text: 'Synthetic',
          stream: true,
        },
        allowLocalProviders: true,
      });
      const output = await limited.text();
      assert.ok(output.includes('"error":'));
      assert.ok(!output.includes('"done":true'));
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
