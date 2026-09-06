import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 5259;
const base = process.env.LUCK_TEST_URL || `http://127.0.0.1:${port}`;
const server = process.env.LUCK_TEST_URL
  ? null
  : spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server && server.exitCode !== null) break;
    try {
      const response = await fetch(base);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('The removal persistence test server could not start.');
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
  const page = await browser.newPage();
  await page.goto(base);
  await page.waitForSelector('.preview-panel .resume-document');
  const result = await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const { createDocument } = await import('/src/resume/model.ts');
    const { loadDocuments, saveDocument } = await import('/src/storage/database.ts');
    const api = () => useWorkspace.getState();
    const row = async (id) => (await loadDocuments()).documents.find((entry) => entry.id === id);
    const wait = () => new Promise((resolve) => setTimeout(resolve, 700));

    const first = createDocument();
    api().add(first);
    await api().flush(first.id);
    api().update(
      (document) => {
        document.title = 'Pending edit';
      },
      '',
      first.id,
    );
    const original = IDBDatabase.prototype.transaction;
    let failure;
    IDBDatabase.prototype.transaction = function (...args) {
      IDBDatabase.prototype.transaction = original;
      throw new Error('Delete unavailable');
    };
    try {
      await api().remove(first.id);
    } catch (error) {
      failure = error.message;
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (
        api().statuses[first.id] === 'saved' &&
        (await row(first.id))?.document.title === 'Pending edit'
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const retried = {
      failure,
      title: (await row(first.id))?.document.title,
      status: api().statuses[first.id],
    };

    const second = createDocument();
    api().add(second);
    await api().flush(second.id);
    api().update(
      (document) => {
        document.title = 'Conflict edit';
      },
      '',
      second.id,
    );
    const external = structuredClone(second);
    external.title = 'External edit';
    await saveDocument(external, 1);
    let conflict;
    try {
      await api().remove(second.id);
    } catch (error) {
      conflict = error.name;
    }
    await wait();
    const conflicted = {
      failure: conflict,
      title: api().documents[second.id]?.title,
      status: api().statuses[second.id],
      stored: (await row(second.id))?.document.title,
    };

    const third = createDocument();
    api().add(third);
    await api().flush(third.id);
    api().update(
      (document) => {
        document.title = 'Delete edit';
      },
      '',
      third.id,
    );
    await api().remove(third.id);
    await wait();
    const deleted = { memory: !!api().documents[third.id], stored: !!(await row(third.id)) };
    return { retried, conflicted, deleted };
  });
  assert.deepEqual(result.retried, {
    failure: 'Delete unavailable',
    title: 'Pending edit',
    status: 'saved',
  });
  assert.deepEqual(result.conflicted, {
    failure: 'StorageConflict',
    title: 'Conflict edit',
    status: 'conflict',
    stored: 'External edit',
  });
  assert.deepEqual(result.deleted, { memory: false, stored: false });
  console.log('Removal persistence checks passed');
} finally {
  await browser?.close();
  server?.kill();
}
