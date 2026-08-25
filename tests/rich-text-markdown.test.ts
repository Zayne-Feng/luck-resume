import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRichText } from '../src/resume/files.ts';
import { textContent } from '../src/resume/model.ts';

test('shared Markdown codec preserves advanced blocks, nested lists and inline marks', async () => {
  const { richTextToMarkdown, markdownToRichText } = await import(
    '../src/resume/richTextMarkdown.ts'
  );
  const input =
    '# Heading\n\n> A **bold** and *italic* quote with `code`.\n>\n> - Outer\n>   - Inner\n\n```typescript\nconst x = `<safe>`;\n```\n\n---\n\nH~2~O and x^2^ with [site](https://example.com/a%28b%29).';
  const parsed = markdownToRichText(input);
  assert.deepEqual(validateRichText(parsed), parsed);
  assert.deepEqual(markdownToRichText(richTextToMarkdown(parsed)), parsed);
  assert.equal(parsed.content?.[0].type, 'heading');
  assert.equal(parsed.content?.[1].type, 'blockquote');
  assert.equal(parsed.content?.[2].attrs?.language, 'typescript');
  assert.equal(parsed.content?.[3].type, 'horizontalRule');
  assert.match(richTextToMarkdown(parsed), /```typescript/);
});

test('Markdown parser treats HTML literally and rejects executable destinations', async () => {
  const { richTextToMarkdown, markdownToRichText } = await import(
    '../src/resume/richTextMarkdown.ts'
  );
  const input =
    '<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert(1))\n\n[bad](data:text/html,unsafe)';
  const parsed = markdownToRichText(input);
  assert.equal(textContent(parsed), input.replace(/\n\n/g, '\n'));
  assert.ok(!JSON.stringify(parsed).includes('"type":"link"'));
  assert.equal(textContent(markdownToRichText(richTextToMarkdown(parsed))), textContent(parsed));
  assert.throws(() => markdownToRichText('x'.repeat(2 * 1024 * 1024 + 1)), /large|limit/i);
});

test('Markdown escaped syntax, nested marks, balanced links and code fences round trip', async () => {
  const { richTextToMarkdown, markdownToRichText } = await import(
    '../src/resume/richTextMarkdown.ts'
  );
  const parsed = markdownToRichText(
    '## Title\n\n**Bold *and italic*** [a **label**](https://example.com/a(b)) \\*literal\\*\n\n````js\n```\n````',
  );
  assert.equal(textContent(parsed), 'Title\nBold and italic a label *literal*\n```');
  assert.deepEqual(markdownToRichText(richTextToMarkdown(parsed)), parsed);
});

test('inline code requires matching fence runs and handles long unmatched runs in linear time', async () => {
  const { markdownToRichText } = await import('../src/resume/richTextMarkdown.ts');
  const literal = markdownToRichText('`value``');
  assert.equal(textContent(literal), '`value``');
  assert.ok(!JSON.stringify(literal).includes('"type":"code"'));
  const source = 'a' + '`'.repeat(160000) + 'b';
  const start = performance.now();
  assert.equal(textContent(markdownToRichText(source)), source);
  assert.ok(
    performance.now() - start < 1000,
    'An unmatched delimiter run must be processed as one token.',
  );
});

test('Markdown keeps boundary spaces outside emphasis and serializes many backtick runs safely', async () => {
  const { richTextToMarkdown, markdownToRichText } = await import(
    '../src/resume/richTextMarkdown.ts'
  );
  for (const text of ['word ', ' word', ' word ']) {
    const markdown = richTextToMarkdown({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] },
      ],
    });
    const parsed = markdownToRichText(markdown);
    assert.equal(textContent(parsed), text);
    assert.ok(
      parsed.content?.[0].content?.some(
        (node) => node.text === 'word' && node.marks?.some((mark) => mark.type === 'bold'),
      ),
    );
  }
  const text = '`a'.repeat(200000);
  for (const code of [false, true]) {
    const markdown = richTextToMarkdown({
      type: 'doc',
      content: [{ type: code ? 'codeBlock' : 'paragraph', content: [{ type: 'text', text }] }],
    });
    assert.equal(textContent(markdownToRichText(markdown)), text);
  }
});
