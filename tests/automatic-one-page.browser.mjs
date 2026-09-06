import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import {
  createDocument,
  createSection,
  createEntry,
  richText,
  templateIds,
} from '../src/resume/model.ts';
import { serializeResume } from '../src/resume/files.ts';

const base = process.env.LUCK_PARITY_URL || 'http://127.0.0.1:5184';
const output = new URL('../test-results/automatic-one-page/', import.meta.url);
await mkdir(output, { recursive: true });
const engine = process.env.LUCK_ONE_PAGE_ENGINE || 'chromium';
const browser = await { chromium, firefox, webkit }[engine].launch({
  ...(engine === 'chromium' && process.platform === 'win32' ? { channel: 'msedge' } : {}),
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on('pageerror', (error) => errors.push(error.message));
page.setDefaultTimeout(20000);

function fixture(count = 14) {
  const doc = createDocument('graduate');
  doc.profile.name = `AUTOMATIC A4 中文简历 ${doc.id.slice(0, 4)}`;
  doc.appearance.fontSize = 16;
  const section = createSection('experience');
  section.items = Array.from({ length: count }, (_, i) => ({
    ...createEntry(),
    title: `Independent studio ${i + 1}`,
    subtitle: 'Product engineer',
    description: richText(
      'Designed practical tools for complex workflows and improved the experience for every customer.',
    ),
  }));
  doc.sections = [section];
  return doc;
}
async function load(doc) {
  await page.goto(base);
  await page.locator('input[accept=".json,application/json"]').setInputFiles({
    name: 'automatic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeResume(doc)),
  });
  await page.waitForFunction(
    (name) => document.querySelector('.pagination-source h1')?.textContent === name,
    doc.profile.name,
  );
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="导出 PDF"]')?.disabled === false,
  );
}
async function scale() {
  return Number(
    await page.locator('.preview-panel .resume-page').first().getAttribute('data-one-page-scale'),
  );
}

try {
  const doc = fixture();
  await load(doc);
  assert.ok((await page.locator('.preview-panel .resume-page').count()) > 1);
  await page.getByRole('button', { name: '调风格', exact: true }).click();
  const control = page.getByRole('checkbox', { name: '自动适配一页', exact: true });
  await control.check();
  await page.waitForFunction(
    () => document.querySelector('.preview-panel .resume-page')?.dataset.onePageFit === 'fitted',
  );
  assert.equal(await page.locator('.preview-panel .resume-page').count(), 1);
  const initial = await scale();
  assert.ok(initial >= 0.5 && initial < 1);
  await page
    .locator('details')
    .filter({ has: page.locator('#range-fontSize') })
    .locator(':scope > summary')
    .click();
  await page.locator('#range-fontSize').fill('18');
  await page.waitForFunction(
    (previous) =>
      Number(document.querySelector('.preview-panel .resume-page')?.dataset.onePageScale) <
      previous,
    initial,
  );
  await page.waitForFunction(() =>
    document.querySelector('.save-status')?.textContent?.includes('草稿已保存'),
  );
  await page.reload();
  await page.getByRole('button', { name: '调风格', exact: true }).click();
  assert.equal(await control.isChecked(), true);
  assert.equal(await page.locator('#range-fontSize').inputValue(), '18');
  await page.waitForFunction(
    () => document.querySelector('.preview-panel .resume-page')?.dataset.onePageFit === 'fitted',
  );

  await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
  async function download(button, name) {
    const pending = page.waitForEvent('download', { timeout: 120000 });
    await page.getByRole('button', { name: button, exact: true }).click();
    await (await pending).saveAs(fileURLToPath(new URL(name, output)));
  }
  await download('下载 A4 PDF 文件', `automatic-${engine}.pdf`);
  await download('导出长图 PNG', `long-${engine}.png`);
  const png = await readFile(new URL(`long-${engine}.png`, output));
  assert.ok(Math.abs(png.readUInt32BE(20) / png.readUInt32BE(16) - 297 / 210) < 0.002);
  await download('导出长页 PDF', `long-${engine}.pdf`);
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  if (engine === 'chromium')
    await page.pdf({
      path: fileURLToPath(new URL('native-chromium.pdf', output)),
      printBackground: true,
      preferCSSPageSize: true,
    });
  await page.screenshot({
    path: fileURLToPath(new URL(`automatic-${engine}.png`, output)),
    fullPage: true,
  });
  await control.uncheck();
  await page.waitForFunction(
    () => document.querySelectorAll('.preview-panel .resume-page').length > 1,
  );

  for (const template of templateIds) {
    const sample = fixture(14);
    Object.assign(sample.appearance, { template, automaticOnePage: true });
    await load(sample);
    await page.waitForFunction(
      () => document.querySelector('.preview-panel .resume-page')?.dataset.onePageFit === 'fitted',
    );
    assert.ok((await scale()) >= 0.5 && (await scale()) < 1, template);
    const geometry = await page.locator('.preview-panel .resume-page').evaluate((paper) => {
      const outer = paper.getBoundingClientRect();
      const inner = paper.querySelector('.resume-one-page-content').getBoundingClientRect();
      return {
        inside: inner.bottom <= outer.bottom + 0.5 && inner.right <= outer.right + 0.5,
        text: paper.textContent,
      };
    });
    assert.equal(geometry.inside, true, template);
    assert.ok(geometry.text.includes('Independent studio 14'), template);
  }

  const excessive = fixture(180);
  excessive.appearance.automaticOnePage = true;
  await load(excessive);
  await page.waitForFunction(
    () =>
      document.querySelector('.preview-panel .resume-page')?.dataset.onePageFit === 'cannot-fit',
  );
  assert.ok((await page.locator('.preview-panel .resume-page').count()) > 1);
  assert.equal(await page.locator('.preview-panel .resume-entry').count(), 180);

  const manual = fixture(2);
  manual.appearance.automaticOnePage = true;
  const extra = createSection('projects');
  extra.breakBefore = true;
  extra.items = [{ ...createEntry(), title: 'Separate page' }];
  manual.sections.push(extra);
  await load(manual);
  await page.waitForFunction(
    () =>
      document.querySelector('.preview-panel .resume-page')?.dataset.onePageFit === 'manual-breaks',
  );
  assert.equal(await page.locator('.preview-panel .resume-page').count(), 2);
  await page.getByRole('button', { name: '调风格', exact: true }).click();
  await page.getByRole('button', { name: '恢复默认排版', exact: true }).click();
  assert.equal(await control.isChecked(), false);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: continuous one-page layout, saved preference, nine templates, PDF, bounded fallback and manual breaks',
  );
} finally {
  await browser.close();
}
