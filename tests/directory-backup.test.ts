import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from '../src/resume/model.ts';
import { serializeResume } from '../src/resume/files.ts';
import {
  DirectoryBackupSession,
  backupFileName,
  MANIFEST_NAME,
  type BackupDirectoryHandle,
  type BackupFileHandle,
} from '../src/storage/directoryBackup.ts';

function directory() {
  const files = new Map<string, string>();
  let permission: PermissionState = 'granted';
  let failName = '';
  let beforeClose: ((name: string) => Promise<void>) | undefined;
  let beforeWrite: ((name: string) => Promise<void>) | undefined;
  const writes: string[] = [];
  const file = (name: string): BackupFileHandle => ({
    kind: 'file',
    name,
    async getFile() {
      const content = files.get(name)!;
      return { size: new TextEncoder().encode(content).length, text: async () => content };
    },
    async createWritable() {
      let pending = '';
      return {
        async write(value) {
          await beforeWrite?.(name);
          if (name === failName) throw new Error('Disk full');
          pending = value;
        },
        async close() {
          await beforeClose?.(name);
          files.set(name, pending);
          writes.push(name);
        },
        async abort() {},
      };
    },
  });
  const handle: BackupDirectoryHandle = {
    name: 'Backups',
    async queryPermission() {
      return permission;
    },
    async requestPermission() {
      permission = 'granted';
      return permission;
    },
    async getFileHandle(name, options) {
      if (!files.has(name)) {
        if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
        files.set(name, '');
      }
      return file(name);
    },
    async *values() {
      for (const name of files.keys()) yield file(name);
    },
    async removeEntry(name) {
      files.delete(name);
    },
  };
  return {
    handle,
    files,
    writes,
    revoke: () => {
      permission = 'denied';
    },
    fail: (name: string) => {
      failName = name;
    },
    pause: (callback: typeof beforeWrite) => {
      beforeWrite = callback;
    },
    close: (callback: typeof beforeClose) => {
      beforeClose = callback;
    },
  };
}

test('backs up changed documents with stable safe filenames and preserves deleted files', async () => {
  const disk = directory();
  const session = new DirectoryBackupSession();
  const doc = createDocument();
  doc.id = '../unsafe/?:'.repeat(8);
  const name = await backupFileName(doc.id);
  assert.match(name, /^luck-[a-f0-9]{64}\.json$/);
  await session.connect(disk.handle, { [doc.id]: doc });
  await session.sync({ [doc.id]: doc });
  assert.equal(JSON.parse(disk.files.get(name)!).resume.id, doc.id);
  await session.sync({ [doc.id]: { ...doc, title: 'Renamed' } });
  assert.equal(JSON.parse(disk.files.get(name)!).resume.title, 'Renamed');
  assert.equal(JSON.parse(disk.files.get(MANIFEST_NAME)!).entries[doc.id].revision, 2);
  const count = disk.writes.length;
  await session.sync({ [doc.id]: { ...doc, title: 'Renamed' } });
  await session.sync({});
  assert.equal(disk.writes.length, count);
  assert.ok(disk.files.has(name));
});

test('reviewed reconciliation keeps original ID and rejects stale files or local drafts', async () => {
  const disk = directory();
  const session = new DirectoryBackupSession();
  const doc = createDocument();
  await session.connect(disk.handle, { [doc.id]: doc });
  await session.sync({ [doc.id]: doc });
  const file = await backupFileName(doc.id);
  const external = { ...doc, title: 'Directory update', updatedAt: '2099-01-01T00:00:00.000Z' };
  disk.files.set(file, serializeResume(external));
  await session.connect(disk.handle, { [doc.id]: doc });
  let applied;
  assert.equal(
    await session.reconcile(file, doc, (next) => {
      applied = next;
      return true;
    }),
    true,
  );
  assert.equal(applied.id, doc.id);
  assert.equal(applied.title, 'Directory update');
  await session.connect(disk.handle, { [doc.id]: doc });
  disk.files.set(file, serializeResume({ ...external, title: 'Changed after preview' }));
  assert.equal(
    await session.reconcile(file, doc, () => {
      throw new Error('Must not apply stale input');
    }),
    false,
  );
});

test('mirror deletion removes only unchanged owned files observed in the current session', async () => {
  const disk = directory();
  const session = new DirectoryBackupSession();
  const doc = createDocument();
  disk.files.set('unrelated.json', '{}');
  await session.connect(disk.handle, { [doc.id]: doc });
  await session.sync({ [doc.id]: doc });
  session.setPolicy('mirror');
  await session.sync({});
  assert.equal(disk.files.has(await backupFileName(doc.id)), false);
  assert.equal(disk.files.has('unrelated.json'), true);
  assert.deepEqual(JSON.parse(disk.files.get(MANIFEST_NAME)!).entries, {});
  const other = createDocument();
  await session.sync({ [other.id]: other });
  disk.files.set(await backupFileName(other.id), 'External edits');
  await session.sync({});
  assert.equal(disk.files.get(await backupFileName(other.id)), 'External edits');
});

test('scans valid and invalid JSON before writing and restores independent document IDs', async () => {
  const disk = directory();
  const doc = createDocument();
  disk.files.set('resume.json', serializeResume(doc));
  disk.files.set('broken.json', '{');
  const session = new DirectoryBackupSession();
  await session.connect(disk.handle, {});
  assert.equal(disk.writes.length, 0);
  assert.equal(session.state().preview.length, 1);
  assert.equal(session.state().scanErrors.length, 1);
  const first = session.restore('resume.json')!;
  const second = session.restore('resume.json')!;
  assert.notEqual(first.id, doc.id);
  assert.notEqual(first.id, second.id);
});

test('never adopts an unrelated filename or overwrites an external edit', async () => {
  const disk = directory();
  const session = new DirectoryBackupSession();
  const doc = createDocument();
  const name = await backupFileName(doc.id);
  disk.files.set(name, serializeResume(doc));
  await session.connect(disk.handle, { [doc.id]: doc });
  await session.sync({ [doc.id]: doc });
  assert.equal(disk.writes.length, 0);
  assert.ok(session.state().error);
  const clean = directory();
  await session.connect(clean.handle, { [doc.id]: doc });
  await session.sync({ [doc.id]: doc });
  clean.files.set(name, 'external');
  await session.sync({ [doc.id]: { ...doc, title: 'Edited' } });
  assert.equal(clean.files.get(name), 'external');
  assert.ok(session.state().error);
});

test('reconnect preserves different local drafts and revoked permission does not prompt automatically', async () => {
  const disk = directory();
  const doc = createDocument();
  const first = new DirectoryBackupSession();
  await first.connect(disk.handle, {});
  await first.sync({ [doc.id]: doc });
  const next = new DirectoryBackupSession();
  const edited = { ...doc, title: 'Stale local draft' };
  await next.connect(disk.handle, { [doc.id]: edited });
  await next.sync({ [doc.id]: edited });
  assert.equal(JSON.parse(disk.files.get(await backupFileName(doc.id))!).resume.title, doc.title);
  disk.revoke();
  await first.sync({ [doc.id]: { ...doc, title: 'New edit' } });
  assert.equal(first.state().permission, 'denied');
});

test('serializes concurrent snapshots and aborts changed files during a staged write', async () => {
  const disk = directory();
  const doc = createDocument();
  const name = await backupFileName(doc.id);
  const session = new DirectoryBackupSession();
  await session.connect(disk.handle, {});
  await session.sync({ [doc.id]: doc });
  await Promise.all([
    session.sync({ [doc.id]: { ...doc, title: 'First' } }),
    session.sync({ [doc.id]: { ...doc, title: 'Latest' } }),
  ]);
  assert.equal(JSON.parse(disk.files.get(name)!).resume.title, 'Latest');
  disk.pause(async (writing) => {
    if (writing === name) disk.files.set(name, 'External race');
  });
  await session.sync({ [doc.id]: { ...doc, title: 'Conflict' } });
  assert.equal(disk.files.get(name), 'External race');
});

test('write failure retains the previous file and manifest revision', async () => {
  const disk = directory();
  const doc = createDocument();
  const name = await backupFileName(doc.id);
  const session = new DirectoryBackupSession();
  await session.connect(disk.handle, {});
  await session.sync({ [doc.id]: doc });
  const saved = disk.files.get(name);
  const manifest = disk.files.get(MANIFEST_NAME);
  disk.fail(name);
  await session.sync({ [doc.id]: { ...doc, title: 'Failure' } });
  assert.equal(disk.files.get(name), saved);
  assert.equal(disk.files.get(MANIFEST_NAME), manifest);
  assert.match(session.state().error, /Disk full/);
});

test('manifest write failure freezes ownership and external manifest edits are preserved', async () => {
  const disk = directory();
  const doc = createDocument();
  const session = new DirectoryBackupSession();
  await session.connect(disk.handle, {});
  disk.fail(MANIFEST_NAME);
  await session.sync({ [doc.id]: doc });
  const count = disk.writes.length;
  await session.sync({ [doc.id]: { ...doc, title: 'Later' } });
  assert.equal(disk.writes.length, count);
  assert.ok(session.state().error);
  const other = directory();
  await session.connect(other.handle, {});
  await session.sync({ [doc.id]: doc });
  other.files.set(MANIFEST_NAME, 'external manifest');
  await session.sync({ [doc.id]: { ...doc, title: 'Later' } });
  assert.equal(other.files.get(MANIFEST_NAME), 'external manifest');
  assert.equal(JSON.parse(other.files.get(await backupFileName(doc.id))!).resume.title, doc.title);
});

test('disconnect cancels an in-flight staged write and picker cancellation leaves the selection intact', async () => {
  const disk = directory();
  const session = new DirectoryBackupSession({
    showDirectoryPicker: async () => {
      throw new DOMException('Cancelled', 'AbortError');
    },
  });
  const doc = createDocument();
  await session.connect(disk.handle, {});
  await session.choose({});
  assert.equal(session.state().name, 'Backups');
  disk.pause(async () => {
    session.disconnect();
  });
  await session.sync({ [doc.id]: doc });
  assert.equal(disk.writes.length, 0);
  assert.equal(session.state().name, null);
});

test('a newer snapshot arriving during a write is backed up next without freezing the document', async () => {
  const disk = directory();
  const session = new DirectoryBackupSession();
  const doc = createDocument();
  await session.connect(disk.handle, {});
  let next: Promise<void> | undefined;
  disk.pause(async (name) => {
    if (name === (await backupFileName(doc.id)) && !next)
      next = session.sync({ [doc.id]: { ...doc, title: 'Latest during write' } });
  });
  await session.sync({ [doc.id]: doc });
  await next;
  assert.equal(
    JSON.parse(disk.files.get(await backupFileName(doc.id))!).resume.title,
    'Latest during write',
  );
  assert.equal(session.state().error, '');
});

test('oversized existing files are never read or replaced', async () => {
  const disk = directory();
  const doc = createDocument();
  const name = await backupFileName(doc.id);
  disk.files.set(name, 'x'.repeat(32 * 1024 * 1024 + 1));
  const session = new DirectoryBackupSession();
  await session.connect(disk.handle, { [doc.id]: doc });
  await session.sync({ [doc.id]: doc });
  assert.equal(disk.writes.length, 0);
  assert.equal(session.state().scanErrors.length, 1);
});

test('backs up document IDs that match Object prototype properties', async () => {
  const disk = directory();
  const session = new DirectoryBackupSession();
  const documents = Object.fromEntries(
    ['__proto__', 'constructor', 'toString'].map((id) => {
      const document = { ...createDocument(), id };
      return [id, document];
    }),
  );
  await session.connect(disk.handle, documents);
  await session.sync(documents);
  for (const document of Object.values(documents)) {
    const name = await backupFileName(document.id);
    assert.equal(JSON.parse(disk.files.get(name)!).resume.id, document.id);
  }
  const next = new DirectoryBackupSession();
  await next.connect(disk.handle, {});
  assert.equal(next.state().error, '');
  assert.equal(next.state().preview.length, 3);
});

test('disconnect invalidates an open directory picker', async () => {
  const disk = directory();
  let picked: ((handle: BackupDirectoryHandle) => void) | undefined;
  const session = new DirectoryBackupSession({
    showDirectoryPicker: () =>
      new Promise((resolve) => {
        picked = resolve;
      }),
  });
  const pending = session.choose({});
  assert.equal(session.state().busy, true);
  session.disconnect();
  picked!(disk.handle);
  assert.equal(await pending, null);
  assert.equal(session.state().name, null);
  assert.equal(disk.writes.length, 0);
});

test('disconnect invalidates a directory connection still checking permission', async () => {
  const disk = directory();
  let checked: ((permission: PermissionState) => void) | undefined;
  disk.handle.queryPermission = () =>
    new Promise((resolve) => {
      checked = resolve;
    });
  const session = new DirectoryBackupSession({ showDirectoryPicker: async () => disk.handle });
  const pending = session.choose({});
  while (!checked) await new Promise((resolve) => setTimeout(resolve, 0));
  session.disconnect();
  checked('granted');
  assert.equal(await pending, null);
  assert.equal(session.state().name, null);
});

test('a late permission request cannot update a disconnected session', async () => {
  const disk = directory();
  const session = new DirectoryBackupSession();
  await session.connect(disk.handle, {});
  let granted: ((permission: PermissionState) => void) | undefined;
  disk.handle.requestPermission = () =>
    new Promise((resolve) => {
      granted = resolve;
    });
  const pending = session.reconnect({});
  session.disconnect();
  granted!('granted');
  await pending;
  assert.equal(session.state().permission, 'prompt');
  assert.equal(session.state().name, null);
});

test('detects external changes even when the local document is unchanged', async () => {
  const disk = directory();
  const document = createDocument();
  const documents = { [document.id]: document };
  const session = new DirectoryBackupSession();
  await session.connect(disk.handle, documents);
  await session.sync(documents);
  const name = await backupFileName(document.id);
  disk.files.set(name, 'External edit');
  await session.sync(documents);
  assert.equal(disk.files.get(name), 'External edit');
  assert.ok(session.state().error);
});

test('keeps generated manifests within the supported directory size', async () => {
  const disk = directory();
  const document = createDocument();
  const documents = Object.fromEntries(
    Array.from({ length: 1001 }, (_, index) => {
      const id = `document-${index}`;
      return [id, { ...document, id }];
    }),
  );
  const session = new DirectoryBackupSession();
  await session.connect(disk.handle, {});
  await session.sync(documents);
  const manifest = JSON.parse(disk.files.get(MANIFEST_NAME)!);
  assert.equal(Object.keys(manifest.entries).length, 1000);
  assert.ok(session.state().error);
  assert.equal(disk.files.size, 1001);
});

test('coordinates sessions through Web Locks before checking their manifest ownership', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  let queue = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request(_name: string, operation: () => Promise<void>) {
        queue = queue.then(operation, operation);
        return queue;
      },
    },
  });
  try {
    const disk = directory();
    disk.close(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const document = createDocument();
    const first = new DirectoryBackupSession();
    const second = new DirectoryBackupSession();
    await first.connect(disk.handle, {});
    await first.sync({ [document.id]: document });
    await second.connect(disk.handle, { [document.id]: document });
    await Promise.all([
      first.sync({ [document.id]: { ...document, title: 'First session' } }),
      second.sync({ [document.id]: { ...document, title: 'Second session' } }),
    ]);
    const saved = JSON.parse(disk.files.get(await backupFileName(document.id))!);
    assert.equal(saved.resume.title, 'First session');
    assert.equal(first.state().error, '');
    assert.ok(second.state().error);
  } finally {
    if (descriptor) Object.defineProperty(navigator, 'locks', descriptor);
    else Reflect.deleteProperty(navigator, 'locks');
  }
});
