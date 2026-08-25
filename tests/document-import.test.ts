import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundedCanvasSize,
  parseDocumentPages,
  pdfTextToString,
} from '../src/resume/documentImportHelpers.ts';

test('page ranges are explicit, deduplicated, and processed in document order', () => {
  assert.deepEqual(parseDocumentPages('5, 2-4, 2, 1', 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseDocumentPages('all', 3), [1, 2, 3]);
  assert.deepEqual(parseDocumentPages('2', 3), [2]);
});

test('invalid page ranges never silently clamp or omit pages', () => {
  for (const input of ['', '0', '4', '3-1', '1-', '1,,2', '1.5', '1e1', 'all,1', '1-2-3']) {
    assert.throws(() => parseDocumentPages(input, 3), /page/i, input);
  }
  assert.throws(() => parseDocumentPages('all', 0), /page/i);
});

test('PDF text keeps stream order, repeated text, explicit line breaks, and separated runs', () => {
  assert.equal(
    pdfTextToString([
      { str: 'Name', transform: [1, 0, 0, 12, 10, 100], width: 30 },
      { str: 'Surname', transform: [1, 0, 0, 12, 45, 100], width: 40, hasEOL: true },
      { str: 'Experience', transform: [1, 0, 0, 12, 10, 80], width: 50, hasEOL: true },
      { str: 'Experience', transform: [1, 0, 0, 12, 10, 60], width: 50 },
    ]),
    'Name Surname\nExperience\nExperience',
  );
  assert.equal(
    pdfTextToString([
      { str: '你', transform: [1, 0, 0, 12, 0, 100], width: 12 },
      { str: '好', transform: [1, 0, 0, 12, 12, 100], width: 12 },
      { str: 'Next', transform: [1, 0, 0, 12, 0, 80], width: 24 },
    ]),
    '你好\nNext',
  );
});

test('canvas bounds retain aspect ratio without huge allocations', () => {
  const regular = boundedCanvasSize(600, 800);
  assert.deepEqual(regular, { width: 1200, height: 1600, scale: 2 });
  const huge = boundedCanvasSize(100000, 200000);
  assert.ok(huge.width * huge.height <= 12_000_000);
  assert.ok(huge.width <= 4096 && huge.height <= 4096);
  assert.ok(Math.abs(huge.height / huge.width - 2) < 0.01);
  assert.throws(() => boundedCanvasSize(0, 100), /dimension/i);
});
