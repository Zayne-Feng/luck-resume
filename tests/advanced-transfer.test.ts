import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createEntry, createField } from '../src/resume/model.ts';
import { parseTextImport, serializeMarkdown } from '../src/resume/transfer.ts';

test('readable document import keeps heading-like text inside fenced code', () => {
  const source =
    '# Ada\n\n## Projects\n\n### Compiler\n\n```markdown\n# Example\n## Not a section\n### Not an entry\n```\n\nAfter code';
  const document = parseTextImport(source).document;
  assert.equal(document.profile.name, 'Ada');
  assert.equal(document.sections.length, 1);
  assert.equal(document.sections[0].items.length, 1);
  const entry = document.sections[0].items[0];
  assert.equal(entry.title, 'Compiler');
  assert.deepEqual(
    entry.description.content?.map((node) => node.type),
    ['codeBlock', 'paragraph'],
  );
  assert.equal(
    entry.description.content?.[0].content?.[0].text,
    '# Example\n## Not a section\n### Not an entry',
  );
  assert.equal(entry.description.content?.[1].content?.[0].text, 'After code');
});

test('education metadata and custom link labels appear in readable and archival Markdown', () => {
  const document = createDocument();
  const entry = {
    ...createEntry(),
    title: 'University',
    subtitle: 'Computer Science',
    degree: 'MSc',
    gpa: '3.9/4.0',
    customFields: [
      {
        ...createField('Portfolio', 'link'),
        value: 'https://example.com',
        linkLabel: 'Selected work',
      },
      { ...createField('Repository', 'link'), value: '', linkLabel: 'Private work' },
    ],
  };
  document.sections[0].items = [entry];
  const readable = serializeMarkdown(document, false);
  for (const value of [
    'Computer Science',
    'MSc',
    'GPA: 3.9/4.0',
    '[Selected work](https://example.com/)',
    'Private work',
  ])
    assert.ok(readable.includes(value));
  const restored = parseTextImport(serializeMarkdown(document)).document.sections[0].items[0];
  assert.equal(restored.degree, 'MSc');
  assert.equal(restored.gpa, '3.9/4.0');
  assert.equal(restored.customFields?.[0].linkLabel, 'Selected work');
  assert.equal(restored.customFields?.[1].linkLabel, 'Private work');
});

test('readable resume headings restore escaped punctuation as ordinary text', () => {
  const document = createDocument();
  document.profile.name = 'Ada-Lin *A*';
  document.sections[0].title = 'Research + Projects';
  document.sections[0].items = [{ ...createEntry(), title: 'Compiler-X ^2^' }];
  const restored = parseTextImport(serializeMarkdown(document, false)).document;
  assert.equal(restored.profile.name, document.profile.name);
  assert.equal(restored.sections[0].title, document.sections[0].title);
  assert.equal(restored.sections[0].items[0].title, document.sections[0].items[0].title);
});
