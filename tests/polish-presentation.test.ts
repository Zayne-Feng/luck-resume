import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRichSuggestion } from '../src/resume/polishPresentation.ts';
import { richTextToMarkdown } from '../src/resume/richTextMarkdown.ts';
import type { RichTextNode } from '../src/resume/model.ts';

const source: RichTextNode = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2, textAlign: 'center' },
      content: [{ type: 'text', text: 'Achievements' }],
    },
    {
      type: 'paragraph',
      attrs: { paragraphIndent: 2, lineHeight: 1.8 },
      content: [
        {
          type: 'text',
          text: 'Built tools',
          marks: [
            { type: 'underline' },
            { type: 'textStyle', attrs: { fontSize: '18px', color: '#123456' } },
          ],
        },
      ],
    },
  ],
};
test('unchanged AI wording restores exact rich source including non-Markdown presentation', () => {
  assert.deepEqual(applyRichSuggestion(source, richTextToMarkdown(source)), source);
});
test('changed AI wording preserves corresponding block alignment and uniform presentation', () => {
  const result = applyRichSuggestion(source, '## Achievements\n\nBuilt accessible tools');
  assert.equal(result.content?.[0].attrs?.textAlign, 'center');
  assert.equal(result.content?.[1].attrs?.paragraphIndent, 2);
  assert.deepEqual(result.content?.[1].content?.[0].marks, source.content?.[1].content?.[0].marks);
});
test('users can explicitly apply only suggested Markdown formatting', () => {
  const result = applyRichSuggestion(source, '## Achievements\n\nBuilt accessible tools', false);
  assert.equal(result.content?.[0].attrs?.textAlign, undefined);
  assert.equal(result.content?.[1].content?.[0].marks, undefined);
});
test('mixed presentation stays attached to unchanged words instead of shifting to new words', () => {
  const mixed: RichTextNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Built ' },
          {
            type: 'text',
            text: 'tools',
            marks: [{ type: 'textStyle', attrs: { color: '#123456' } }],
          },
        ],
      },
    ],
  };
  const result = applyRichSuggestion(mixed, 'Built accessible tools');
  const content = result.content![0].content!;
  assert.equal(
    content
      .filter((n) => n.marks?.some((m) => m.type === 'textStyle'))
      .map((n) => n.text)
      .join(''),
    'tools',
  );
});

test('inserted and reordered paragraphs do not inherit unrelated presentation', () => {
  const p = (text: string, color: string): RichTextNode => ({
    type: 'paragraph',
    content: [{ type: 'text', text, marks: [{ type: 'textStyle', attrs: { color } }] }],
  });
  const value: RichTextNode = {
    type: 'doc',
    content: [p('Lead teams', '#ff0000'), p('Built tools', '#0000ff')],
  };
  const output = applyRichSuggestion(value, 'An introductory note\n\nLead teams\n\nBuilt tools');
  assert.equal(output.content![0].content![0].marks, undefined);
  assert.equal(output.content![1].content![0].marks?.[0].attrs?.color, '#ff0000');
  assert.equal(output.content![2].content![0].marks?.[0].attrs?.color, '#0000ff');
  const reordered = applyRichSuggestion(value, 'Built tools\n\nLead teams');
  assert.equal(reordered.content![0].content![0].marks?.[0].attrs?.color, '#0000ff');
  assert.equal(reordered.content![1].content![0].marks?.[0].attrs?.color, '#ff0000');
});
