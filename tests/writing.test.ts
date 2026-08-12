import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, createEntry, createSection, richText } from '../src/resume/model.ts';
import { checkWriting } from '../src/resume/writing.ts';

test('finds repeated words, punctuation, vague wording and long sentences with locations', () => {
  const document = createDocument();
  const section = createSection('experience');
  const entry = createEntry();
  entry.title = 'Product';
  entry.description = richText(
    'The the team delivered good results！！',
    '设计开发维护测试'.repeat(22),
  );
  section.items = [entry];
  document.sections = [section];
  const issues = checkWriting(document);
  assert.deepEqual(
    new Set(issues.map((issue) => issue.kind)),
    new Set(['repeated', 'punctuation', 'vague', 'long']),
  );
  assert.ok(issues.every((issue) => issue.sectionId === section.id && issue.entryId === entry.id));
  assert.ok(issues.some((issue) => issue.excerpt === 'The the'));
});

test('skips hidden content and links, preserves the document and returns deterministic findings', () => {
  const document = createDocument();
  const section = createSection('experience');
  const entry = createEntry();
  entry.description = richText('the the good！！');
  entry.hiddenFields = ['description'];
  entry.link = 'https://example.com/good';
  section.items = [entry, { ...entry, id: 'hidden-entry', hiddenFields: [], visible: false }];
  document.sections = [section, { ...section, id: 'hidden-section', visible: false }];
  document.profile.headline = 'good';
  document.profile.hiddenFields = ['headline'];
  document.profile.customFields = [
    { id: 'hidden', label: 'Note', value: 'good', visible: false, kind: 'text', showLabel: true },
  ];
  const original = structuredClone(document);
  assert.deepEqual(checkWriting(document), []);
  assert.deepEqual(document, original);
  entry.hiddenFields = [];
  assert.deepEqual(checkWriting(document), checkWriting(document));
});

test('handles Chinese repeated words and does not flag normal ellipses or short sentences', () => {
  const document = createDocument();
  document.profile.headline = '负责负责项目协调';
  assert.ok(
    checkWriting(document).some(
      (issue) => issue.kind === 'repeated' && issue.excerpt === '负责负责',
    ),
  );
  document.profile.headline = 'Build useful products... Keep learning.';
  assert.deepEqual(checkWriting(document), []);
});
