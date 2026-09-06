import test from 'node:test';
import assert from 'node:assert/strict';
import { richTextToMarkdown, markdownToRichText } from '../src/resume/richTextMarkdown.ts';
import {
  createDocument,
  createEntry,
  createSection,
  textContent,
  type RichTextNode,
} from '../src/resume/model.ts';
import { serializeMarkdown, parseTextImport } from '../src/resume/transfer.ts';

function characters(node: RichTextNode): string[] {
  if (node.type === 'text')
    return [...(node.text ?? '')]
      .filter((c) => !/\s/.test(c))
      .map(
        (c) =>
          `${c}:${(node.marks ?? [])
            .map((m) => m.type)
            .sort()
            .join(',')}`,
      );
  return (node.content ?? []).flatMap(characters);
}

test('all 576 adjacent supported emphasis and script combinations preserve text and marks', () => {
  const variants: NonNullable<RichTextNode['marks']>[] = [];
  for (let bits = 0; bits < 8; bits++)
    for (const script of ['', 'superscript', 'subscript']) {
      const marks = ['bold', 'italic', 'strike']
        .filter((_, index) => bits & (1 << index))
        .map((type) => ({ type }));
      if (script) marks.push({ type: script });
      variants.push(marks);
    }
  for (const left of variants)
    for (const right of variants) {
      const source: RichTextNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Alpha', marks: left },
              { type: 'text', text: 'Beta', marks: right },
            ],
          },
        ],
      };
      assert.deepEqual(
        characters(markdownToRichText(richTextToMarkdown(source))),
        characters(source),
        richTextToMarkdown(source),
      );
    }
});

test('authored readable Markdown keeps body headings inside their original entry', () => {
  const document = createDocument();
  const section = createSection('experience');
  const entry = createEntry();
  entry.title = 'Engineer';
  entry.description = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Selected achievements' }],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'Built accessible tools' }] },
    ],
  };
  section.items = [entry];
  document.sections = [section];
  const restored = parseTextImport(serializeMarkdown(document, false)).document;
  assert.equal(restored.sections.length, 1);
  assert.equal(restored.sections[0].items.length, 1);
  assert.equal(restored.sections[0].items[0].title, 'Engineer');
  assert.equal(
    textContent(restored.sections[0].items[0].description),
    textContent(entry.description),
  );
  assert.equal(restored.sections[0].items[0].description.content?.[0].type, 'heading');
});

test('external Markdown preserves inline code nested inside emphasis and links', () => {
  for (const source of ['**`x`**', '*`x`*', '~~`x`~~', '[a `x`](https://a.com)']) {
    const parsed = markdownToRichText(source);
    assert.ok(
      parsed.content?.[0].content?.some(
        (node) => node.text === 'x' && node.marks?.some((mark) => mark.type === 'code'),
      ),
      source,
    );
  }
});
