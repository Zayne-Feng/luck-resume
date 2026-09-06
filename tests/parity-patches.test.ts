import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, createEntry, safeLink } from '../src/resume/model.ts';
import {
  validateDocument,
  validateRichText,
  serializeResume,
  parseResumeFile,
} from '../src/resume/files.ts';
import { serializeMarkdown, parseTextImport } from '../src/resume/transfer.ts';
import { parseSemanticResume } from '../src/ai/results.ts';

test('heading alignment survives native and archival persistence for all supported levels', () => {
  const document = createDocument();
  const entry = createEntry();
  entry.description = {
    type: 'doc',
    content: [1, 2, 3, 4].map((level, index) => ({
      type: 'heading',
      attrs: {
        level,
        textAlign: ['left', 'center', 'right', 'justify'][index] as
          | 'left'
          | 'center'
          | 'right'
          | 'justify',
      },
      content: [{ type: 'text', text: `Heading ${level}` }],
    })),
  };
  document.sections[0].items = [entry];
  for (const restored of [
    parseResumeFile(serializeResume(document)),
    parseTextImport(serializeMarkdown(document)).document,
  ])
    assert.deepEqual(restored.sections[0].items[0].description, entry.description);
});

test('heading alignment rejects arbitrary CSS attributes', () => {
  assert.throws(() =>
    validateRichText({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 2, textAlign: 'expression(alert(1))' } }],
    }),
  );
});

test('DOI prefix spaces normalize without admitting unsafe links or whitespace inside destinations', () => {
  for (const input of [
    'doi: 10.1000/Example',
    'DOI:   10.1000/Example',
    'doi:\u00a010.1000/Example',
  ])
    assert.equal(safeLink(input), 'https://doi.org/10.1000/Example');
  for (const input of [
    'doi:\t10.1000/Example',
    'doi:\n10.1000/Example',
    'doi: javascript:alert(1)',
    'doi: 10.1000/Ex ample',
    'https://example.com/a b',
  ])
    assert.equal(safeLink(input), undefined);
});

test('birth-month precision remains editable through native and archival files', () => {
  for (const input of ['2000-05', '2000/05', '2000.05']) {
    const document = createDocument();
    document.profile.birthday = input;
    const normalized = validateDocument(document);
    assert.equal(normalized.profile.birthday, '2000-05');
    assert.equal(parseResumeFile(serializeResume(normalized)).profile.birthday, '2000-05');
    assert.equal(
      parseTextImport(serializeMarkdown(normalized)).document.profile.birthday,
      '2000-05',
    );
    assert.ok(serializeMarkdown(normalized, false).includes('2000\\-05'));
    assert.ok(!serializeMarkdown(normalized, false).includes('2000\\-05\\-01'));
  }
});

test('birth-date precision preserves real dates and rejects invalid calendar values', () => {
  for (const input of [
    '2000-00',
    '2000-13',
    '0000-05',
    '2000-02-30',
    '1900-02-29',
    '2000/02-29',
    '2000',
    'May 2000',
  ]) {
    const document = createDocument();
    document.profile.birthday = input;
    assert.throws(() => validateDocument(document), input);
  }
  const document = createDocument();
  document.profile.birthday = '2000-02-29';
  assert.equal(validateDocument(document).profile.birthday, '2000-02-29');
});

test('semantic import keeps birth month in its dedicated field without inventing a day', () => {
  const document = parseSemanticResume(
    JSON.stringify({ profile: { name: 'Example', birthday: '2000/05' }, sections: [] }),
  );
  assert.equal(document.profile.birthday, '2000-05');
  assert.ok(!document.profile.customFields?.some((field) => field.label === 'Birth date'));
});
