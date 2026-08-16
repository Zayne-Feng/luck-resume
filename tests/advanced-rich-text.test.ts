import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDocument,
  validateRichText,
  serializeResume,
  parseResumeFile,
} from '../src/resume/files.ts';
import { createDocument, createEntry, type RichTextNode } from '../src/resume/model.ts';
import { FONT_SIZES, normalizeFontSize } from '../src/resume/textFormatting.ts';

export const advancedDocument: RichTextNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Results' }] },
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Evidence', marks: [{ type: 'code' }] }],
        },
      ],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'typescript' },
      content: [{ type: 'text', text: 'const value = `<safe>`;\n' }],
    },
    { type: 'horizontalRule' },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '2', marks: [{ type: 'superscript' }] },
        { type: 'text', text: 'n', marks: [{ type: 'subscript' }] },
      ],
    },
  ],
};

test('advanced structures survive trusted validation and native files', () => {
  assert.deepEqual(validateRichText(advancedDocument), advancedDocument);
  const document = createDocument();
  const entry = {
    ...createEntry(),
    degree: 'MSc',
    gpa: '3.9/4.0',
    description: advancedDocument,
    customFields: [
      {
        id: 'portfolio',
        label: 'Work',
        value: 'https://example.com',
        kind: 'link' as const,
        visible: true,
        showLabel: true,
        linkLabel: 'Selected work',
      },
    ],
  };
  document.sections[0].items = [entry];
  const restored = parseResumeFile(serializeResume(validateDocument(document))).sections[0]
    .items[0];
  assert.equal(restored.degree, 'MSc');
  assert.equal(restored.gpa, '3.9/4.0');
  assert.equal(restored.customFields?.[0].linkLabel, 'Selected work');
  assert.deepEqual(restored.description, advancedDocument);
});

test('every integer font size from 10 to 48 is supported', () => {
  assert.deepEqual(
    FONT_SIZES,
    Array.from({ length: 39 }, (_, index) => index + 10),
  );
  for (const size of FONT_SIZES) assert.equal(normalizeFontSize(`${size}px`), `${size}px`);
  for (const size of ['9px', '49px', '10.5px', 'calc(12px)'])
    assert.equal(normalizeFontSize(size), undefined);
});

test('advanced schema rejects unsafe structure and attributes', () => {
  for (const child of [
    { type: 'heading', attrs: { level: 5 } },
    { type: 'codeBlock', attrs: { language: '<script>' } },
    { type: 'horizontalRule', content: [{ type: 'text', text: 'invisible' }] },
    { type: 'codeBlock', content: [{ type: 'text', text: 'code', marks: [{ type: 'bold' }] }] },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'unsafe',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        },
      ],
    },
  ])
    assert.throws(() => validateRichText({ type: 'doc', content: [child] }));
});
