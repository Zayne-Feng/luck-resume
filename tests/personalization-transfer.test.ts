import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from '../src/resume/model.ts';
import { createEntry, createSection, hasEntryContent } from '../src/resume/model.ts';
import { serializeMarkdown } from '../src/resume/transfer.ts';

test('readable Markdown retains safe primary link labels and publication author emphasis', () => {
  const doc = createDocument('research', true);
  const entry = doc.sections[0].items[0];
  entry.link = 'https://example.com/paper';
  entry.linkLabel = 'Read [paper]';
  entry.publication = {
    authors: 'Alice; Bob',
    highlightedAuthor: 'Bob',
    venue: 'Local Journal',
    status: 'accepted',
    citationStyle: 'plain',
  };
  const markdown = serializeMarkdown(doc, false);
  assert.ok(markdown.includes('[Read \\[paper\\]](https://example.com/paper)'));
  assert.ok(markdown.includes('Alice; **Bob**'));
  assert.ok(markdown.includes('Local Journal'));
  entry.hiddenFields = ['link', 'publication'];
  const hidden = serializeMarkdown(doc, false);
  assert.ok(
    !hidden.includes('Local Journal') &&
      !hidden.includes('Alice;') &&
      !hidden.includes('example.com/paper'),
  );
});

test('calendar text is included only when its output is visible', () => {
  const doc = createDocument();
  doc.profile.contributions = {
    title: 'Local activity',
    visible: true,
    year: 2024,
    days: [{ date: '2024-02-29', count: 12 }],
  };
  assert.match(serializeMarkdown(doc, false), /Local activity.*2024.*12/);
  doc.profile.contributions.visible = false;
  assert.ok(!serializeMarkdown(doc, false).includes('Local activity'));
});

test('visible publication citation prefixes use the same numbering and hidden dates as the document', () => {
  const doc = createDocument();
  const section = createSection('publications');
  const blank = createEntry();
  const entry = createEntry();
  entry.title = 'Study';
  entry.startDate = '2024-06';
  entry.publication = {
    authors: 'Alice',
    highlightedAuthor: '',
    venue: '',
    status: 'none',
    citationStyle: 'numbered',
  };
  section.items = [blank, entry];
  doc.sections = [section];
  assert.ok(serializeMarkdown(doc, false).includes('### \\[1\\] Study'));
  entry.publication.citationStyle = 'author-year';
  assert.ok(serializeMarkdown(doc, false).includes('(Alice, 2024) Study'));
  entry.hiddenFields = ['dates'];
  const hidden = serializeMarkdown(doc, false);
  assert.ok(hidden.includes('(Alice) Study') && !hidden.includes('2024'));
  entry.title = '';
  entry.subtitle = 'Subtitle study';
  entry.publication.citationStyle = 'numbered';
  const fallback = serializeMarkdown(doc, false);
  assert.ok(fallback.includes('### \\[1\\] Subtitle study'));
  assert.equal(fallback.split('Subtitle study').length - 1, 1);
});

test('a visible publication status is printable content and can be hidden independently', () => {
  const entry = createEntry();
  entry.publication = {
    authors: '',
    highlightedAuthor: '',
    venue: '',
    status: 'accepted',
    citationStyle: 'plain',
  };
  assert.equal(hasEntryContent(entry), true);
  entry.hiddenFields = ['publication'];
  assert.equal(hasEntryContent(entry), false);
});
