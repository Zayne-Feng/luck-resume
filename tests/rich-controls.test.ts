import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResumeFile, serializeResume, validateRichText } from '../src/resume/files.ts';
import { createDocument, type RichTextNode } from '../src/resume/model.ts';
import { parseTextImport, serializeMarkdown } from '../src/resume/transfer.ts';

const formatted: RichTextNode = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { textAlign: 'justify', paragraphIndent: 4, lineHeight: 1.4 },
      content: [
        {
          type: 'text',
          text: 'Selected words',
          marks: [
            { type: 'bold' },
            { type: 'italic' },
            { type: 'underline' },
            { type: 'strike' },
            { type: 'link', attrs: { href: 'https://example.com' } },
            { type: 'textStyle', attrs: { fontSize: '16px' } },
            { type: 'highlight', attrs: { color: 'mint' } },
          ],
        },
      ],
    },
  ],
};

test('JSON and archival Markdown preserve paragraph formatting and all seven text marks', () => {
  const source = createDocument();
  source.sections[0].items[0].description = structuredClone(formatted);
  assert.deepEqual(
    parseResumeFile(serializeResume(source)).sections[0].items[0].description,
    formatted,
  );
  assert.deepEqual(
    parseTextImport(serializeMarkdown(source)).document.sections[0].items[0].description,
    formatted,
  );
});

test('paragraph formatting accepts supported bounds and rejects arbitrary styles', () => {
  for (const attrs of [
    { paragraphIndent: 0, lineHeight: 1.2 },
    { paragraphIndent: 1, lineHeight: 1.4 },
    { paragraphIndent: 2, lineHeight: 1.6 },
    { paragraphIndent: 3, lineHeight: 1.8 },
    { paragraphIndent: 4, lineHeight: 2 },
  ]) {
    const node = { type: 'doc', content: [{ type: 'paragraph', attrs }] };
    assert.deepEqual(validateRichText(node), node);
  }
  for (const attrs of [
    { paragraphIndent: -1 },
    { paragraphIndent: 5 },
    { paragraphIndent: 1.5 },
    { paragraphIndent: '2' },
    { paragraphIndent: Infinity },
    { lineHeight: 1.3 },
    { lineHeight: '1.4' },
    { lineHeight: NaN },
    { lineHeight: '1.4; color:red' },
  ])
    assert.throws(() => validateRichText({ type: 'doc', content: [{ type: 'paragraph', attrs }] }));
});

test('highlight validation preserves palette tokens and six-digit hex colors', () => {
  for (const color of ['mint', 'blue', 'pink', 'lilac', 'butter', '#c4d9ce']) {
    const node = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Highlight', marks: [{ type: 'highlight', attrs: { color } }] },
          ],
        },
      ],
    };
    assert.deepEqual(validateRichText(node), node);
  }
  for (const color of ['red', '#c4d9c', 'mint; color:red', '', null, 1]) {
    assert.throws(() =>
      validateRichText({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Highlight', marks: [{ type: 'highlight', attrs: { color } }] },
            ],
          },
        ],
      }),
    );
  }
});

test('old version one text and null editor defaults remain importable', () => {
  assert.deepEqual(validateRichText({ type: 'doc', content: [{ type: 'paragraph' }] }), {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
  assert.deepEqual(
    validateRichText({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            textAlign: null,
            paragraphIndent: null,
            lineHeight: null,
          },
        },
      ],
    }),
    { type: 'doc', content: [{ type: 'paragraph' }] },
  );
});

test('readable Markdown emits strike and ignores visual-only paragraph and highlight styles', () => {
  const source = createDocument();
  source.sections[0].items[0].description = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { paragraphIndent: 2, lineHeight: 2 },
        content: [
          {
            type: 'text',
            text: 'Measured result',
            marks: [{ type: 'strike' }, { type: 'highlight', attrs: { color: 'pink' } }],
          },
        ],
      },
    ],
  };
  const output = serializeMarkdown(source, false);
  assert.ok(output.includes('~~Measured result~~'));
  assert.ok(
    !output.includes('<mark') &&
      !output.includes('line-height') &&
      !output.includes('paragraphIndent'),
  );
});
