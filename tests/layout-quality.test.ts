import assert from 'node:assert/strict';
import test from 'node:test';
import { minimumOnePageScale } from '../src/resume/automaticOnePage.ts';
import { analyzeLayoutGeometry, type PageGeometry } from '../src/resume/layoutQuality.ts';
import { createDocument } from '../src/resume/model.ts';
import { validateDocument } from '../src/resume/files.ts';

const page = (overrides: Partial<PageGeometry> = {}): PageGeometry => ({
  top: 40,
  bottom: 1080,
  contentBottom: 1000,
  scale: 1,
  text: [{ fontSize: 16, characters: 30 }],
  headings: [],
  ...overrides,
});

test('minimum scale accepts only finite values in the supported interval', () => {
  for (const value of [undefined, null, '', 'bad', 0.49, 1.01, NaN, Infinity])
    assert.equal(minimumOnePageScale(value), 0.5);
  assert.equal(minimumOnePageScale('0.75'), 0.75);
  assert.equal(minimumOnePageScale(1), 1);
  assert.equal(minimumOnePageScale(0.5), 0.5);
});

test('optional minimum scale preserves legacy documents and validates native JSON', () => {
  const doc = createDocument('linen');
  assert.equal(validateDocument(doc).appearance.automaticOnePageMinScale, undefined);
  for (const value of [0.5, 0.8, 1]) {
    doc.appearance.automaticOnePageMinScale = value;
    assert.equal(validateDocument(doc).appearance.automaticOnePageMinScale, value);
  }
  for (const value of [0.4, 1.1, NaN, Infinity]) {
    doc.appearance.automaticOnePageMinScale = value;
    assert.throws(() => validateDocument(doc));
  }
});

test('empty pages have no invented text size or sparse-page issue', () => {
  assert.deepEqual(analyzeLayoutGeometry([]), { scale: 1, smallestTextPt: undefined, issues: [] });
  assert.equal(
    analyzeLayoutGeometry([page({ text: [], contentBottom: undefined }), page()]).issues.length,
    0,
  );
});

test('effective print size includes automatic scale and ignores short decoration', () => {
  const result = analyzeLayoutGeometry([
    page({
      scale: 0.75,
      text: [
        { fontSize: 16, characters: 40, target: { sectionId: 's', entryId: 'e' } },
        { fontSize: 6, characters: 1 },
      ],
    }),
  ]);
  assert.equal(result.smallestTextPt, 9);
  assert.equal(result.issues.length, 0);
  const smaller = analyzeLayoutGeometry([page({ scale: 0.5 })]);
  assert.equal(smaller.smallestTextPt, 6);
  assert.equal(smaller.issues[0].kind, 'small-text');
});

test('short body fragments remain meaningful when rich text marks split a paragraph', () => {
  const result = analyzeLayoutGeometry([
    page({
      scale: 0.5,
      text: [
        {
          fontSize: 16,
          characters: 2,
          body: true,
          target: { sectionId: 'body', entryId: 'short' },
        },
        { fontSize: 16, characters: 1, body: true },
        { fontSize: 4, characters: 1 },
        { fontSize: 2, characters: 0, body: true },
      ],
    }),
  ]);
  assert.equal(result.smallestTextPt, 6);
  assert.equal(result.issues[0].kind, 'small-text');
  assert.deepEqual(result.issues[0].target, { sectionId: 'body', entryId: 'short' });
});

test('orphan heading diagnostics are stable and deduplicate section targets', () => {
  const heading = { bottom: 1040, target: { sectionId: 's' } };
  const result = analyzeLayoutGeometry([
    page({
      headings: [
        heading,
        heading,
        { bottom: 200, nextContentTop: 220, target: { sectionId: 'other' } },
      ],
    }),
  ]);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].kind, 'orphan-heading');
  assert.deepEqual(result.issues[0].target, { sectionId: 's' });
  assert.deepEqual(
    result,
    analyzeLayoutGeometry([
      page({
        headings: [
          heading,
          heading,
          { bottom: 200, nextContentTop: 220, target: { sectionId: 'other' } },
        ],
      }),
    ]),
  );
});

test('unused space is reported only on non-final pages without intentional breaks', () => {
  assert.equal(
    analyzeLayoutGeometry([page({ contentBottom: 500 }), page()]).issues[0].kind,
    'sparse-page',
  );
  assert.equal(
    analyzeLayoutGeometry([page({ contentBottom: 500, manualBreakAfter: true }), page()]).issues
      .length,
    0,
  );
  assert.equal(analyzeLayoutGeometry([page({ contentBottom: 500 })]).issues.length, 0);
});
