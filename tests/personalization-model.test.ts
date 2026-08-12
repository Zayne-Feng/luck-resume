import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, createField } from '../src/resume/model.ts';
import { parseResumeFile, serializeResume } from '../src/resume/files.ts';
import { formatResumeDate } from '../src/resume/dates.ts';

test('photo geometry, safe field icons and heading modes survive a version one backup', () => {
  const doc = createDocument('linen', true);
  Object.assign(doc.appearance, {
    photoWidth: 110,
    photoHeight: 150,
    photoRadius: 18,
    photoFit: 'contain',
    photoSide: 'left',
    headerAlign: 'right',
    headerLayout: 'stacked',
    contactIcons: true,
    entryHeadingLayout: 'inline',
    subtitleAlign: 'center',
  });
  Object.assign(doc.profile, { fieldIcons: { email: 'mail', phone: 'phone', website: 'github' } });
  doc.profile.customFields = [Object.assign(createField('Contact'), { icon: 'message' })];
  const restored = parseResumeFile(serializeResume(doc));
  assert.deepEqual(restored.appearance, doc.appearance);
  assert.deepEqual(restored.profile, doc.profile);
});

test('dedicated logos, publication metadata and primary link labels survive backups', () => {
  const doc = createDocument('linen', true);
  Object.assign(doc.sections[0].items[0], {
    linkLabel: 'Read the project',
    logo: 'data:image/png;base64,aGVsbG8=',
    logoSize: 42,
    logoRadius: 8,
    logoVisible: false,
    logoPosition: 'right',
    logoFit: 'contain',
    publication: {
      authors: 'Alice; Bob',
      highlightedAuthor: 'Bob',
      venue: 'Local Conference',
      status: 'accepted',
      citationStyle: 'numbered',
    },
  });
  assert.deepEqual(parseResumeFile(serializeResume(doc)).sections, doc.sections);
});

test('local calendar data survives backups and validates real dates and unique days', () => {
  const doc = createDocument();
  Object.assign(doc.profile, {
    contributions: {
      title: 'Open source activity',
      visible: false,
      year: 2024,
      days: [{ date: '2024-02-29', count: 4 }],
    },
  });
  assert.deepEqual(parseResumeFile(serializeResume(doc)).profile, doc.profile);
  for (const days of [
    [{ date: '2023-02-29', count: 1 }],
    [{ date: '2024-02-29', count: -1 }],
    [
      { date: '2024-01-01', count: 1 },
      { date: '2024-01-01', count: 2 },
    ],
  ]) {
    Object.assign(doc.profile, { contributions: { title: '', visible: true, year: 2024, days } });
    assert.throws(() => parseResumeFile(serializeResume(doc)));
  }
});

test('invalid photo, icon and dedicated media settings cannot enter a backup', () => {
  for (const settings of [
    { photoWidth: 0 },
    { photoHeight: 221 },
    { photoRadius: -1 },
    { headerLayout: 'html' },
    { photoSide: 'above' },
    { subtitleAlign: 'absolute' },
  ]) {
    const doc = createDocument();
    Object.assign(doc.appearance, settings);
    assert.throws(() => parseResumeFile(serializeResume(doc)));
  }
  const doc = createDocument('linen', true);
  Object.assign(doc.profile, { fieldIcons: { email: '<script>' } });
  assert.throws(() => parseResumeFile(serializeResume(doc)));
  delete doc.profile.fieldIcons;
  Object.assign(doc.sections[0].items[0], { logo: 'https://example.com/logo.png' });
  assert.throws(() => parseResumeFile(serializeResume(doc)));
});

test('month-first date formatting works without changing free text', () => {
  assert.equal(formatResumeDate('2024-06', 'MM/YYYY'), '06/2024');
  assert.equal(formatResumeDate('Expected summer', 'MM/YYYY'), 'Expected summer');
  assert.equal(formatResumeDate('present', 'MM/YYYY', 'en'), 'Present');
});
