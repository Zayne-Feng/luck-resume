import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 5253;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { windowsHide: true, stdio: 'ignore' },
);
let browser;
const failures = [];
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

  async function run(name, scenario, check) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}`);
      await page.waitForSelector('.preview-panel .resume-document');
      const result = await page.evaluate(async (scenario) => {
        const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
        const { createDocument, createEntry, createSection } = await import('/src/resume/model.ts');
        const { loadDocuments, saveDocument } = await import('/src/storage/database.ts');
        const api = () => useWorkspace.getState();
        const source = createDocument();
        const destination = createDocument();
        source.title = 'Source';
        destination.title = 'Destination';
        source.sections = [createSection('experience')];
        destination.sections = [createSection('experience')];
        const entry = createEntry();
        entry.title = 'Original entry';
        source.sections[0].items = [entry];
        api().add(source);
        api().add(destination);
        await Promise.all([api().flush(source.id), api().flush(destination.id)]);
        for (const id of [source.id, destination.id]) {
          api().update(
            (document) => {
              document.profile.name = 'Earlier edit';
            },
            '',
            id,
          );
          await api().flush(id);
        }
        const request = {
          sourceDocumentId: source.id,
          sourceSectionId: source.sections[0].id,
          entryId: entry.id,
          destinationDocumentId: destination.id,
          destinationSectionId: destination.sections[0].id,
          mode: 'copy',
        };
        const row = async (id) =>
          (await loadDocuments()).documents.find((value) => value.id === id);
        const summary = () => ({
          error: api().operationError,
          source: api().documents[source.id],
          destination: api().documents[destination.id],
          statuses: [api().statuses[source.id], api().statuses[destination.id]],
        });
        if (scenario === 'copy-delete' || scenario === 'move-delete') {
          const move = scenario === 'move-delete';
          await api().transferEntry({ ...request, mode: move ? 'move' : 'copy' });
          await api().remove(move ? destination.id : source.id);
          const survivor = move ? source.id : destination.id;
          api().select(survivor);
          await api().travel('undo');
          const undone = summary();
          await api().travel('redo');
          const redone = summary();
          await api().travel('undo');
          await api().travel('undo');
          await api().flush(survivor);
          return {
            undone,
            redone,
            earlier: summary(),
            diskDeleted: !(await row(move ? destination.id : source.id)),
          };
        }
        if (scenario === 'recover' || scenario === 'reset') {
          await api().transferEntry(request);
          if (scenario === 'recover') {
            const disk = await row(source.id);
            await saveDocument({ ...disk.document, title: 'External title' }, disk.revision);
            api().update(
              (document) => {
                document.profile.name = 'Local copy content';
              },
              '',
              source.id,
            );
            await api().flush(source.id);
            await api().recover(source.id);
          } else {
            api().adoptImported([{ ...api().documents[source.id], title: 'Reset title' }]);
          }
          const partnerBefore = structuredClone(api().documents[source.id]);
          api().select(destination.id);
          api().update((document) => {
            document.profile.name = 'Later destination edit';
          });
          await api().travel('undo');
          await api().travel('undo');
          const undone = summary();
          await api().travel('undo');
          return {
            undone,
            earlier: summary(),
            partnerBefore,
            copies: Object.values(api().documents).filter(
              (doc) => doc.profile.name === 'Local copy content',
            ).length,
          };
        }
        if (scenario === 'redo-delete') {
          await api().transferEntry(request);
          api().select(destination.id);
          await api().travel('undo');
          await api().remove(source.id);
          await api().travel('redo');
          const redone = summary();
          await api().travel('undo');
          await api().travel('undo');
          return { redone, earlier: summary(), diskDeleted: !(await row(source.id)) };
        }
        if (scenario === 'chain' || scenario === 'chain-intact') {
          const third = createDocument();
          third.sections = [createSection('experience')];
          api().add(third);
          await api().flush(third.id);
          const copiedId = await api().transferEntry(request);
          await api().transferEntry({
            sourceDocumentId: destination.id,
            sourceSectionId: destination.sections[0].id,
            entryId: copiedId,
            destinationDocumentId: third.id,
            destinationSectionId: third.sections[0].id,
            mode: 'move',
          });
          if (scenario === 'chain-intact') {
            api().select(source.id);
            await api().travel('undo');
            const blocked = api().operationError;
            api().select(third.id);
            await api().travel('undo');
            api().select(source.id);
            await api().travel('undo');
            const undone = [source.id, destination.id, third.id].map(
              (id) => api().documents[id].sections[0].items.length,
            );
            await api().travel('redo');
            api().select(third.id);
            await api().travel('redo');
            return {
              ...summary(),
              blocked,
              undone,
              redone: [source.id, destination.id, third.id].map(
                (id) => api().documents[id].sections[0].items.length,
              ),
            };
          }
          await api().remove(destination.id);
          api().select(third.id);
          await api().travel('undo');
          const thirdUndone = api().documents[third.id].sections[0].items.length;
          api().select(source.id);
          await api().travel('undo');
          await api().travel('undo');
          return { ...summary(), thirdUndone, deleted: !(await row(destination.id)) };
        }
        if (scenario.startsWith('conflict-') || scenario === 'transient') {
          const staleId = scenario === 'conflict-source' ? source.id : destination.id;
          const before = {
            source: structuredClone(api().documents[source.id]),
            destination: structuredClone(api().documents[destination.id]),
          };
          const original = IDBDatabase.prototype.transaction;
          let injected = false;
          IDBDatabase.prototype.transaction = function (...args) {
            if (!injected && args[0] === 'documents' && args[1] === 'readwrite') {
              injected = true;
              api().update(
                (document) => {
                  document.profile.headline = 'Deferred edit';
                },
                '',
                source.id,
              );
              if (scenario === 'transient') throw new Error('Synthetic batch failure');
              const external = original.call(this, 'documents', 'readwrite');
              const store = external.objectStore('documents');
              const request = store.get(staleId);
              request.onsuccess = () =>
                store.put({
                  ...request.result,
                  revision: request.result.revision + 1,
                  document: { ...request.result.document, title: 'External update' },
                });
            }
            return original.apply(this, args);
          };
          let thrown;
          try {
            await api().transferEntry({ ...request, mode: 'move' });
          } catch (error) {
            thrown = { name: error.name, message: error.message };
          } finally {
            IDBDatabase.prototype.transaction = original;
          }
          const after = summary();
          const disk = { source: await row(source.id), destination: await row(destination.id) };
          api().select(staleId);
          return {
            before,
            after,
            disk,
            thrown,
            staleId,
            sourceId: source.id,
            destinationId: destination.id,
          };
        }
        throw new Error('Unknown scenario');
      }, scenario);
      await check(result, page);
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push(`${name}: ${error.stack}`);
      console.error(`FAIL ${name}: ${error.message}`);
    } finally {
      await context.close();
    }
  }

  await run(
    'copy deletion preserves independent undo and earlier edits',
    'copy-delete',
    (result) => {
      assert.equal(result.undone.error, null);
      assert.equal(result.undone.destination.sections[0].items.length, 0);
      assert.equal(result.redone.destination.sections[0].items.length, 1);
      assert.equal(result.earlier.destination.profile.name, '');
      assert.equal(result.earlier.source, undefined);
      assert.equal(result.diskDeleted, true);
    },
  );
  await run(
    'move deletion restores source without resurrecting destination',
    'move-delete',
    (result) => {
      assert.equal(result.undone.error, null);
      assert.equal(result.undone.source.sections[0].items.length, 1);
      assert.equal(result.redone.source.sections[0].items.length, 0);
      assert.equal(result.earlier.source.profile.name, '');
      assert.equal(result.earlier.destination, undefined);
      assert.equal(result.diskDeleted, true);
    },
  );
  for (const scenario of ['recover', 'reset']) {
    await run(
      `${scenario} detaches history while preserving partner content`,
      scenario,
      (result) => {
        assert.equal(result.undone.error, null);
        assert.equal(result.undone.destination.sections[0].items.length, 0);
        assert.equal(result.earlier.destination.profile.name, '');
        assert.deepEqual(result.earlier.source, result.partnerBefore);
        if (scenario === 'recover') assert.equal(result.copies, 1);
      },
    );
  }
  await run('chained links detach a removed middle document', 'chain', (result) => {
    assert.equal(result.error, null);
    assert.equal(result.thirdUndone, 0);
    assert.equal(result.source.profile.name, '');
    assert.equal(result.destination, undefined);
    assert.equal(result.deleted, true);
  });
  await run(
    'redo detaches a deleted partner and preserves earlier undo',
    'redo-delete',
    (result) => {
      assert.equal(result.redone.error, null);
      assert.equal(result.redone.destination.sections[0].items.length, 1);
      assert.equal(result.earlier.destination.profile.name, '');
      assert.equal(result.earlier.source, undefined);
      assert.equal(result.diskDeleted, true);
    },
  );
  await run(
    'intact chained links retain guarding and round-trip identity',
    'chain-intact',
    (result) => {
      assert.match(result.blocked, /后续修改/);
      assert.equal(result.error, null);
      assert.deepEqual(result.undone, [1, 0, 0]);
      assert.deepEqual(result.redone, [1, 0, 1]);
    },
  );
  for (const scenario of ['conflict-source', 'conflict-destination', 'transient']) {
    await run(
      `${scenario} aborts atomically and retains deferred edits`,
      scenario,
      async (result, page) => {
        assert.equal(result.after.source.sections[0].items.length, 1);
        assert.equal(result.after.destination.sections[0].items.length, 0);
        assert.equal(result.after.source.profile.headline, 'Deferred edit');
        assert.equal(
          result.after.statuses[0],
          scenario === 'conflict-source' ? 'conflict' : 'pending',
        );
        assert.equal(
          result.after.statuses[1],
          scenario === 'conflict-destination' ? 'conflict' : 'saved',
        );
        assert.equal(result.disk.source.document.sections[0].items.length, 1);
        assert.equal(result.disk.destination.document.sections[0].items.length, 0);
        assert.deepEqual(
          result.disk.source.document,
          scenario === 'conflict-source'
            ? { ...result.before.source, title: 'External update' }
            : result.before.source,
        );
        assert.deepEqual(
          result.disk.destination.document,
          scenario === 'conflict-destination'
            ? { ...result.before.destination, title: 'External update' }
            : result.before.destination,
        );
        if (scenario === 'transient') {
          assert.match(result.thrown.message, /Synthetic batch failure/);
        } else {
          assert.equal(result.thrown.name, 'StorageConflict');
          const recovery = page.getByRole('button', { name: '另存为副本', exact: true });
          await recovery.waitFor();
          await recovery.click();
          await page.waitForFunction(async ({ staleId }) => {
            const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
            return useWorkspace.getState().documents[staleId].title === 'External update';
          }, result);
          const recovered = await page.evaluate(async (result) => {
            const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
            const state = useWorkspace.getState();
            return {
              title: state.documents[state.activeId].title,
              headline: state.documents[state.activeId].profile.headline,
              sourceCount: state.documents[result.sourceId].sections[0].items.length,
              destinationCount: state.documents[result.destinationId].sections[0].items.length,
              originalStatus: state.statuses[result.staleId],
            };
          }, result);
          assert.equal(
            recovered.title,
            scenario === 'conflict-source' ? 'Source（副本）' : 'Destination（副本）',
          );
          assert.equal(recovered.originalStatus, 'saved');
          assert.equal(recovered.sourceCount, 1);
          assert.equal(recovered.destinationCount, 0);
          if (scenario === 'conflict-source') assert.equal(recovered.headline, 'Deferred edit');
        }
      },
    );
  }
  assert.deepEqual(failures, []);
} finally {
  await browser?.close();
  server.kill();
}
