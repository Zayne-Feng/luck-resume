import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/resume/model.ts';

import * as backup from '../src/storage/workspaceBackup.ts';

test('workspace backup splits and reassembles content, presets and history without credentials', async () => {
  assert.equal(typeof backup.createWorkspaceBackup, 'function');
  const doc = createDocument('linen', true);
  const now = new Date().toISOString();
  const preset = {
    id: 'preset',
    name: 'Personal',
    createdAt: now,
    updatedAt: now,
    appearance: doc.appearance,
    token: 'SECRET',
  };
  const version = {
    id: 'version',
    documentId: doc.id,
    document: doc,
    createdAt: now,
    kind: 'named',
    name: 'Before',
    bytes: 0,
    token: 'SECRET',
  };
  const parts = backup.createWorkspaceBackup(
    { documents: [doc], presets: [preset], versions: [version] },
    4096,
  );
  const texts = await Promise.all(parts.map((part: { blob: Blob }) => part.blob.text()));
  assert.ok(parts.length > 1);
  assert.equal(
    texts.some((value: string) => value.includes('SECRET')),
    false,
  );
  const restored = backup.parseWorkspaceBackup(texts.reverse());
  assert.deepEqual(restored.documents, [doc]);
  assert.equal(restored.presets[0].name, 'Personal');
  assert.equal(restored.versions[0].document.profile.name, doc.profile.name);
});

test('workspace import rejects missing/duplicate parts and inconsistent records before writes', async () => {
  assert.equal(typeof backup.createWorkspaceBackup, 'function');
  const docs = [createDocument('linen', true), createDocument('mono', true)];
  const parts = backup.createWorkspaceBackup({ documents: docs, presets: [], versions: [] }, 4096);
  const texts = await Promise.all(parts.map((part: { blob: Blob }) => part.blob.text()));
  assert.throws(() => backup.parseWorkspaceBackup(texts.slice(1)));
  assert.throws(() => backup.parseWorkspaceBackup([...texts, texts[0]]));
  const bad = JSON.parse(texts[0]);
  bad.records[0].value.profile.photo = 'https://example.com/private.png';
  assert.throws(() => backup.parseWorkspaceBackup([JSON.stringify(bad), ...texts.slice(1)]));
});

test('workspace backup preserves record order with shuffled parts and rejects duplicate identities', async () => {
  const documents = [createDocument('linen', true), createDocument('mono', true)];
  const texts = await Promise.all(
    backup
      .createWorkspaceBackup({ documents, presets: [], versions: [] }, 512)
      .map((part: { blob: Blob }) => part.blob.text()),
  );
  assert.deepEqual(backup.parseWorkspaceBackup(texts.reverse()).documents, documents);
  assert.throws(() =>
    backup.createWorkspaceBackup({
      documents: [documents[0], documents[0]],
      presets: [],
      versions: [],
    }),
  );
  const part = JSON.parse(texts[0]);
  part.backupId = 'other-backup';
  assert.throws(() => backup.parseWorkspaceBackup([JSON.stringify(part), ...texts.slice(1)]));
  part.backupId = JSON.parse(texts[1]).backupId;
  part.records[0].kind = 'credentials';
  assert.throws(() => backup.parseWorkspaceBackup([JSON.stringify(part), ...texts.slice(1)]));
});

test('workspace backup validates version identity and strips nested extra metadata', async () => {
  const document = createDocument();
  const version = {
    id: 'version',
    documentId: document.id,
    document,
    createdAt: new Date().toISOString(),
    kind: 'named',
    name: 'Snapshot',
    bytes: 0,
  };
  assert.throws(() =>
    backup.createWorkspaceBackup({
      documents: [],
      presets: [],
      versions: [{ ...version, documentId: 'other' }],
    }),
  );
  const dirty = {
    ...document,
    credential: 'SECRET',
    profile: { ...document.profile, token: 'SECRET' },
    appearance: { ...document.appearance, password: 'SECRET' },
  };
  const parts = backup.createWorkspaceBackup({ documents: [dirty], presets: [], versions: [] });
  assert.equal((await parts[0].blob.text()).includes('SECRET'), false);
  await assert.rejects(
    backup.importWorkspaceBackup({ documents: [document, document], presets: [], versions: [] }),
  );
});

test('workspace merge includes other tabs and preserves concurrent unsaved content as a copy', () => {
  assert.equal(typeof backup.mergeWorkspaceBackupDocuments, 'function');
  const saved = createDocument();
  const remote = { ...saved, title: 'Remote edit' };
  const dirty = { ...saved, title: 'Local edit' };
  const added = createDocument();
  const deleted = createDocument();
  const fresh = createDocument();
  const rows = [
    { id: saved.id, document: remote, revision: 3 },
    { id: added.id, document: added, revision: 1 },
  ];
  const merged = backup.mergeWorkspaceBackupDocuments(
    rows,
    [dirty, deleted, fresh],
    { [saved.id]: 2, [deleted.id]: 1 },
    { [saved.id]: 'conflict', [deleted.id]: 'saved', [fresh.id]: 'pending' },
    'Unsaved copy',
  );
  assert.equal(merged.length, 4);
  assert.deepEqual(
    merged.find((doc: any) => doc.id === saved.id),
    remote,
  );
  const copy = merged.find((doc: any) => doc.title === 'Local edit (Unsaved copy)');
  assert.ok(copy);
  assert.notEqual(copy.id, saved.id);
  assert.ok(merged.some((doc: any) => doc.id === added.id));
  assert.ok(merged.some((doc: any) => doc.id === fresh.id));
  assert.ok(!merged.some((doc: any) => doc.id === deleted.id));
  assert.deepEqual(
    backup.mergeWorkspaceBackupDocuments(
      rows,
      [dirty],
      { [saved.id]: 3 },
      { [saved.id]: 'pending' },
      'Copy',
    )[0],
    dirty,
  );
  assert.deepEqual(
    backup.mergeWorkspaceBackupDocuments(
      rows,
      [saved],
      { [saved.id]: 2 },
      { [saved.id]: 'saved' },
      'Copy',
    )[0],
    remote,
  );
  assert.equal(
    backup.mergeWorkspaceBackupDocuments(
      rows,
      [remote],
      { [saved.id]: 2 },
      { [saved.id]: 'pending' },
      'Copy',
    ).length,
    2,
  );
  assert.deepEqual(
    backup.mergeWorkspaceBackupDocuments(
      rows,
      [dirty],
      { [saved.id]: 4 },
      { [saved.id]: 'saved' },
      'Copy',
    )[0],
    dirty,
  );
});

test('workspace merge retains a new draft captured before its initial save completes', async () => {
  const document = createDocument();
  const state = {
    documents: { [document.id]: document },
    revisions: { [document.id]: 0 },
    statuses: { [document.id]: 'pending' },
  };
  let current = state;
  const captured = current;
  const stored = await Promise.resolve().then(() => {
    current = { ...state, revisions: { [document.id]: 1 }, statuses: { [document.id]: 'saved' } };
    return [];
  });
  assert.equal(current.statuses[document.id], 'saved');
  assert.deepEqual(
    backup.mergeWorkspaceBackupDocuments(
      stored,
      Object.values(captured.documents),
      captured.revisions,
      captured.statuses,
      'Copy',
    ),
    [document],
  );
});
