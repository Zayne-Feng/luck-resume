import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDocument,
  createField,
  createEntry,
  createSection,
  richText,
} from '../src/resume/model.ts';
import { reviewDocument } from '../src/resume/review.ts';

test('review counts visible identity and supports custom contact methods', () => {
  const doc = createDocument('linen', true);
  doc.profile.hiddenFields = ['name', 'headline', 'email', 'phone'];
  let checks = reviewDocument(doc);
  for (const id of ['name', 'headline', 'contact'])
    assert.equal(checks.find((check) => check.id === id)?.done, false);
  const field = createField('WeChat');
  field.value = 'my-contact';
  doc.profile.customFields = [field];
  checks = reviewDocument(doc);
  assert.equal(checks.find((check) => check.id === 'contact')?.done, true);
  field.visible = false;
  assert.equal(reviewDocument(doc).find((check) => check.id === 'contact')?.done, false);
});

test('review finds visible custom and rich links and identifies their editor targets', () => {
  const doc = createDocument();
  const section = createSection('projects');
  const entry = createEntry();
  entry.title = 'Local portfolio';
  entry.description = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Read more',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    ],
  };
  const field = createField('Demo', 'link');
  field.value = 'not a valid link';
  entry.customFields = [field];
  section.items = [entry];
  doc.sections = [section];
  const links = reviewDocument(doc).find((check) => check.id === 'links')!;
  assert.equal(links.done, false);
  assert.equal(links.issues.length, 2);
  assert.ok(
    links.issues.every((issue) => issue.sectionId === section.id && issue.entryId === entry.id),
  );
  assert.ok(links.issues.some((issue) => issue.label.includes('Local portfolio')));
  entry.hiddenFields = ['description'];
  field.visible = false;
  assert.equal(reviewDocument(doc).find((check) => check.id === 'links')?.done, true);
  entry.hiddenFields = [];
  entry.visible = false;
  assert.equal(reviewDocument(doc).find((check) => check.id === 'links')?.done, true);
  entry.visible = true;
  section.visible = false;
  assert.equal(reviewDocument(doc).find((check) => check.id === 'links')?.done, true);
});

test('date checks ignore hidden dates and current entries without restricting free text', () => {
  const doc = createDocument();
  const section = createSection('experience');
  const entry = createEntry();
  entry.description = richText('Delivered a project.');
  entry.startDate = '2025-04';
  entry.endDate = '2024-03';
  section.items = [entry];
  doc.sections = [section];
  assert.equal(
    reviewDocument(doc).find((check) => check.id === 'dates')?.issues[0].entryId,
    entry.id,
  );
  entry.hiddenFields = ['dates'];
  assert.equal(reviewDocument(doc).find((check) => check.id === 'dates')?.done, true);
  entry.hiddenFields = [];
  entry.current = true;
  assert.equal(reviewDocument(doc).find((check) => check.id === 'dates')?.done, true);
  entry.current = false;
  entry.startDate = 'Summer internship';
  assert.equal(reviewDocument(doc).find((check) => check.id === 'dates')?.done, true);
});

test('review accepts normalized website, email and DOI destinations', () => {
  const document = createDocument();
  document.profile.website = 'portfolio.example.org';
  document.profile.customFields = ['person@example.org', '10.1234/research'].map((value) => ({
    ...createField('Reference', 'link'),
    value,
  }));
  assert.equal(reviewDocument(document).find((check) => check.id === 'links')?.done, true);
});

test('hidden profile links do not create issues and visible custom links do', () => {
  const doc = createDocument();
  doc.profile.website = 'javascript:alert(1)';
  doc.profile.hiddenFields = ['website'];
  assert.equal(reviewDocument(doc).find((check) => check.id === 'links')?.done, true);
  const field = createField('Portfolio', 'link');
  field.value = 'not a valid link';
  doc.profile.customFields = [field];
  const links = reviewDocument(doc).find((check) => check.id === 'links')!;
  assert.equal(links.issues[0].sectionId, 'profile');
  assert.equal(links.done, false);
});
