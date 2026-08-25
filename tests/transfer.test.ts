import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, createField, richText, textContent } from '../src/resume/model.ts';
import { parseTextImport, serializeMarkdown } from '../src/resume/transfer.ts';

test('visible Markdown excludes hidden identity, entries, fields, and archival payload', () => {
  const doc = createDocument('linen', true);
  doc.title = 'PRIVATE_DOCUMENT_NAME';
  doc.profile.name = 'PRIVATE_NAME';
  doc.profile.hiddenFields = ['name', 'email'];
  doc.profile.email = 'PRIVATE_EMAIL';
  doc.profile.customFields = [
    { ...createField('Private'), value: 'PRIVATE_FIELD', visible: false },
  ];
  const section = doc.sections.find((section) => section.type === 'experience')!;
  section.items[0].visible = false;
  section.items[0].title = 'PRIVATE_ENTRY';
  const output = serializeMarkdown(doc, false);
  for (const secret of [
    'PRIVATE_DOCUMENT_NAME',
    'PRIVATE_NAME',
    'PRIVATE_EMAIL',
    'PRIVATE_FIELD',
    'PRIVATE_ENTRY',
    'luck-resume:v1:',
  ])
    assert.ok(!output.includes(secret));
});

test('Markdown restores hidden content, custom fields, formatting, and fresh identities', () => {
  const source = createDocument('research', true);
  source.profile.customFields = [{ ...createField('Research ID'), value: 'A-12', visible: false }];
  source.profile.contactOrder = [source.profile.customFields[0].id, 'email'];
  source.sections[0].visible = false;
  source.sections[0].items[0].description = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'center' },
        content: [
          {
            type: 'text',
            text: 'Hidden details',
            marks: [{ type: 'textStyle', attrs: { fontSize: '18px' } }],
          },
        ],
      },
    ],
  };
  const markdown = serializeMarkdown(source);
  assert.ok(markdown.startsWith('# '));
  assert.ok(!markdown.slice(0, markdown.indexOf('<!-- luck-resume')).includes('Hidden details'));
  const imported = parseTextImport(markdown);
  assert.deepEqual(imported.warnings, []);
  assert.notEqual(imported.document.id, source.id);
  assert.notEqual(imported.document.sections[0].id, source.sections[0].id);
  assert.notEqual(imported.document.profile.customFields![0].id, source.profile.customFields[0].id);
  assert.equal(imported.document.profile.customFields![0].value, 'A-12');
  assert.equal(
    imported.document.profile.contactOrder![0],
    imported.document.profile.customFields![0].id,
  );
  assert.equal(imported.document.sections[0].visible, false);
  assert.deepEqual(
    imported.document.sections[0].items[0].description,
    source.sections[0].items[0].description,
  );
});

test('edited readable Markdown becomes the import while the embedded original stays selectable', () => {
  const source = createDocument();
  source.profile.name = 'Alice';
  source.sections[0].items[0].description = richText('Original wording');
  const result = parseTextImport(
    serializeMarkdown(source).replace('Original wording', 'Edited wording'),
  );
  assert.ok(result.warnings.length > 0);
  assert.ok(JSON.stringify(result.document).includes('Edited wording'));
  assert.ok(!JSON.stringify(result.document).includes('Original wording'));
  assert.ok(JSON.stringify(result.embeddedDocument).includes('Original wording'));
});

test('common headings, entries, inline marks, and lists import as structured editable text', () => {
  const result = parseTextImport(
    '# Alice\n\n## Work Experience\n### Engineer\n**Impact** and *care* with [site](https://example.com)\n- First\n- Second\n\n## 教育经历\n### University\n2019–2023\n\n## Unfamiliar section\nKeep me',
  );
  assert.equal(result.document.profile.name, 'Alice');
  assert.deepEqual(
    result.document.sections.map((section) => section.type),
    ['experience', 'education', 'freeform'],
  );
  assert.equal(result.document.sections[0].items[0].title, 'Engineer');
  const rich = result.document.sections[0].items[0].description;
  assert.ok(JSON.stringify(rich).includes('"type":"bold"'));
  assert.ok(JSON.stringify(rich).includes('"type":"italic"'));
  assert.ok(JSON.stringify(rich).includes('"type":"link"'));
  assert.ok(JSON.stringify(rich).includes('"type":"bulletList"'));
  assert.ok(textContent(result.document.sections[2].items[0].description).includes('Keep me'));
});

test('plain text preserves lines and spaces and treats HTML and unsafe links as inert text', () => {
  const text =
    '  Contact notes  \n\n<script>alert(1)</script>\n[unsafe](javascript:alert)\nFinal line\n';
  const result = parseTextImport(text, 'Notes');
  assert.equal(result.document.title, 'Notes');
  assert.equal(textContent(result.document.sections[0].items[0].description), text);
  assert.ok(!JSON.stringify(result.document).includes('"type":"link"'));
  assert.ok(JSON.stringify(result.document).includes('<script>'));
});

test('invalid embedded records recover readable text with a warning and imports enforce size', () => {
  const invalid = btoa(
    JSON.stringify({ format: 'luck-resume-markdown', version: 1, bodyHash: 'bad', resume: {} }),
  );
  const result = parseTextImport(`## Notes\nVisible text\n\n<!-- luck-resume:v1:${invalid} -->\n`);
  assert.ok(result.warnings.length > 0);
  assert.equal(result.embeddedDocument, undefined);
  assert.ok(JSON.stringify(result.document).includes('Visible text'));
  assert.throws(() => parseTextImport('x'.repeat(64 * 1024 * 1024 + 1)), /64 MB/);
});

test('single inline emphasis and long headings preserve editable text without truncation', () => {
  const italic = parseTextImport('*Careful work*');
  assert.equal(
    italic.document.sections[0].items[0].description.content![0].content![0].marks![0].type,
    'italic',
  );
  const sectionTitle = 'Section '.repeat(30);
  const entryTitle = 'Role '.repeat(90);
  const result = parseTextImport(`## ${sectionTitle}\n### ${entryTitle}\nComplete body`);
  const visibleText = textContent(result.document.sections[0].items[0].description);
  assert.ok(JSON.stringify(result.document).includes(sectionTitle));
  assert.ok(JSON.stringify(result.document).includes(entryTitle));
  assert.ok(JSON.stringify(result.document).includes('Complete body'));
  assert.ok(visibleText.length > 0);
});

test('edited body can be empty while the embedded original remains selectable', () => {
  const source = createDocument();
  const markdown = serializeMarkdown(source);
  const emptyBody = '\n' + markdown.slice(markdown.indexOf('<!-- luck-resume'));
  const result = parseTextImport(emptyBody);
  assert.ok(result.embeddedDocument);
  assert.ok(result.warnings.length > 0);
  assert.equal(result.document.profile.name, '');
});
