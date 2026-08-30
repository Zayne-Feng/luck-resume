import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDocument,
  createEntry,
  createSection,
  textContent,
  type RichTextNode,
} from '../src/resume/model.ts';
import {
  applyGrammar,
  grammarFields,
  grammarSource,
  suggestionField,
  type GrammarField,
} from '../src/ai/grammar.ts';

function fixture(description?: RichTextNode) {
  const document = createDocument();
  const section = createSection('education');
  const entry = createEntry();
  entry.title = 'University';
  if (description) entry.description = description;
  section.items = [entry];
  document.sections = [section];
  return { document, section, entry };
}

function replace(
  document: ReturnType<typeof createDocument>,
  field: GrammarField,
  original: string,
  replacement: string,
  local = field.text.indexOf(original),
) {
  return applyGrammar(document, field, {
    original,
    replacement,
    start: field.start + local,
    reason: 'Agreement',
  });
}

test('grammar deletion removes marked empty leaves and preserves editable empty paragraphs', () => {
  const { document, entry } = fixture({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'redundant', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' useful text', marks: [{ type: 'italic' }] },
        ],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'remove', marks: [{ type: 'underline' }] }],
      },
    ],
  });
  let field = grammarFields(document).find((item) => item.field === 'description')!;
  assert.equal(replace(document, field, 'redundant', ''), true);
  assert.deepEqual(entry.description.content![0].content, [
    { type: 'text', text: ' useful text', marks: [{ type: 'italic' }] },
  ]);
  field = grammarFields(document).find((item) => item.field === 'description')!;
  assert.equal(replace(document, field, 'remove', ''), true);
  assert.equal(textContent(entry.description), ' useful text\n');
  assert.deepEqual(entry.description.content![1], { type: 'paragraph', content: [] });
});

test('grammar rejects an editor-incompatible rich document before mutating it', () => {
  const { document, entry } = fixture({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'typo' }] },
      { type: 'bulletList', content: [] },
    ],
  });
  const original = structuredClone(entry.description);
  const field = grammarFields(document).find((item) => item.field === 'description')!;
  assert.equal(replace(document, field, 'typo', 'fixed'), false);
  assert.deepEqual(entry.description, original);
});

test('grammar collects and precisely applies all visible editable metadata and display labels', () => {
  const { document, section, entry } = fixture();
  document.profile.name = 'Name sentinel';
  document.profile.location = 'City sentinel';
  document.profile.employmentStatus = 'Status sentinel';
  document.profile.birthday = '2000-01-01';
  document.profile.fieldLabels = { name: 'Name label', location: 'City label' };
  document.profile.customFields = [
    {
      id: 'profile-link',
      label: 'Portfolio label',
      value: 'https://profile.example',
      linkLabel: 'Profile display',
      kind: 'link',
      visible: true,
      showLabel: true,
    },
  ];
  section.title = 'Section sentinel';
  entry.degree = 'Degree sentinel';
  entry.gpa = 'GPA sentinel';
  entry.location = 'Location sentinel';
  entry.startDate = 'Autumn term';
  entry.endDate = 'Spring term';
  entry.fieldLabels = { degree: 'Degree label', gpa: 'GPA label', title: 'University label' };
  entry.link = 'https://entry.example';
  entry.linkLabel = 'Entry display';
  entry.publication = {
    authors: 'Authors sentinel',
    highlightedAuthor: '',
    venue: 'Venue sentinel',
    status: 'none',
    citationStyle: 'plain',
  };
  entry.customFields = [
    {
      id: 'entry-text',
      label: 'Custom label',
      value: 'Custom value',
      kind: 'text',
      visible: true,
      showLabel: true,
    },
  ];
  const fields = grammarFields(document);
  for (const value of [
    'Name sentinel',
    'City sentinel',
    'Status sentinel',
    'Name label',
    'City label',
    'Portfolio label',
    'Profile display',
    'Section sentinel',
    'Degree sentinel',
    'GPA sentinel',
    'Location sentinel',
    'Degree label',
    'GPA label',
    'University label',
    'Entry display',
    'Authors sentinel',
    'Venue sentinel',
    'Custom label',
    'Custom value',
  ]) {
    const field = fields.find((item) => item.text === value);
    assert.ok(field, `Missing ${value}`);
    assert.equal(replace(document, field, value, `${value} revised`), true, value);
  }
  assert.ok(!grammarSource(fields).includes('https://'));
  assert.equal(document.profile.name, 'Name sentinel revised');
  assert.equal(document.profile.fieldLabels.name, 'Name label revised');
  assert.equal(document.profile.customFields[0].linkLabel, 'Profile display revised');
  assert.equal(entry.publication.authors, 'Authors sentinel revised');
  assert.equal(entry.customFields[0].label, 'Custom label revised');
  const birthDate = fields.find((item) => item.text === '2000-01-01')!;
  assert.ok(birthDate);
  assert.equal(replace(document, birthDate, '2000-01-01', '2001-02-03'), true);
  assert.equal(document.profile.birthday, '2001-02-03');
  for (const value of ['Autumn term', 'Spring term']) {
    const field = fields.find((item) => item.text === value)!;
    assert.ok(field);
    assert.equal(replace(document, field, value, `${value} revised`), true);
  }
});

test('grammar metadata replacements preserve native field constraints', () => {
  const { document } = fixture();
  document.profile.email = 'email@example.test';
  document.profile.birthday = '2000-01-01';
  const fields = grammarFields(document);
  assert.equal(
    replace(document, fields.find((item) => item.field === 'email')!, 'email', 'a'.repeat(200)),
    false,
  );
  const birthday = fields.find((item) => item.field === 'birthday')!;
  assert.ok(birthday);
  assert.equal(replace(document, birthday, '2000-01-01', '2000-02-30'), false);
  assert.equal(document.profile.birthday, '2000-01-01');
});

test('grammar identities distinguish equal metadata and refuse hidden, removed and stale targets', () => {
  const { document, section, entry } = fixture();
  document.profile.name = 'Repeated';
  entry.location = 'Repeated';
  const fields = grammarFields(document);
  const target = fields.find((item) => item.entryId === entry.id && item.field === 'location')!;
  assert.ok(target);
  assert.equal(
    suggestionField(fields, {
      original: 'Repeated',
      replacement: 'Changed',
      start: target.start,
      reason: '',
    }),
    target,
  );
  assert.equal(replace(document, target, 'Repeated', 'Changed'), true);
  assert.equal(document.profile.name, 'Repeated');
  assert.equal(entry.location, 'Changed');
  const checks = [
    () => {
      entry.hiddenFields = ['location'];
    },
    () => {
      entry.visible = false;
    },
    () => {
      section.visible = false;
    },
    () => {
      document.sections = [];
    },
    () => {
      entry.location = 'Concurrent';
    },
  ];
  for (const hide of checks) {
    document.sections = [section];
    section.visible = true;
    entry.visible = true;
    entry.hiddenFields = [];
    entry.location = 'Repeated';
    hide();
    assert.equal(replace(document, target, 'Repeated', 'Invalid'), false);
  }
  document.profile.location = 'Removed city';
  document.profile.removedFields = ['location'];
  assert.ok(!grammarFields(document).some((item) => item.text === 'Removed city'));
  const profile = fields.find((item) => item.field === 'name')!;
  document.profile.hiddenFields = ['name'];
  assert.equal(replace(document, profile, 'Repeated', 'Invalid'), false);
});

test('grammar table text preserves cells and rows and rejects replacements crossing cells', () => {
  const cell = (text: string): RichTextNode => ({
    type: 'tableCell',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  const { document, entry } = fixture({
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('Skill'), cell('Level')] },
          { type: 'tableRow', content: [cell('TypeScript'), cell('Expert')] },
        ],
      },
    ],
  });
  const field = grammarFields(document).find((item) => item.field === 'description')!;
  assert.equal(field.text, 'Skill\tLevel\nTypeScript\tExpert');
  const original = structuredClone(entry.description);
  assert.equal(replace(document, field, 'Skill\tLevel', 'Competency'), false);
  assert.deepEqual(entry.description, original);
  assert.equal(replace(document, field, 'TypeScript\tExpert', 'Developer'), false);
  assert.equal(replace(document, field, 'Expert', 'Advanced'), true);
  assert.equal(textContent(entry.description), 'Skill\tLevel\nTypeScript\tAdvanced');
  assert.equal(
    entry.description.content![0].content![1].content![0].content![0].content![0].text,
    'TypeScript',
  );
});
