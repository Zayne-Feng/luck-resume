import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planLongExport,
  longExportFilename,
  MAX_CANVAS_AREA,
  MAX_CANVAS_EDGE,
  MAX_PDF_POINTS,
} from '../src/resume/longExportGeometry.ts';

test('continuous output retains the final pixel at the requested readable scale', () => {
  const plan = planLongExport(794, 4500.4, 'png');
  assert.equal(plan.scale, 2);
  assert.equal(plan.pixelWidth, 1588);
  assert.equal(plan.pixelHeight, 9001);
  assert.equal(
    plan.tiles.reduce((height, tile) => height + tile.pixelHeight, 0),
    9001,
  );
  assert.equal(plan.tiles[0].pixelTop, 0);
  for (let index = 1; index < plan.tiles.length; index++) {
    const previous = plan.tiles[index - 1];
    assert.equal(plan.tiles[index].pixelTop, previous.pixelTop + previous.pixelHeight);
  }
});

test('splits large images into bounded strips without reducing resolution', () => {
  const plan = planLongExport(794, 12000, 'png', 2);
  assert.ok(plan.tiles.length > 1);
  assert.equal(plan.scale, 2);
  for (const tile of plan.tiles) {
    assert.ok(tile.pixelHeight <= MAX_CANVAS_EDGE);
    assert.ok(tile.pixelHeight * plan.pixelWidth <= MAX_CANVAS_AREA);
  }
});

test('PDF coordinates represent one continuous page in points independently of raster scale', () => {
  const normal = planLongExport(794, 1800, 'pdf', 2);
  const larger = planLongExport(794, 1800, 'pdf', 3);
  assert.equal(normal.pdfWidth, 595.5);
  assert.equal(normal.pdfHeight, 1350);
  assert.equal(normal.pdfHeight, larger.pdfHeight);
  assert.throws(() => planLongExport(794, MAX_PDF_POINTS / 0.75 + 1, 'pdf'), /A4|HTML/);
});

test('rejects invalid dimensions, unreadable scale, and excessive allocation before rendering', () => {
  for (const size of [0, -1, NaN, Infinity]) {
    assert.throws(() => planLongExport(size, 200, 'png'));
    assert.throws(() => planLongExport(794, size, 'png'));
  }
  assert.throws(() => planLongExport(794, 200, 'png', 0.5));
  assert.throws(() => planLongExport(794, 200, 'png', 5));
  assert.throws(() => planLongExport(794, 100000, 'png'), /A4|HTML/);
});

test('filenames identify ordered image parts and remain portable', () => {
  assert.equal(longExportFilename('Resume / QA:*?', 'png', 0, 1), 'Resume _ QA___-long.png');
  assert.equal(longExportFilename('Resume', 'png', 1, 3), 'Resume-long-part-02-of-03.png');
  assert.equal(longExportFilename('  ', 'pdf', 0, 1), 'resume-long.pdf');
});
