import assert from 'node:assert/strict';
import test from 'node:test';
import { cloneDocument, createDocument, richText, safeLink } from '../src/resume/model.ts';
import {
  parseResumeFile,
  parseRecoveryFile,
  serializeResume,
  createRecoveryFiles,
} from '../src/resume/files.ts';

test('JSON backup preserves content, appearance, and embedded photo with a new identity', () => {
  const source = createDocument('column', true);
  source.profile.photo = 'data:image/png;base64,aGVsbG8=';
  const restored = parseResumeFile(serializeResume(source));
  assert.notEqual(restored.id, source.id);
  assert.deepEqual(restored.profile, source.profile);
  assert.deepEqual(restored.sections, source.sections);
  assert.deepEqual(restored.appearance, source.appearance);
});

test('blank documents have distinct identities and no example content', () => {
  const a = createDocument('linen', false);
  const b = createDocument('linen', false);
  assert.notEqual(a.id, b.id);
  assert.equal(a.profile.name, '');
  assert.equal(a.sections.find((section) => section.type === 'experience')?.items.length, 0);
});

test('rejects unsupported schema versions and unrelated JSON', () => {
  assert.throws(() => parseResumeFile('{"format":"luck-resume","version":99}'), /版本/);
  assert.throws(() => parseResumeFile('{"name":"other"}'), /幸运简历/);
  assert.throws(() => parseResumeFile('broken'), /JSON/);
});

test('rejects unsafe links, remote photos, invalid colors, and duplicate identifiers', () => {
  for (const mutate of [
    (doc: ReturnType<typeof createDocument>) => {
      doc.profile.photo = 'https://example.com/photo.png';
    },
    (doc: ReturnType<typeof createDocument>) => {
      doc.appearance.accent = 'red; background:url(https://example.com)';
    },
    (doc: ReturnType<typeof createDocument>) => {
      doc.sections[1].id = doc.sections[0].id;
    },
    (doc: ReturnType<typeof createDocument>) => {
      doc.appearance.fontSize = 100;
    },
  ]) {
    const doc = createDocument('linen', true);
    mutate(doc);
    assert.throws(() => parseResumeFile(serializeResume(doc)));
  }
});

test('rejects executable rich text and allows safe formatting', () => {
  const doc = createDocument('linen', true);
  doc.sections[0].items[0].description = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Portfolio',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    ],
  };
  assert.throws(() => parseResumeFile(serializeResume(doc)), /链接/);
  doc.sections[0].items[0].description.content![0].content![0].marks = [{ type: 'bold' }];
  assert.equal(
    parseResumeFile(serializeResume(doc)).sections[0].items[0].description.content![0].content![0]
      .marks![0].type,
    'bold',
  );
});

test('partial website addresses remain editable through backup and restore', () => {
  const source = createDocument();
  source.profile.website = 'https://';
  source.sections[0].items[0].link = 'my-portfolio';
  const restored = parseResumeFile(serializeResume(source));
  assert.equal(restored.profile.website, 'https://');
  assert.equal(restored.sections[0].items[0].link, 'my-portfolio');
});

test('long descriptions and copied maximum-length titles remain recoverable', () => {
  const source = createDocument();
  source.title = 'A'.repeat(200);
  source.sections[0].items[0].description = richText('Long description '.repeat(2000));
  const restored = parseResumeFile(serializeResume(cloneDocument(source)));
  assert.ok(restored.title.length <= 200);
  assert.deepEqual(restored.sections, source.sections);
});

test('unsafe display addresses stay inert text without breaking a backup', () => {
  const source = createDocument();
  source.profile.website = 'javascript:alert(1)';
  const restored = parseResumeFile(serializeResume(source));
  assert.equal(restored.profile.website, source.profile.website);
  assert.equal(safeLink(restored.profile.website), undefined);
});

test('ordered list start survives a JSON round trip and invalid starts are rejected', () => {
  const source = createDocument();
  const list = {
    type: 'orderedList',
    attrs: { start: 5 },
    content: [
      {
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fifth' }] }],
      },
    ],
  };
  source.sections[0].items[0].description = { type: 'doc', content: [list] };
  const restored = parseResumeFile(serializeResume(source));
  assert.equal(restored.sections[0].items[0].description.content![0].attrs?.start, 5);
  for (const start of [0.5, '5', Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = JSON.parse(serializeResume(source));
    invalid.resume.sections[0].items[0].description.content[0].attrs.start = start;
    assert.throws(() => parseResumeFile(JSON.stringify(invalid)));
  }
});

test('recovery isolates invalid records and gives each valid document a fresh identity', () => {
  const source = createDocument();
  const broken = {
    id: 'broken',
    data: { document: { title: 'Incomplete' } },
    reason: 'Invalid record',
  };
  const result = parseRecoveryFile(
    JSON.stringify({
      format: 'luck-resume-recovery',
      version: 1,
      drafts: [
        {
          id: source.id,
          data: { id: 'wrong-index', revision: -1, document: source },
          reason: 'Invalid index',
        },
        broken,
        { id: source.id, data: { document: source }, reason: 'Duplicate source' },
      ],
    }),
  );
  assert.equal(result.documents.length, 2);
  assert.deepEqual(result.documents[0].sections, source.sections);
  assert.notEqual(result.documents[0].id, source.id);
  assert.notEqual(result.documents[0].id, result.documents[1].id);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(result.failures[0].record, broken);
  assert.ok(result.failures[0].reason);
});

test('recovery rejects unsupported envelopes and retains unsafe records without importing them', () => {
  assert.throws(
    () => parseRecoveryFile('{"format":"luck-resume-recovery","version":2,"drafts":[]}'),
    /版本/,
  );
  assert.throws(() => parseRecoveryFile('{"format":"other","version":1,"drafts":[]}'));
  const source = createDocument();
  source.profile.photo = 'https://example.com/remote.png';
  const result = parseRecoveryFile(
    JSON.stringify({
      format: 'luck-resume-recovery',
      version: 1,
      drafts: [{ id: source.id, data: { document: source }, reason: 'Unsafe image' }, null],
    }),
  );
  assert.equal(result.documents.length, 0);
  assert.equal(result.failures.length, 2);
});

test('recovery files split on byte and record limits without dropping source records', async () => {
  const source = createDocument();
  const draft = { id: source.id, data: { document: source }, reason: 'Index damaged' };
  const size = new TextEncoder().encode(JSON.stringify(draft)).length;
  const files = createRecoveryFiles([draft, draft, draft], size + 200);
  assert.equal(files.length, 3);
  for (const file of files) {
    assert.ok(file.blob.size <= size + 200);
    assert.equal(file.canImport, true);
    assert.equal(parseRecoveryFile(await file.blob.text()).documents.length, 1);
  }
  const many = createRecoveryFiles(Array(1001).fill(null));
  assert.equal(many.length, 2);
  assert.equal(parseRecoveryFile(await many[0].blob.text()).failures.length, 1000);
  assert.equal(parseRecoveryFile(await many[1].blob.text()).failures.length, 1);
  const oversized = createRecoveryFiles([draft, null], 200);
  assert.equal(oversized[0].canImport, false);
  assert.equal(oversized[1].canImport, true);
});

test('recovery accepts a batch larger than a single resume file', () => {
  const source = createDocument();
  source.profile.photo = 'data:image/png;base64,' + 'AAAA'.repeat(750000);
  const draft = { data: { document: source } };
  const result = parseRecoveryFile(
    JSON.stringify({ format: 'luck-resume-recovery', version: 1, drafts: [draft, draft, draft] }),
  );
  assert.equal(result.documents.length, 3);
});
