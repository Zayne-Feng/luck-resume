import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  createDocument,
  createSection,
  createEntry,
  createField,
  richText,
} from '../src/resume/model.ts';

const port = 5235;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { windowsHide: true, stdio: 'ignore' },
);
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForSelector('.preview-panel .resume-document');
  const source = createDocument();
  source.title = 'Source resume';
  source.profile.name = 'Entry transfer';
  const section = createSection('education');
  const target = createSection('projects');
  const entry = createEntry();
  Object.assign(entry, {
    title: 'Source school',
    degree: 'MSc',
    gpa: '3.9',
    description: richText('Preserved rich content'),
    customFields: [createField('Custom')],
    logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  });
  entry.description.content[0].content[0].marks = [{ type: 'bold' }, { type: 'underline' }];
  entry.image = entry.logo;
  section.items = [entry];
  source.sections = [section, target];
  const destination = createDocument();
  destination.title = 'Destination resume';
  destination.sections = [createSection('experience')];
  await page.evaluate(
    async ({ source, destination }) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      useWorkspace.getState().add(destination);
      useWorkspace.getState().add(source);
      await Promise.all([
        useWorkspace.getState().flush(source.id),
        useWorkspace.getState().flush(destination.id),
      ]);
    },
    { source, destination },
  );
  const card = page.locator(`#entry-${entry.id}`);
  await card.evaluate((element) => {
    for (let node = element; node; node = node.parentElement)
      if (node.tagName === 'DETAILS') node.open = true;
  });
  await card.locator('.entry-options > summary').first().click();
  assert.equal(
    await card.getByRole('checkbox', { name: '显示学历 / 学位', exact: true }).count(),
    1,
  );
  await card.getByRole('checkbox', { name: '显示学历 / 学位', exact: true }).uncheck();
  await card.getByRole('checkbox', { name: '显示GPA', exact: true }).uncheck();
  assert.equal(await page.locator('.preview-panel').getByText('MSc', { exact: true }).count(), 0);
  await card.getByRole('checkbox', { name: '显示学历 / 学位', exact: true }).check();
  await card.getByRole('checkbox', { name: '显示GPA', exact: true }).check();
  await card.getByLabel('GPA字段名称', { exact: true }).fill('Score');
  await card.getByLabel('学历 / 学位字段名称', { exact: true }).fill('Qualification');
  await page.locator('.preview-panel').getByText('Score: 3.9', { exact: true }).waitFor();
  await page.locator('.preview-panel').getByText('Qualification: MSc', { exact: true }).waitFor();
  await card.getByRole('button', { name: '复制或移动条目', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('目标简历', { exact: true }).selectOption(destination.id);
  await dialog.getByRole('button', { name: '复制到目标', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  const copied = await page.evaluate(async (id) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    return useWorkspace.getState().documents[id].sections[0].items[0];
  }, destination.id);
  assert.notEqual(copied.id, entry.id);
  assert.notEqual(copied.customFields[0].id, entry.customFields[0].id);
  assert.deepEqual(copied.description, entry.description);
  assert.equal(copied.image, entry.image);
  assert.equal(copied.logo, entry.logo);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForFunction(async (id) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    return useWorkspace.getState().documents[id].sections[0].items.length === 0;
  }, destination.id);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await page.waitForFunction(async (id) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    return useWorkspace.getState().documents[id].sections[0].items.length === 1;
  }, destination.id);
  await card.getByRole('button', { name: '复制或移动条目', exact: true }).click();
  await dialog.getByLabel('目标模块', { exact: true }).selectOption(target.id);
  await dialog.getByLabel('操作方式', { exact: true }).selectOption('move');
  await dialog.getByRole('button', { name: '移动到目标', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await card.waitFor();
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await card.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await card.waitFor();
  const request = {
    sourceDocumentId: source.id,
    sourceSectionId: section.id,
    entryId: entry.id,
    destinationDocumentId: destination.id,
    destinationSectionId: destination.sections[0].id,
    mode: 'move',
  };
  const outcome = await page.evaluate(async (request) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const state = useWorkspace.getState();
    await Promise.all([
      state.flush(request.sourceDocumentId),
      state.flush(request.destinationDocumentId),
    ]);
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === 'readwrite') throw new Error('Synthetic storage failure');
      return original.apply(this, args);
    };
    let message = '';
    try {
      await useWorkspace.getState().transferEntry(request);
    } catch (error) {
      message = error.message;
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
    return {
      message,
      source: useWorkspace.getState().documents[request.sourceDocumentId],
      destination: useWorkspace.getState().documents[request.destinationDocumentId],
    };
  }, request);
  assert.match(outcome.message, /Synthetic storage failure/);
  assert.equal(outcome.source.sections[0].items[0].id, entry.id);
  assert.equal(outcome.destination.sections[0].items.length, 1);
  const aborted = await page.evaluate(async (request) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const { loadDocuments } = await import('/src/storage/database.ts');
    const before = (await loadDocuments()).documents;
    const original = IDBObjectStore.prototype.put;
    let calls = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'documents' && ++calls === 2)
        throw new Error('Synthetic second write failure');
      return original.apply(this, args);
    };
    let message = '';
    try {
      await useWorkspace.getState().transferEntry(request);
    } catch (error) {
      message = error.message;
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    return { message, before, after: (await loadDocuments()).documents };
  }, request);
  assert.match(aborted.message, /Synthetic second write failure/);
  assert.deepEqual(aborted.after, aborted.before);
  await page.evaluate(async (request) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    await useWorkspace.getState().transferEntry(request);
  }, request);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await card.waitFor();
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await card.waitFor({ state: 'detached' });
  const persisted = await page.evaluate(async () => {
    const { loadDocuments } = await import('/src/storage/database.ts');
    return (await loadDocuments()).documents.map((row) => row.document);
  });
  assert.equal(persisted.find((doc) => doc.id === source.id).sections[0].items.length, 0);
  assert.equal(persisted.find((doc) => doc.id === destination.id).sections[0].items.length, 2);
  const guarded = await page.evaluate(
    async ({ sourceId, destinationId }) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      useWorkspace.getState().update(
        (doc) => {
          doc.profile.name = 'Later edit';
        },
        '',
        destinationId,
      );
      await useWorkspace.getState().travel('undo');
      const blocked = useWorkspace.getState().operationError;
      const count = useWorkspace.getState().documents[sourceId].sections[0].items.length;
      useWorkspace.getState().select(destinationId);
      await useWorkspace.getState().travel('undo');
      useWorkspace.getState().select(sourceId);
      await useWorkspace.getState().travel('undo');
      return {
        blocked,
        count,
        source: useWorkspace.getState().documents[sourceId],
        destination: useWorkspace.getState().documents[destinationId],
      };
    },
    { sourceId: source.id, destinationId: destination.id },
  );
  assert.match(guarded.blocked, /后续修改/);
  assert.equal(guarded.count, 0);
  assert.equal(guarded.source.sections[0].items[0].id, entry.id);
  assert.equal(guarded.destination.sections[0].items.length, 1);
  const concurrent = await page.evaluate(async (request) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = original.apply(this, args);
      if (args[1] === 'readwrite') {
        const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
        Object.defineProperty(transaction, 'oncomplete', {
          set(handler) {
            descriptor.set.call(transaction, (event) =>
              setTimeout(() => handler.call(transaction, event), 80),
            );
          },
        });
      }
      return transaction;
    };
    try {
      const pending = useWorkspace.getState().transferEntry({ ...request, mode: 'copy' });
      await new Promise((resolve) => setTimeout(resolve, 15));
      useWorkspace.getState().update(
        (doc) => {
          doc.profile.name = 'Edit while saving';
        },
        '',
        request.sourceDocumentId,
      );
      await pending;
      return useWorkspace.getState().documents[request.sourceDocumentId].profile.name;
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
  }, request);
  assert.equal(concurrent, 'Edit while saving');
  await page.evaluate(async (id) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    useWorkspace.getState().select(id);
  }, destination.id);
  const reused = page.locator(`#entry-${copied.id}`);
  await reused.evaluate((element) => {
    for (let node = element; node; node = node.parentElement)
      if (node.tagName === 'DETAILS') node.open = true;
  });
  assert.equal(await reused.getByLabel('Score', { exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  console.log(
    'PASS education controls, destination copy/move, linked undo/redo, atomic persistence failure, media and rich text preservation',
  );
} finally {
  await browser?.close();
  server.kill();
}
