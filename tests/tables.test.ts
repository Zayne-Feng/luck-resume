import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRichText } from '../src/resume/files.ts';
import { richTextToMarkdown, markdownToRichText } from '../src/resume/richTextMarkdown.ts';
import type { RichTextNode } from '../src/resume/model.ts';
import { parseTextImport } from '../src/resume/transfer.ts';

const cell = (text: string, attrs: RichTextNode['attrs'] = {}): RichTextNode => ({
  type: 'tableCell',
  ...(Object.keys(attrs).length ? { attrs } : {}),
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
export const tableFixture: RichTextNode = {
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { ...cell('Skill', { colspan: 2, backgroundColor: '#e3eee7' }), type: 'tableHeader' },
          ],
        },
        {
          type: 'tableRow',
          content: [cell('TypeScript', { rowspan: 2, colwidth: [120] }), cell('Expert')],
        },
        { type: 'tableRow', content: [cell('Accessible tools')] },
      ],
    },
  ],
};
test('tables validate and retain merged cells, widths, shading and rich text through Markdown', () => {
  const value = validateRichText(tableFixture);
  assert.deepEqual(markdownToRichText(richTextToMarkdown(value)), value);
});
test('table geometry rejects overlapping, empty and incomplete cells', () => {
  for (const content of [
    [],
    [{ type: 'tableRow', content: [] }],
    [
      { type: 'tableRow', content: [cell('A'), cell('B')] },
      { type: 'tableRow', content: [cell('C')] },
    ],
    [{ type: 'tableRow', content: [cell('A', { rowspan: 2 })] }],
  ])
    assert.throws(() => validateRichText({ type: 'doc', content: [{ type: 'table', content }] }));
});
test('standard Markdown tables retain row and column structure', () => {
  const value = markdownToRichText('| Skill | Level |\n| --- | --- |\n| TypeScript | Expert |');
  assert.equal(value.content?.[0].type, 'table');
  assert.equal(value.content?.[0].content?.length, 2);
});

test('tables inside list items use the same supported schema as the editor', () => {
  const value: RichTextNode = {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Skills' }] },
              tableFixture.content![0],
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(validateRichText(value), value);
  assert.deepEqual(markdownToRichText(richTextToMarkdown(value)), value);
});

test('local readable import recognizes standalone Markdown and HTML tables', () => {
  for (const input of [
    '| Skill | Level |\n| --- | --- |\n| TypeScript | Expert |',
    '<table><tr><td>Skill</td><td>Level</td></tr></table>',
  ]) {
    const doc = parseTextImport(input).document;
    assert.equal(doc.sections[0].items[0].description.content?.[0].type, 'table');
  }
});
