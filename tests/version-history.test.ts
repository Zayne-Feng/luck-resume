import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/resume/model.ts';
import { compareVersions } from '../src/resume/versionDiff.ts';
import {
  parseVersionHistory,
  pruneAutomaticVersions,
  restoreVersionDocument,
  serializeVersionHistory,
  validateVersion,
  versionContent,
} from '../src/storage/versionHistory.ts';

test('history archives reject unsupported envelopes before any write', () => {
  assert.throws(() => parseVersionHistory('{"format":"other","versions":[]}'));
  assert.throws(() =>
    parseVersionHistory('{"format":"luck-version-history","version":1,"versions":[{}]}'),
  );
});

test('an oversized newest automatic checkpoint cannot evict the previous history', () => {
  const document = createDocument();
  const row = {
    id: 'large',
    documentId: document.id,
    document,
    createdAt: '2026-11-15T00:00:00.000Z',
    kind: 'automatic' as const,
    name: '',
    bytes: 49 * 1024 * 1024,
  };
  const previous = { ...row, id: 'previous', createdAt: '2026-11-14T00:00:00.000Z', bytes: 1024 };
  assert.throws(() => pruneAutomaticVersions([row, previous]), /48 MB/);
});

test('export limits match import limits and invalid native records reject synchronously', () => {
  assert.throws(() => serializeVersionHistory(Array.from({ length: 1001 }) as never), /1000/);
  assert.throws(() => validateVersion({ id: 'corrupt' }));
});

test('automatic retention preserves named and safety checkpoints', () => {
  const rows = Array.from({ length: 35 }, (_, index) => ({
    id: String(index),
    kind: 'automatic',
    bytes: 1,
    createdAt: String(index).padStart(3, '0'),
  }));
  const named = { id: 'named', kind: 'named', bytes: 99999999, createdAt: '000' };
  const result = pruneAutomaticVersions([...rows, named] as never);
  assert.equal(result.length, 5);
  assert.ok(!result.includes('named'));
});

test('restore preserves current identity and creation timestamp', () => {
  const restored = restoreVersionDocument(
    { id: 'old', createdAt: 'old', title: 'Snapshot' } as never,
    { id: 'current', createdAt: 'current' } as never,
  );
  assert.equal(restored.id, 'current');
  assert.equal(restored.createdAt, 'current');
  assert.equal(restored.title, 'Snapshot');
});

test('archive validation recomputes sizes and rejects mismatched document identities', () => {
  const document = createDocument();
  const row = {
    id: 'version',
    documentId: document.id,
    createdAt: new Date().toISOString(),
    name: 'Named',
    kind: 'named' as const,
    document,
    bytes: 0,
  };
  const parsed = parseVersionHistory(serializeVersionHistory([row]));
  assert.ok(parsed[0].bytes > 0);
  assert.deepEqual(parsed[0].document, document);
  assert.throws(() =>
    parseVersionHistory(serializeVersionHistory([{ ...row, documentId: 'other' }])),
  );
});

test('automatic retention bounds byte usage while preserving explicit snapshots', () => {
  const rows = [
    { id: 'new', createdAt: '003', bytes: 30 * 1024 * 1024, kind: 'automatic' },
    { id: 'old', createdAt: '002', bytes: 30 * 1024 * 1024, kind: 'automatic' },
    { id: 'safe', createdAt: '001', bytes: 30 * 1024 * 1024, kind: 'safety' },
  ];
  assert.deepEqual(pruneAutomaticVersions(rows as never), ['old']);
});

test('checkpoint content comparison ignores modification time only', () => {
  const document = createDocument();
  assert.equal(versionContent(document), versionContent({ ...document, updatedAt: 'later' }));
  assert.notEqual(versionContent(document), versionContent({ ...document, title: 'Changed' }));
});

test('readable comparison identifies fields, added sections and style changes', () => {
  const current = createDocument();
  const snapshot = structuredClone(current);
  snapshot.profile.name = 'Different name';
  snapshot.appearance.fontSize += 1;
  snapshot.sections = [
    { id: 'new', title: 'New section', type: 'custom', visible: false, columns: 1, items: [] },
  ];
  const rows = compareVersions(current, snapshot);
  assert.ok(rows.some((row) => row.label === '姓名' && row.after === 'Different name'));
  assert.ok(rows.some((row) => row.label === '新增章节' && row.after === 'New section'));
  assert.ok(rows.some((row) => row.label === '字号'));
  assert.ok(rows.every((row) => row.before.length <= 240 && row.after.length <= 240));
});
