import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5178';
let server;
try {
  await fetch(baseURL);
} catch {
  server = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host',
      '127.0.0.1',
      '--port',
      '5178',
      '--strictPort',
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fetch(baseURL);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.route('**/history-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>History storage test</title>',
    }),
  );
  await page.goto(`${baseURL}/history-test`);
  const result = await page.evaluate(async () => {
    const { createDocument } = await import('/src/resume/model.ts');
    const document = createDocument();
    const legacy = await new Promise((resolve, reject) => {
      const request = indexedDB.open('luck-resume', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('documents', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = legacy.transaction('documents', 'readwrite');
      transaction.objectStore('documents').put({ id: document.id, document, revision: 1 });
      transaction.oncomplete = resolve;
      transaction.onabort = reject;
    });
    const { openDatabase, loadDocuments } = await import('/src/storage/database.ts');
    let blocked = false;
    try {
      await openDatabase();
    } catch {
      blocked = true;
    }
    legacy.close();
    const db = await openDatabase();
    const {
      saveVersion,
      listVersions,
      serializeVersionHistory,
      parseVersionHistory,
      importVersionSnapshots,
      deleteVersion,
    } = await import('/src/storage/versionHistory.ts');
    await saveVersion(document, 'automatic');
    await saveVersion({ ...document, updatedAt: new Date().toISOString() }, 'automatic');
    const deduplicated = (await listVersions(document.id)).length;
    const named = await saveVersion(document, 'named', 'Original');
    for (let index = 0; index < 34; index += 1)
      await saveVersion({ ...document, title: `Version ${index}` }, 'automatic');
    const versions = await listVersions(document.id);
    const target = createDocument();
    await importVersionSnapshots(parseVersionHistory(serializeVersionHistory([named])), target);
    const imported = await listVersions(target.id);
    await deleteVersion(named.id);
    const loaded = await loadDocuments();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('resumeVersions', 'readwrite');
      transaction.objectStore('resumeVersions').put({ id: 'corrupt', documentId: document.id });
      transaction.oncomplete = resolve;
      transaction.onabort = reject;
    });
    const rejected = async (action) => {
      try {
        await action();
        return false;
      } catch {
        return true;
      }
    };
    const invalidReadRejected = await rejected(() => listVersions(document.id));
    const invalidWriteRejected = await rejected(() => saveVersion(document, 'automatic'));
    await deleteVersion('corrupt');
    return {
      invalidReadRejected,
      invalidWriteRejected,
      blocked,
      stores: [...db.objectStoreNames],
      draft: loaded.documents[0].document.id === document.id,
      deduplicated,
      automatic: versions.filter((row) => row.kind === 'automatic').length,
      namedRetained: versions.some((row) => row.id === named.id),
      imported:
        imported.length === 1 &&
        imported[0].document.id === target.id &&
        imported[0].document.createdAt === target.createdAt,
      deleted: !(await listVersions(document.id)).some((row) => row.id === named.id),
    };
  });
  assert.equal(result.blocked, true);
  assert.deepEqual(result.stores.sort(), ['documents', 'resumeVersions', 'stylePresets']);
  assert.equal(result.draft, true);
  assert.equal(result.deduplicated, 1);
  assert.equal(result.automatic, 30);
  assert.equal(result.namedRetained, true);
  assert.equal(result.imported, true);
  assert.equal(result.deleted, true);
  assert.equal(result.invalidReadRejected, true);
  assert.equal(result.invalidWriteRejected, true);
  await page.reload();
  assert.equal(
    await page.evaluate(
      async () => (await (await import('/src/storage/versionHistory.ts')).listVersions()).length,
    ),
    31,
  );
  console.log(
    'History storage browser checks passed: migration, blocked retry, retention, identity remapping, deletion and refresh.',
  );
} finally {
  await browser.close();
  server?.kill();
}
