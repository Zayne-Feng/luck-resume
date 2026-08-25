import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToRichText, richTextToMarkdown } from '../src/resume/richTextMarkdown.ts';
import { parseTableHtml } from '../src/resume/tableInterchange.ts';
import { validateRichText } from '../src/resume/files.ts';
import {
  createDocument,
  createSection,
  createEntry,
  richText,
  type RichTextNode,
} from '../src/resume/model.ts';
import { parseTextImport, serializeMarkdown } from '../src/resume/transfer.ts';

const plain = (node: RichTextNode): string => node.text ?? (node.content ?? []).map(plain).join('');
const table = '<table><tr><td>A</td></tr></table>';

test('HTML table import retains adjacent tables and supported sibling blocks', () => {
  const value = markdownToRichText(
    `${table}<p>After table</p>${table}<h2>Heading</h2><ul><li>Item</li></ul>`,
  );
  assert.deepEqual(
    value.content?.map((node) => node.type),
    ['table', 'paragraph', 'table', 'heading', 'bulletList'],
  );
  assert.equal(plain(value), 'AAfter tableAHeadingItem');
  assert.throws(() => parseTableHtml(`${table}<p>After table</p>`), /single table/i);
});

test('multiline nested tables and code literals do not consume following Markdown', () => {
  const source =
    '<table>\n<tr><td><pre><code>&lt;table&gt;\n&lt;/table&gt;</code></pre><table>\n<tr><td>Nested</td></tr>\n</table></td></tr>\n</table><p>After</p>\n\n## Following\n\nOrdinary text';
  const value = markdownToRichText(source);
  assert.deepEqual(
    value.content?.map((node) => node.type),
    ['table', 'paragraph', 'heading', 'paragraph'],
  );
  assert.equal(plain(value), '<table>\n</table>NestedAfterFollowingOrdinary text');
  assert.deepEqual(markdownToRichText(richTextToMarkdown(value)), value);
});

test('HTML lists and recoverable native text normalize to editor-compatible children', () => {
  const value = markdownToRichText(
    '<table><tr><td><ul><li><h2>Heading item</h2></li></ul></td></tr></table>',
  );
  const item = value.content![0].content![0].content![0].content![0].content![0];
  assert.deepEqual(
    item.content?.map((node) => node.type),
    ['paragraph', 'heading'],
  );
  const native = validateRichText({
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [
                  { type: 'text', text: '' },
                  { type: 'text', text: 'Keep' },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(native.content![0].content![0].content![0].type, 'paragraph');
  assert.deepEqual(native.content![0].content![0].content![1].content, [
    { type: 'text', text: 'Keep' },
  ]);
  assert.deepEqual(
    validateRichText({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '', marks: [{ type: 'bold' }] }] },
      ],
    }),
    { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
  );
});

test('external pre/code becomes an unmarked codeBlock with language and literal text', () => {
  const value = markdownToRichText(
    '<table><tr><td><pre><code class="language-typescript">const answer = 42;\n&amp;copy;</code></pre><p>Keep</p></td></tr></table>',
  );
  const block = value.content![0].content![0].content![0].content![0];
  assert.deepEqual(block, {
    type: 'codeBlock',
    attrs: { language: 'typescript' },
    content: [{ type: 'text', text: 'const answer = 42;\n&copy;' }],
  });
  assert.equal(plain(value), 'const answer = 42;\n&copy;Keep');
});

test('nested spans merge textStyle into one mark', () => {
  const value = markdownToRichText(
    '<table><tr><td><p><span style="font-size:18px;color:#abcdef"><span style="color:#123456">Styled</span></span></p></td></tr></table>',
  );
  assert.deepEqual(value.content![0].content![0].content![0].content![0].content![0].marks, [
    { type: 'textStyle', attrs: { fontSize: '18px', color: '#123456' } },
  ]);
});

test('Markdown entities decode text and safe destinations while code stays literal', () => {
  const value = markdownToRichText(
    '[Open](https://example.test/?a=1&amp;b=2) &copy; &#169; &#x1f600; `&copy;`',
  );
  assert.equal(plain(value), 'Open © © 😀 &copy;');
  assert.equal(
    value.content![0].content![0].marks![0].attrs?.href,
    'https://example.test/?a=1&b=2',
  );
  assert.equal(plain(markdownToRichText('```html\n&copy;\n```')), '&copy;');
  assert.equal(plain(markdownToRichText('x'.repeat(20001) + '&copy;')), 'x'.repeat(20001) + '©');
  assert.ok(
    !JSON.stringify(markdownToRichText('[unsafe](javascript&colon;alert(1))')).includes(
      '"type":"link"',
    ),
  );
});

test('native entity-shaped text and destinations retain literal ampersands through Markdown', () => {
  const source: RichTextNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '&copy; &amp; &#169; <img onerror=alert(1)>',
            marks: [{ type: 'link', attrs: { href: 'https://example.test/?a=1&amp;b=2' } }],
          },
        ],
      },
    ],
  };
  assert.deepEqual(markdownToRichText(richTextToMarkdown(source)), source);
});

test('Markdown link decoding follows HTML attribute entity boundaries', () => {
  const value = markdownToRichText('[Open](https://example.test/?a=&notit;&b=&copy;)');
  assert.equal(
    value.content![0].content![0].marks![0].attrs?.href,
    'https://example.test/?a=&notit;&b=%C2%A9',
  );
});

test('Markdown preserves incomplete and unknown entity references', () => {
  const source = '&not &copy &#169 &#xA9 &notit; &unknown;';
  assert.equal(plain(markdownToRichText(source)), source);
  assert.equal(plain(markdownToRichText('&not; &copy; &#169; &#xA9;')), '¬ © © ©');
});

test('HTML table siblings retain quotes, code and separators', () => {
  const value = markdownToRichText(
    `${table}<blockquote>Quote</blockquote><pre><code>const x = 1;</code></pre><hr>`,
  );
  assert.deepEqual(
    value.content?.map((node) => node.type),
    ['table', 'blockquote', 'codeBlock', 'horizontalRule'],
  );
  assert.equal(plain(value), 'AQuoteconst x = 1;');
});

test('HTML pre content observes the shared nesting limit', () => {
  const source = `<table><tr><td><pre>${'<span>'.repeat(45)}code${'</span>'.repeat(45)}</pre></td></tr></table>`;
  assert.throws(() => markdownToRichText(source), /nesting|复杂/);
});

test('readable Markdown headings preserve native ampersands and entity-shaped literals', () => {
  const source = createDocument();
  source.profile.name = 'R&D &copy;';
  const section = createSection('experience');
  const entry = createEntry();
  section.title = 'R&D &copy;';
  entry.title = 'R&D &copy;';
  entry.description = richText('Body');
  section.items = [entry];
  source.sections = [section];
  const result = parseTextImport(serializeMarkdown(source, false)).document;
  assert.equal(result.profile.name, source.profile.name);
  assert.equal(result.sections[0].title, section.title);
  assert.equal(result.sections[0].items[0].title, entry.title);
});

test('external Markdown headings decode inline entities and keep escaped entity literals', () => {
  const value = parseTextImport(
    '# R&amp;D &copy;\n\n## Section &amp; &#169;\n\n### - Alice &copy; \\&copy;\n\nBody',
  ).document;
  assert.equal(value.profile.name, 'R&D ©');
  assert.equal(value.sections[0].title, 'Section & ©');
  assert.equal(value.sections[0].items[0].title, '- Alice © &copy;');
});
