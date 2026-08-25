import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createEntry, createSection } from '../src/resume/model.ts';
import * as files from '../src/resume/files.ts';

function imageDocument(count: number) {
  const document = createDocument();
  const section = createSection('certifications');
  const image = 'data:image/png;base64,' + 'AAAA'.repeat(730000);
  section.items = Array.from({ length: count }, (_, index) => ({
    ...createEntry(),
    title: `Certificate ${index + 1}`,
    image,
  }));
  document.sections = [section];
  return document;
}

test('a permitted twelve-image original above 32 MiB can be imported without losing data', () => {
  const document = imageDocument(12);
  files.validateDocument(document);
  const serialized = files.serializeResume(document);
  assert.ok(new TextEncoder().encode(serialized).length > 32 * 1024 * 1024);
  const restored = files.parseResumeFile(serialized);
  assert.deepEqual(restored.sections, document.sections);
});

test('portable original export rejects unsupported sizes before producing a download', () => {
  const document = imageDocument(24);
  assert.throws(() => files.serializePortableResume(document), /64 MB/);
});

test('portable original export produces a validated native document', () => {
  const document = createDocument();
  document.profile.name = 'Portable original';
  const restored = files.parseResumeFile(files.serializePortableResume(document));
  assert.equal(restored.profile.name, 'Portable original');
  assert.equal(files.MAX_FILE_BYTES, files.MAX_IMPORT_FILE_BYTES);
});
