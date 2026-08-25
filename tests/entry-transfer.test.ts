import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument,
  createEntry,
  createField,
  createSection,
  richText,
} from '../src/resume/model.ts';

import * as transfer from '../src/resume/entryTransfer.ts';

function fixture() {
  const source = createDocument();
  const destination = createDocument();
  const section = createSection('experience');
  const target = createSection('projects');
  const entry = createEntry();
  Object.assign(entry, {
    title: 'Engineer',
    degree: 'MSc',
    gpa: '4.0',
    image: 'data:image/png;base64,AAAA',
    logo: 'data:image/png;base64,AAAA',
    description: richText('Rich content'),
    customFields: [createField('Custom')],
    fieldLabels: { gpa: 'Score' },
    hiddenFields: ['degree'],
  });
  section.items = [entry];
  source.sections = [section, createSection('custom')];
  destination.sections = [target];
  return {
    source,
    destination,
    section,
    target,
    entry,
    documents: { [source.id]: source, [destination.id]: destination },
  };
}

test('copies entries across documents with fresh nested identities and independent content', () => {
  assert.equal(typeof transfer.planEntryTransfer, 'function');
  const { source, destination, section, target, entry, documents } = fixture();
  const plan = transfer.planEntryTransfer(documents, {
    sourceDocumentId: source.id,
    sourceSectionId: section.id,
    entryId: entry.id,
    destinationDocumentId: destination.id,
    destinationSectionId: target.id,
    mode: 'copy',
  });
  const copy = plan.documents[destination.id].sections[0].items[0];
  assert.notEqual(copy.id, entry.id);
  assert.notEqual(copy.customFields[0].id, entry.customFields[0].id);
  assert.deepEqual({ ...copy, id: entry.id, customFields: entry.customFields }, entry);
  copy.description.content[0].content[0].text = 'Changed';
  assert.equal(entry.description.content[0].content[0].text, 'Rich content');
  assert.deepEqual(Object.keys(plan.documents), [destination.id]);
  assert.equal(source.sections[0].items.length, 1);
});

test('moves entries between sections without mutating original documents', () => {
  const { source, section, entry, documents } = fixture();
  const plan = transfer.planEntryTransfer(documents, {
    sourceDocumentId: source.id,
    sourceSectionId: section.id,
    entryId: entry.id,
    destinationDocumentId: source.id,
    destinationSectionId: source.sections[1].id,
    mode: 'move',
  });
  assert.equal(plan.documents[source.id].sections[0].items.length, 0);
  assert.equal(plan.documents[source.id].sections[1].items.length, 2);
  assert.equal(source.sections[0].items.length, 1);
  assert.notEqual(plan.entryId, entry.id);
});

test('rejects stale destinations, same-section moves, invalid modes and full destinations', () => {
  const { source, destination, section, target, entry, documents } = fixture();
  const request = {
    sourceDocumentId: source.id,
    sourceSectionId: section.id,
    entryId: entry.id,
    destinationDocumentId: destination.id,
    destinationSectionId: target.id,
    mode: 'move',
  };
  for (const patch of [
    { destinationDocumentId: 'missing' },
    { destinationSectionId: 'missing' },
    { entryId: 'missing' },
    { mode: 'delete' },
    { destinationDocumentId: source.id, destinationSectionId: section.id },
  ]) {
    assert.throws(() => transfer.planEntryTransfer(documents, { ...request, ...patch }));
  }
  target.items = Array.from({ length: 500 }, () => createEntry());
  assert.throws(() => transfer.planEntryTransfer(documents, request));
  assert.equal(section.items.length, 1);
});
