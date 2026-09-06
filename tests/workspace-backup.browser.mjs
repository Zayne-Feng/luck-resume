import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5196';
const browser = await chromium.launch({
  channel:
    process.env.LUCK_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  headless: true,
});
const context = await browser.newContext();
try {
  const page = await context.newPage();
  await page.route('**/workspace-backup-test.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Workspace backup storage test</title>',
    }),
  );
  await page.goto(`${baseURL}/workspace-backup-test.html`);
  const result = await page.evaluate(async () => {
    const { createDocument } = await import('/src/resume/model.ts');
    const { openDatabase, saveDocument, loadDocuments } = await import('/src/storage/database.ts');
    const { importAppearancePresets, listAppearancePresets } = await import(
      '/src/storage/appearancePresets.ts'
    );
    const { listVersions } = await import('/src/storage/versionHistory.ts');
    const { createWorkspaceBackup, parseWorkspaceBackup, importWorkspaceBackup } = await import(
      '/src/storage/workspaceBackup.ts'
    );
    const now = new Date().toISOString();
    const existing = createDocument('linen', true);
    await saveDocument(existing, 0);
    const template = {
      id: 'source-preset',
      name: 'Imported preset',
      createdAt: now,
      updatedAt: now,
      appearance: existing.appearance,
    };
    await importAppearancePresets(
      Array.from({ length: 50 }, (_, index) => ({
        ...template,
        id: `preset-${index}`,
        name: `Existing ${index}`,
      })),
    );
    const incoming = createDocument('mono', true);
    incoming.title = 'Incoming document';
    const orphan = createDocument('linen', true);
    orphan.title = 'Recovered latest';
    const makeVersion = (document, id, createdAt) => ({
      id,
      documentId: document.id,
      document,
      createdAt,
      kind: 'named',
      name: id,
      bytes: 0,
    });
    const data = {
      documents: [incoming],
      presets: [template],
      versions: [
        makeVersion(incoming, 'incoming-version', now),
        makeVersion(
          { ...orphan, title: 'Recovered older' },
          'orphan-old',
          '2025-01-01T00:00:00.000Z',
        ),
        makeVersion(orphan, 'orphan-latest', now),
      ],
    };
    const files = createWorkspaceBackup(data, 4096);
    const parsed = parseWorkspaceBackup(await Promise.all(files.map((file) => file.blob.text())));
    let failure = '';
    try {
      await importWorkspaceBackup(parsed);
    } catch (error) {
      failure = error.message;
    }
    const afterFailure = {
      documents: (await loadDocuments()).documents,
      presets: await listAppearancePresets(),
      versions: await listVersions(),
    };
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('stylePresets', 'readwrite');
      tx.objectStore('stylePresets').delete(afterFailure.presets[0].id);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    const imported = await importWorkspaceBackup(parsed);
    return {
      failure,
      afterFailure,
      imported,
      persisted: (await loadDocuments()).documents,
      presets: await listAppearancePresets(),
      versions: await listVersions(),
      source: {
        existing,
        incoming,
        orphan,
        template,
        versionIds: data.versions.map((row) => row.id),
      },
    };
  });
  assert.match(result.failure, /50/);
  assert.equal(result.afterFailure.documents.length, 1);
  assert.equal(result.afterFailure.documents[0].id, result.source.existing.id);
  assert.equal(result.afterFailure.presets.length, 50);
  assert.equal(result.afterFailure.versions.length, 0);
  assert.equal(result.imported.length, 2);
  assert.equal(result.persisted.length, 3);
  assert.deepEqual(
    result.persisted.find((row) => row.id === result.source.existing.id).document,
    result.source.existing,
  );
  assert.equal(result.presets.length, 50);
  assert.equal(result.versions.length, 3);
  const importedPreset = result.presets.find((row) => row.name === 'Imported preset');
  assert.ok(importedPreset);
  assert.notEqual(importedPreset.id, result.source.template.id);
  for (const document of result.imported) {
    assert.ok(
      ![result.source.incoming.id, result.source.orphan.id, result.source.existing.id].includes(
        document.id,
      ),
    );
    assert.equal(result.persisted.find((row) => row.id === document.id).revision, 1);
  }
  const recovered = result.imported.find((row) => row.title === 'Recovered latest');
  assert.ok(recovered);
  assert.equal(result.versions.filter((row) => row.documentId === recovered.id).length, 2);
  for (const version of result.versions) {
    const target = result.imported.find((row) => row.id === version.documentId);
    assert.ok(target);
    assert.equal(version.document.id, target.id);
    assert.equal(version.document.createdAt, target.createdAt);
    assert.ok(!result.source.versionIds.includes(version.id));
    assert.ok(version.bytes > 0);
  }
  const other = await context.newPage();
  await other.goto(`${baseURL}/workspace-backup-test.html`);
  const shared = await page.evaluate(async () => {
    const { createDocument } = await import('/src/resume/model.ts');
    const { saveDocument } = await import('/src/storage/database.ts');
    const document = createDocument();
    document.title = 'First tab saved';
    await saveDocument(document, 0);
    return document;
  });
  const addedId = await other.evaluate(async (document) => {
    const { createDocument } = await import('/src/resume/model.ts');
    const { saveDocument } = await import('/src/storage/database.ts');
    await saveDocument({ ...document, title: 'Second tab saved' }, 1);
    const added = createDocument();
    added.title = 'Second tab new';
    await saveDocument(added, 0);
    return added.id;
  }, shared);
  const merged = await page.evaluate(async (document) => {
    const { loadDocuments } = await import('/src/storage/database.ts');
    const { mergeWorkspaceBackupDocuments, createWorkspaceBackup, parseWorkspaceBackup } =
      await import('/src/storage/workspaceBackup.ts');
    const stored = await loadDocuments();
    const documents = mergeWorkspaceBackupDocuments(
      stored.documents,
      [{ ...document, title: 'First tab unsaved' }],
      { [document.id]: 1 },
      { [document.id]: 'pending' },
      'Unsaved changes copy',
    );
    const files = createWorkspaceBackup({ documents, presets: [], versions: [] });
    return parseWorkspaceBackup(await Promise.all(files.map((file) => file.blob.text()))).documents;
  }, shared);
  assert.equal(merged.find((row) => row.id === shared.id).title, 'Second tab saved');
  assert.ok(merged.some((row) => row.id === addedId));
  assert.ok(
    merged.some(
      (row) => row.id !== shared.id && row.title === 'First tab unsaved (Unsaved changes copy)',
    ),
  );
  await other.close();
  console.log(
    'Workspace backup browser checks passed: preset-cap rollback, all-store import, revision 1, new identities, orphan history recovery.',
  );
} finally {
  await context.close();
  await browser.close();
}
