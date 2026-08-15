import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, richText } from '../src/resume/model.ts';
import { MAX_FILE_BYTES, serializeResume, validateDocument } from '../src/resume/files.ts';
import {
  LocalFileSession,
  type LocalFileHandle,
  type LocalFilePickers,
} from '../src/storage/localFile.ts';

function fileHandle(initial: string, name = 'resume.json') {
  let content = initial;
  let writableCount = 0;
  let failure = false;
  let beforeClose: (() => Promise<void>) | undefined;
  let afterWrite: (() => void) | undefined;
  let abortCount = 0;
  const handle: LocalFileHandle = {
    name,
    async getFile() {
      const snapshot = content;
      return { size: new TextEncoder().encode(snapshot).length, text: async () => snapshot };
    },
    async createWritable() {
      writableCount++;
      let pending = content;
      return {
        async write(value) {
          if (failure) throw new Error('Disk unavailable');
          pending = value;
          afterWrite?.();
        },
        async close() {
          await beforeClose?.();
          content = pending;
        },
        async abort() {
          abortCount++;
        },
      };
    },
  };
  return {
    handle,
    content: () => content,
    writableCount: () => writableCount,
    abortCount: () => abortCount,
    afterWrite: (callback: (() => void) | undefined) => {
      afterWrite = callback;
    },
    replace: (value: string) => {
      content = value;
    },
    fail: (value: boolean) => {
      failure = value;
    },
    pauseClose: (callback: () => Promise<void>) => {
      beforeClose = callback;
    },
  };
}

function pickers(handle: LocalFileHandle): LocalFilePickers {
  return {
    showOpenFilePicker: async () => [handle],
    showSaveFilePicker: async () => handle,
  };
}

test('opening JSON imports a fresh document and associates its file without writing', async () => {
  const source = createDocument();
  source.profile.name = 'Alice';
  const disk = fileHandle(serializeResume(source));
  const session = new LocalFileSession(pickers(disk.handle));
  const opened = await session.open();
  assert.ok(opened);
  assert.notEqual(opened.id, source.id);
  assert.equal(opened.profile.name, 'Alice');
  assert.equal(session.state(opened).name, 'resume.json');
  assert.equal(session.state(opened).dirty, false);
  assert.equal(disk.writableCount(), 0);
});

test('successive explicit saves update the file and the expected external fingerprint', async () => {
  const disk = fileHandle(serializeResume(createDocument()));
  const session = new LocalFileSession(pickers(disk.handle));
  const opened = (await session.open())!;
  const edited = { ...opened, title: 'First edit' };
  assert.equal(session.state(edited).dirty, true);
  assert.equal(await session.save(edited), true);
  assert.equal(JSON.parse(disk.content()).resume.title, 'First edit');
  assert.equal(session.state(edited).dirty, false);
  assert.equal(await session.save({ ...edited, title: 'Second edit' }), true);
  assert.equal(JSON.parse(disk.content()).resume.title, 'Second edit');
  assert.equal(disk.writableCount(), 2);
});

test('external changes are rejected before opening a writable stream', async () => {
  const disk = fileHandle(serializeResume(createDocument()));
  const session = new LocalFileSession(pickers(disk.handle));
  const opened = (await session.open())!;
  disk.replace('External content');
  assert.equal(await session.save({ ...opened, title: 'Draft' }), false);
  assert.match(session.state(opened).error, /外部/);
  assert.equal(disk.content(), 'External content');
  assert.equal(disk.writableCount(), 0);
});

test('external changes during writing abort the staged save and preserve the binding', async () => {
  const original = serializeResume(createDocument());
  const disk = fileHandle(original);
  const session = new LocalFileSession(pickers(disk.handle));
  const opened = (await session.open())!;
  const draft = { ...opened, title: 'Unsaved draft' };
  disk.afterWrite(() => disk.replace('External edit'));

  assert.equal(await session.save(draft), false);
  assert.equal(disk.content(), 'External edit');
  assert.equal(disk.abortCount(), 1);
  assert.equal(session.state(draft).name, 'resume.json');
  assert.equal(session.state(draft).dirty, true);
  assert.match(session.state(draft).error, /\u5916\u90e8/);

  disk.afterWrite(undefined);
  disk.replace(original);
  assert.equal(await session.save(draft), true);
  assert.equal(JSON.parse(disk.content()).resume.title, 'Unsaved draft');
});

test('write failure preserves the file, association, and unsaved draft', async () => {
  const original = serializeResume(createDocument());
  const disk = fileHandle(original);
  const session = new LocalFileSession(pickers(disk.handle));
  const opened = (await session.open())!;
  const edited = { ...opened, title: 'Draft' };
  disk.fail(true);
  assert.equal(await session.save(edited), false);
  assert.equal(disk.content(), original);
  assert.equal(session.state(edited).dirty, true);
  assert.equal(session.state(edited).name, 'resume.json');
  disk.fail(false);
  assert.equal(await session.save(edited), true);
});

test('overlapping saves are rejected and edits made during saving stay unsaved', async () => {
  const disk = fileHandle(serializeResume(createDocument()));
  const session = new LocalFileSession(pickers(disk.handle));
  const opened = (await session.open())!;
  let release!: () => void;
  let entered!: () => void;
  const closing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  disk.pauseClose(async () => {
    entered();
    await pending;
  });
  const first = session.save({ ...opened, title: 'Saved snapshot' });
  await closing;
  const newest = { ...opened, title: 'Newer draft' };
  assert.equal(session.state(newest).busy, true);
  assert.equal(await session.save(newest), false);
  session.disconnect(opened.id);
  assert.equal(session.state(newest).name, 'resume.json');
  release();
  assert.equal(await first, true);
  assert.equal(JSON.parse(disk.content()).resume.title, 'Saved snapshot');
  assert.equal(session.state(newest).dirty, true);
  assert.equal(disk.writableCount(), 1);
});

test('save-as invokes the picker synchronously and links only the captured document', async () => {
  const disk = fileHandle('');
  let pickerCalled = false;
  const session = new LocalFileSession({
    ...pickers(disk.handle),
    showSaveFilePicker: () => {
      pickerCalled = true;
      return Promise.resolve(disk.handle);
    },
  });
  const first = createDocument();
  first.title = 'First document';
  const next = createDocument();
  const saving = session.saveAs(first);
  assert.equal(pickerCalled, true);
  assert.equal(await saving, true);
  assert.equal(session.state(first).name, 'resume.json');
  assert.equal(session.state(next).name, null);
  assert.equal(JSON.parse(disk.content()).resume.id, first.id);
  session.disconnect(first.id);
  assert.equal(session.state(first).name, null);
});

test('cancelled picker and stale open leave associations untouched', async () => {
  const disk = fileHandle(serializeResume(createDocument()));
  const session = new LocalFileSession(pickers(disk.handle));
  assert.equal(await session.open(() => false), null);
  const cancelled = new LocalFileSession({
    ...pickers(disk.handle),
    showOpenFilePicker: async () => {
      throw new DOMException('Cancelled', 'AbortError');
    },
  });
  assert.equal(await cancelled.open(), null);
  assert.equal(cancelled.state(null).error, '');
  assert.equal(disk.writableCount(), 0);
});

test('denied write permission never opens a writable stream', async () => {
  const disk = fileHandle(serializeResume(createDocument()));
  disk.handle.requestPermission = async () => 'denied';
  const session = new LocalFileSession(pickers(disk.handle));
  const opened = (await session.open())!;
  assert.equal(await session.save(opened), false);
  assert.equal(disk.writableCount(), 0);
  assert.match(session.state(opened).error, /权限/);
});

test('save-as failure keeps the previous association and file intact', async () => {
  const previous = fileHandle(serializeResume(createDocument()), 'previous.json');
  const target = fileHandle('Target content', 'target.json');
  target.fail(true);
  const session = new LocalFileSession({
    ...pickers(previous.handle),
    showSaveFilePicker: async () => target.handle,
  });
  const opened = (await session.open())!;
  assert.equal(await session.saveAs({ ...opened, title: 'Draft' }), false);
  assert.equal(session.state(opened).name, 'previous.json');
  assert.equal(target.content(), 'Target content');
});

test('save-as to the linked file still rejects externally changed content', async () => {
  const disk = fileHandle(serializeResume(createDocument()));
  const session = new LocalFileSession(pickers(disk.handle));
  const opened = (await session.open())!;
  disk.replace('External edit');
  assert.equal(await session.saveAs({ ...opened, title: 'Draft' }), false);
  assert.equal(disk.content(), 'External edit');
  assert.equal(disk.writableCount(), 0);
});

test('another document cannot write the same file while its stream is pending', async () => {
  const disk = fileHandle(serializeResume(createDocument()));
  const session = new LocalFileSession(pickers(disk.handle));
  const first = (await session.open())!;
  const second = (await session.open())!;
  let release!: () => void;
  let entered!: () => void;
  const closing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  disk.pauseClose(async () => {
    entered();
    await pending;
  });
  const saving = session.save({ ...first, title: 'First draft' });
  await closing;
  const overlapping = session.save({ ...second, title: 'Second draft' });
  release();
  assert.equal(await saving, true);
  assert.equal(await overlapping, false);
  assert.equal(disk.writableCount(), 1);
  assert.equal(JSON.parse(disk.content()).resume.title, 'First draft');
});

test('native handles for the same entry retain external conflict detection on save-as', async () => {
  const disk = fileHandle(serializeResume(createDocument()));
  const alias: LocalFileHandle = {
    ...disk.handle,
    isSameEntry: async (other) => other === disk.handle,
  };
  const session = new LocalFileSession({
    ...pickers(disk.handle),
    showSaveFilePicker: async () => alias,
  });
  const opened = (await session.open())!;
  disk.replace('External edit');
  assert.equal(await session.saveAs(opened), false);
  assert.equal(disk.content(), 'External edit');
  assert.equal(disk.writableCount(), 0);
});

test('cancelling save-as preserves the current binding and pending changes silently', async () => {
  const disk = fileHandle(serializeResume(createDocument()));
  const session = new LocalFileSession({
    ...pickers(disk.handle),
    showSaveFilePicker: async () => {
      throw new DOMException('Cancelled', 'AbortError');
    },
  });
  const opened = (await session.open())!;
  const draft = { ...opened, title: 'Unsaved draft' };
  assert.equal(await session.saveAs(draft), false);
  assert.equal(session.state(draft).name, 'resume.json');
  assert.equal(session.state(draft).error, '');
  assert.equal(session.state(draft).dirty, true);
  assert.equal(disk.writableCount(), 0);
});

test('a target modified while requesting write permission is not overwritten', async () => {
  const disk = fileHandle('Original target');
  disk.handle.requestPermission = async () => {
    disk.replace('External target');
    return 'granted';
  };
  const session = new LocalFileSession(pickers(disk.handle));
  const draft = createDocument();
  assert.equal(await session.saveAs(draft), false);
  assert.equal(session.state(draft).name, null);
  assert.equal(disk.content(), 'External target');
  assert.equal(disk.writableCount(), 0);
});

test('invalid JSON opening reports an error without replacing an existing binding', async () => {
  const disk = fileHandle(serializeResume(createDocument()));
  const session = new LocalFileSession(pickers(disk.handle));
  const opened = (await session.open())!;
  disk.replace('Invalid JSON');
  assert.equal(await session.open(), null);
  assert.equal(session.state(opened).name, 'resume.json');
  assert.ok(session.state(opened).error);
  assert.equal(disk.content(), 'Invalid JSON');
  assert.equal(disk.writableCount(), 0);
});

for (const operation of ['save', 'saveAs'] as const) {
  test(`${operation} rejects oversized UTF-8 content before file access and preserves the draft`, async () => {
    const original = serializeResume(createDocument('linen', true));
    const disk = fileHandle(original);
    let pickerCalls = 0;
    let permissionCalls = 0;
    disk.handle.requestPermission = async () => {
      permissionCalls++;
      return 'granted';
    };
    const session = new LocalFileSession({
      ...pickers(disk.handle),
      showSaveFilePicker: async () => {
        pickerCalls++;
        return disk.handle;
      },
    });
    const opened = (await session.open())!;
    const draft = structuredClone(opened);
    const text = '界'.repeat(Math.ceil(MAX_FILE_BYTES / 3));
    draft.sections[0].items[0].description = richText(text);
    validateDocument(draft);

    assert.equal(await session[operation](draft), false);
    assert.equal(pickerCalls, 0);
    assert.equal(permissionCalls, 0);
    assert.equal(disk.writableCount(), 0);
    assert.equal(disk.content(), original);
    assert.equal(session.state(draft).name, 'resume.json');
    assert.equal(session.state(draft).dirty, true);
    assert.match(session.state(draft).error, /64 MB/);
    assert.match(session.state(draft).error, /减少|缩减|压缩/);
    assert.equal(draft.sections[0].items[0].description.content![0].content![0].text, text);
  });
}
