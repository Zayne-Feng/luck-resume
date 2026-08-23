import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, createEntry, createSection } from '../src/resume/model.ts';
import { serializeMarkdown } from '../src/resume/transfer.ts';
import {
  authorSegments,
  publicationCitationLabel,
  publicationStatusName,
  splitAuthors,
} from '../src/resume/publications.ts';

test('authors split on semicolons and newlines while preserving surname commas', () => {
  assert.deepEqual(splitAuthors(' Doe, Jane; 张三\n\n Smith, John；李四 '), [
    'Doe, Jane',
    '张三',
    'Smith, John',
    '李四',
  ]);
});

test('author emphasis matches complete names and preserves text safely', () => {
  assert.deepEqual(authorSegments('Ann; Anna; <script>', 'Ann'), [
    { text: 'Ann', highlighted: true },
    { text: '; ', highlighted: false },
    { text: 'Anna', highlighted: false },
    { text: '; ', highlighted: false },
    { text: '<script>', highlighted: false },
  ]);
  assert.deepEqual(authorSegments('', 'Ann'), []);
});

test('citation labels use position or first author and a valid year', () => {
  const publication = { authors: 'Doe, Jane; John Smith', citationStyle: 'numbered' as const };
  assert.equal(publicationCitationLabel(publication, 2, '2025.04'), '[3]');
  assert.equal(
    publicationCitationLabel({ ...publication, citationStyle: 'author-year' }, 0, '2025.04'),
    '(Doe, Jane et al., 2025)',
  );
  assert.equal(publicationCitationLabel({ authors: '', citationStyle: 'author-year' }, 0), '');
  assert.equal(publicationCitationLabel({ ...publication, citationStyle: 'plain' }, 0), '');
});

test('publication status labels follow the selected document language', () => {
  assert.equal(publicationStatusName('accepted'), '已接收');
  assert.equal(publicationStatusName('preprint', 'en'), 'Preprint');
  assert.equal(publicationStatusName('none'), '');
});

test('author delimiters prefer explicit separators over surname and localized commas', () => {
  assert.deepEqual(splitAuthors('Doe, Jane; 张三，李四\nSmith, John'), [
    'Doe, Jane',
    '张三，李四',
    'Smith, John',
  ]);
  assert.deepEqual(splitAuthors(' 张三，李四、Jane Doe, Jr. '), ['张三', '李四', 'Jane Doe, Jr.']);
  assert.deepEqual(splitAuthors(' Alice Smith, Bob Jones, 张三 '), [
    'Alice Smith',
    'Bob Jones',
    '张三',
  ]);
  assert.deepEqual(splitAuthors(' ;；\n '), []);
});

test('author emphasis ignores case and edge contribution marks without changing displayed names', () => {
  assert.deepEqual(
    authorSegments(' Jane Doe*† ; JANE DOE‡#; Jane Doe Jr.; Jane Doerr', ' jane doe '),
    [
      { text: 'Jane Doe*†', highlighted: true },
      { text: '; ', highlighted: false },
      { text: 'JANE DOE‡#', highlighted: true },
      { text: '; ', highlighted: false },
      { text: 'Jane Doe Jr.', highlighted: false },
      { text: '; ', highlighted: false },
      { text: 'Jane Doerr', highlighted: false },
    ],
  );
  assert.deepEqual(authorSegments('张三†, 李四', '张三*'), [
    { text: '张三†', highlighted: true },
    { text: '; ', highlighted: false },
    { text: '李四', highlighted: false },
  ]);
  assert.equal(authorSegments('*†‡#', '#')[0].highlighted, false);
  assert.equal(authorSegments('Anne-Marie; AnneMarie', 'AnneMarie')[0].highlighted, false);
  assert.equal(authorSegments('Jane*Doe; Jane Doe', 'JaneDoe')[0].highlighted, false);
});

test('readable Markdown keeps surname commas and contribution markers with normalized emphasis', () => {
  const document = createDocument();
  const section = createSection('publications');
  const entry = createEntry('publications');
  entry.title = 'Mixed author study';
  entry.publication = {
    authors: 'Doe, Jane*†; 张三; Jane Doerr',
    highlightedAuthor: ' doe, jane ',
    venue: 'Journal',
    status: 'published',
    citationStyle: 'plain',
  };
  section.items = [entry];
  document.sections = [section];
  assert.ok(serializeMarkdown(document, false).includes('**Doe, Jane\\*†**; 张三; Jane Doerr'));
});
