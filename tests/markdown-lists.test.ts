import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, type RichTextNode } from '../src/resume/model.ts';
import { parseTextImport, serializeMarkdown } from '../src/resume/transfer.ts';

const paragraph = (text: string): RichTextNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const item = (...content: RichTextNode[]): RichTextNode => ({ type: 'listItem', content });
const bullet = (...content: RichTextNode[]): RichTextNode => ({ type: 'bulletList', content });
const ordered = (start: number, ...content: RichTextNode[]): RichTextNode => ({
  type: 'orderedList',
  attrs: { start },
  content,
});
function exportText(...content: RichTextNode[]): string {
  const document = createDocument();
  document.profile.name = 'Alice';
  document.sections[0].items[0].description = { type: 'doc', content };
  return serializeMarkdown(document, false);
}
function importedContent(text: string): RichTextNode[] {
  return parseTextImport(text).document.sections[0].items[0].description.content!;
}

test('three nested bullet levels export one indentation per marker and import their hierarchy', () => {
  const grandchild = bullet(item(paragraph('Grandchild')));
  const child = bullet(item(paragraph('Child'), grandchild));
  const list = bullet(item(paragraph('Parent'), child), item(paragraph('Sibling')));
  const markdown = exportText(list);
  assert.ok(markdown.includes('- Parent\n  - Child\n    - Grandchild\n- Sibling'));
  assert.deepEqual(importedContent(markdown), [list]);
});

test('ordered list nesting uses each marker width and retains multi-digit starting numbers', () => {
  const list = ordered(
    12,
    item(
      paragraph('First'),
      ordered(
        99,
        item(paragraph('Nested'), bullet(item(paragraph('Leaf')))),
        item(paragraph('Next')),
      ),
    ),
    item(paragraph('Second')),
  );
  const markdown = exportText(list);
  assert.ok(
    markdown.includes('12. First\n    99. Nested\n        - Leaf\n    100. Next\n13. Second'),
  );
  assert.deepEqual(importedContent(markdown), [list]);
});

test('list paragraphs preserve hard breaks, soft lines, and content spaces without repeated indentation', () => {
  const list = ordered(
    12,
    item(
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'First line' },
          { type: 'hardBreak' },
          { type: 'text', text: '  Second line  ' },
        ],
      },
      paragraph('Another paragraph\n  Soft continuation'),
    ),
  );
  const markdown = exportText(list);
  assert.ok(
    markdown.includes(
      '12. First line  \n      Second line  \n\n    Another paragraph\n      Soft continuation',
    ),
  );
  const content = importedContent(markdown);
  assert.equal(content[0].content![0].content!.length, 2);
  assert.deepEqual(content[0].content![0].content![0], list.content![0].content![0]);
  assert.equal(
    content[0].content![0].content![1].content!.map((node) => node.text ?? '').join(''),
    'Another paragraph\n  Soft continuation',
  );
});

test('strike imports alone and with nested emphasis while literal tildes remain text', () => {
  const content = importedContent('~~Result~~ and ~~**impact**~~');
  assert.deepEqual(content[0].content![0].marks, [{ type: 'strike' }]);
  assert.deepEqual(content[0].content![2].marks, [{ type: 'bold' }, { type: 'strike' }]);
  const markdown = exportText(paragraph('Literal ~~words~~'));
  const imported = importedContent(markdown)[0].content!;
  assert.equal(imported.map((node) => node.text ?? '').join(''), 'Literal ~~words~~');
  assert.ok(imported.every((node) => !node.marks));
});

test('unknown indented content and plain-text spaces remain inert and complete', () => {
  const plain = '  Notes  \n\n  <script>noop</script>\n   - Not a root list\n';
  assert.equal(
    importedContent(plain)
      .map((node) => node.content?.map((child) => child.text ?? '').join('') ?? '')
      .join('\n'),
    plain,
  );
  const nested = importedContent('- Parent\n  <script>noop</script>\n  [unsafe](javascript:alert)');
  assert.ok(JSON.stringify(nested).includes('<script>noop</script>'));
  assert.ok(!JSON.stringify(nested).includes('"type":"link"'));
});
