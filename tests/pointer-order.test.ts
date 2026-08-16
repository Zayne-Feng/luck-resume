import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, createEntry } from '../src/resume/model.ts';
import { reorderDocument } from '../src/resume/reorder.ts';
test('reorders only the selected section or entries without changing identities', () => {
  const doc = createDocument();
  const original = doc.sections.map((section) => section.id);
  reorderDocument(doc, original[0], original[1], 'sections');
  assert.deepEqual(
    doc.sections.slice(0, 2).map((section) => section.id),
    [original[1], original[0]],
  );
  const section = doc.sections[0];
  section.items = [createEntry(), createEntry()];
  const ids = section.items.map((entry) => entry.id);
  reorderDocument(doc, ids[0], ids[1], `entries-${section.id}`);
  assert.deepEqual(
    section.items.map((entry) => entry.id),
    [ids[1], ids[0]],
  );
});
test('ignores missing items, unrelated scopes and cross-section entry drops', () => {
  const doc = createDocument();
  doc.sections[0].items = [createEntry(), createEntry()];
  const before = structuredClone(doc);
  reorderDocument(
    doc,
    doc.sections[0].items[0].id,
    doc.sections[0].items[1].id,
    `entries-${doc.sections[1].id}`,
  );
  reorderDocument(doc, 'missing', doc.sections[0].id, 'sections');
  reorderDocument(doc, doc.sections[0].id, doc.sections[1].id, 'unknown');
  assert.deepEqual(doc, before);
});
