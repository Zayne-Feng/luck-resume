import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDocument, createEntry, createSection } from '../src/resume/model.ts';

const output = new URL('../test-results/table-pagination/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.LUCK_TEST_URL || 'http://127.0.0.1:5213');
  await page.waitForSelector('.preview-panel .resume-document');
  const doc = createDocument();
  doc.profile.name = 'Table pagination';
  const section = createSection('experience');
  const entry = createEntry();
  entry.title = 'Structured achievements';
  const cell = (text, attrs = {}) => ({
    type: 'tableCell',
    attrs,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  const rows = Array.from({ length: 75 }, (_, index) => ({
    type: 'tableRow',
    content: [
      cell(`Row ${String(index + 1).padStart(2, '0')}`),
      cell(`Result ${String(index + 1).padStart(2, '0')}`),
    ],
  }));
  rows[20].content[0] = cell('Merged pair', { rowspan: 2 });
  rows[21].content.shift();
  entry.description = { type: 'doc', content: [{ type: 'table', content: rows }] };
  section.items = [entry];
  doc.sections = [section];
  await page.evaluate(async (doc) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    useWorkspace.getState().add(doc);
  }, doc);
  await page.waitForFunction(
    (id) =>
      document.querySelector('.pagination-source .resume-document')?.dataset.documentId === id,
    doc.id,
  );
  const html = await page.evaluate(async (doc) => {
    const { buildPrintHtml } = await import('/src/resume/htmlExport.ts');
    return buildPrintHtml(doc);
  }, doc);
  await writeFile(new URL('tables.html', output), html);
  const printed = await browser.newPage();
  await printed.setContent(html);
  await printed.evaluate(() => document.fonts.ready);
  const result = await printed.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('.resume-page'));
    return {
      pages: pages.length,
      rows: pages.flatMap((page) =>
        Array.from(page.querySelectorAll('tr'), (row) => ({
          text: row.textContent,
          cells: row.cells.length,
        })),
      ),
      mergedPages: pages
        .map((page, index) => ({ index, text: page.textContent }))
        .filter((page) => page.text.includes('Merged pair') || page.text.includes('Result 22'))
        .map((page) => page.index),
      overflow: pages.some((page) => {
        const bottom =
          page.getBoundingClientRect().bottom - parseFloat(getComputedStyle(page).paddingBottom);
        return Array.from(page.children).some(
          (child) => child.getBoundingClientRect().bottom > bottom + 1,
        );
      }),
    };
  });
  assert.ok(result.pages >= 2);
  assert.equal(result.rows.length, 75);
  assert.equal(result.rows.filter((row) => row.cells === 1).length, 1);
  assert.equal(new Set(result.mergedPages).size, 1);
  assert.equal(result.overflow, false);
  for (let index = 1; index <= 75; index++)
    assert.equal(
      result.rows.filter((row) => row.text.includes(`Result ${String(index).padStart(2, '0')}`))
        .length,
      1,
    );
  await printed.pdf({
    path: fileURLToPath(new URL('tables.pdf', output)),
    printBackground: true,
    preferCSSPageSize: true,
  });
  await printed.screenshot({ path: fileURLToPath(new URL('tables.png', output)), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(new URL('results.json', output), JSON.stringify({ result, errors }, null, 2));
  console.log(
    JSON.stringify({
      pages: result.pages,
      rows: result.rows.length,
      mergedRowsOnOnePage: true,
      overflow: result.overflow,
      errors,
    }),
  );
} finally {
  await browser.close();
}
