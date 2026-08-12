import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDocument,
  createEntry,
  createSection,
  createField,
  cloneEntry,
  templates,
} from '../src/resume/model.ts';
import { parseResumeFile, serializeResume } from '../src/resume/files.ts';
import { formatResumeDate, toMonthValue, dateRangeError } from '../src/resume/dates.ts';

test('custom fields and visibility survive backups without replacing legacy content', () => {
  const doc = createDocument('linen', true);
  const field = createField('Portfolio', 'link');
  field.value = 'https://example.com/work';
  doc.profile.customFields = [field];
  doc.profile.contactOrder = [field.id, 'email', 'phone'];
  doc.profile.hiddenFields = ['location', 'headline'];
  const entry = doc.sections.find((s) => s.type === 'experience')!.items[0];
  entry.visible = false;
  entry.customFields = [createField('Impact')];
  entry.customFields[0].value = 'Reduced processing time by 25%';
  entry.fieldLabels = { title: 'Organization', subtitle: 'Role' };
  entry.hiddenFields = ['location'];
  const restored = parseResumeFile(serializeResume(doc));
  assert.deepEqual(restored.profile, doc.profile);
  assert.deepEqual(restored.sections, doc.sections);
  const copied = cloneEntry(entry);
  assert.notEqual(copied.id, entry.id);
  assert.notEqual(copied.customFields![0].id, entry.customFields[0].id);
  assert.equal(copied.customFields![0].value, entry.customFields[0].value);
});

test('professional modules provide editable field presets and every template restores', () => {
  for (const type of [
    'publications',
    'certifications',
    'awards',
    'languages',
    'volunteering',
    'freeform',
  ] as const) {
    const section = createSection(type);
    const entry = createEntry(type);
    assert.ok(type === 'freeform' || entry.customFields!.length > 0);
    section.items = [entry];
    section.showTitle = false;
    section.breakBefore = true;
    section.placement = 'left';
    const doc = createDocument();
    doc.sections = [section];
    assert.deepEqual(parseResumeFile(serializeResume(doc)).sections, doc.sections);
  }
  assert.equal(templates.length, 9);
  for (const template of templates) {
    const doc = createDocument(template.id);
    assert.equal(parseResumeFile(serializeResume(doc)).appearance.template, template.id);
  }
});

test('extra media stays embedded and custom identifiers cannot shadow built-in contacts', () => {
  const doc = createDocument('linen', true);
  doc.sections[0].items[0].image = 'data:image/png;base64,aGVsbG8=';
  doc.sections[0].items[0].imageWidth = 60;
  assert.equal(parseResumeFile(serializeResume(doc)).sections[0].items[0].imageWidth, 60);
  doc.sections[0].items[0].image = 'https://example.com/image.png';
  assert.throws(() => parseResumeFile(serializeResume(doc)));
  delete doc.sections[0].items[0].image;
  doc.profile.customFields = [{ ...createField('Custom'), id: 'email', value: 'Other address' }];
  assert.throws(() => parseResumeFile(serializeResume(doc)), /标识/);
  assert.equal(
    createDocument('mono').sections.find((s) => s.type === 'education')?.title,
    'Education',
  );
});

test('rich paragraph alignment and local font sizes round trip safely', () => {
  const doc = createDocument('linen', true);
  doc.sections[0].items[0].description = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'center' },
        content: [
          {
            type: 'text',
            text: 'Statement',
            marks: [{ type: 'textStyle', attrs: { fontSize: '18px' } }],
          },
        ],
      },
    ],
  };
  assert.deepEqual(
    parseResumeFile(serializeResume(doc)).sections[0].items[0].description,
    doc.sections[0].items[0].description,
  );
  for (const size of ['999px', '12px;display:none']) {
    const unsafe = JSON.parse(serializeResume(doc));
    unsafe.resume.sections[0].items[0].description.content[0].content[0].marks[0].attrs.fontSize =
      size;
    assert.throws(() => parseResumeFile(JSON.stringify(unsafe)));
  }
});

test('month formatting preserves arbitrary dates and identifies reversed month ranges', () => {
  assert.equal(formatResumeDate('2024-09', 'YYYY.MM', 'zh'), '2024.09');
  assert.equal(formatResumeDate('2024.09', 'MMM YYYY', 'en'), 'Sep 2024');
  assert.equal(formatResumeDate('Summer 2024', 'YYYY/MM', 'en'), 'Summer 2024');
  assert.equal(formatResumeDate('2024.13', 'YYYY-MM', 'zh'), '2024.13');
  assert.equal(toMonthValue('2024/09'), '2024-09');
  assert.ok(dateRangeError('2025.01', '2024.09', false));
  assert.equal(dateRangeError('2025.01', '2024.09', true), '');
});
