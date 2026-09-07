import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { createDocument, createSection, richText } from '../src/resume/model.ts';
import { serializeResume } from '../src/resume/files.ts';

const base = process.env.LUCK_MATRIX_URL || 'http://127.0.0.1:5175';
const output = new URL('../test-results/matrix/', import.meta.url);
await mkdir(output, { recursive: true });
const results = [];
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  if (process.env.LUCK_MATRIX_ENGINES && !process.env.LUCK_MATRIX_ENGINES.split(',').includes(name))
    continue;
  console.log(`Checking ${name}`);
  const browser = await engine.launch(
    name === 'chromium' && process.platform === 'win32' ? { channel: 'msedge' } : {},
  );
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [],
    external = [],
    failed = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin)
      external.push(request.url());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  try {
    await page.goto(base);
    await page.locator('select[aria-label="界面语言"]').waitFor();
    const doc = createDocument();
    doc.title = 'Matrix original title';
    doc.profile.name = '林知夏 Matrix';
    doc.profile.headline = 'Product engineer';
    doc.profile.fieldLabels = { email: '工作经历' };
    doc.profile.customFields = [
      {
        id: 'custom-contact',
        label: '标题',
        value: 'good',
        kind: 'text',
        visible: true,
        showLabel: true,
      },
    ];
    const summary = createSection('summary');
    summary.items[0].description = richText('Built accessible editing tools. MATRIX END 98765');
    summary.title = '工作经历';
    summary.items[0].customFields = [
      {
        id: 'custom-entry',
        label: '标题',
        value: 'good',
        kind: 'text',
        visible: true,
        showLabel: true,
      },
    ];
    doc.sections = [summary];
    await page.locator('input[accept=".json,application/json"]').setInputFiles({
      name: 'matrix.json',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeResume(doc)),
    });
    await page.getByRole('textbox', { name: '简历名称', exact: true }).waitFor();
    await page.waitForFunction(() =>
      document
        .querySelector('.pagination-source .resume-document')
        ?.textContent?.includes('MATRIX END 98765'),
    );
    await page.waitForFunction(
      () => document.querySelector('button[aria-label="导出 PDF"]')?.disabled === false,
    );
    await page.getByRole('combobox', { name: '界面语言' }).selectOption('en');
    await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(
      await page.getByRole('textbox', { name: 'Resume name', exact: true }).inputValue(),
      doc.title,
    );
    assert.ok((await page.locator('.pagination-source').textContent()).includes(doc.profile.name));
    await page
      .locator('details.profile-options')
      .first()
      .evaluate((node) => {
        node.open = true;
      });
    assert.ok(
      (await page.locator('.contact-order').textContent()).includes('标题'),
      `${name}: custom contact label`,
    );
    assert.ok(
      (await page.locator('.contact-order').textContent()).includes('工作经历'),
      `${name}: contact alias`,
    );
    await page.locator('.edit-tabs').getByRole('button', { name: 'Review', exact: true }).click();
    assert.ok(
      (await page.locator('.local-writing-panel').textContent()).includes('工作经历'),
      `${name}: original section title`,
    );
    assert.ok(
      (await page.locator('.local-writing-panel').textContent()).includes('标题'),
      `${name}: original custom field label`,
    );
    await page.locator('.layout-quality-panel').waitFor();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.getByRole('combobox', { name: 'Interface language' }).selectOption('zh');
    await page.waitForFunction(
      () => document.querySelector('button[aria-label="导出 PDF"]')?.disabled === false,
    );
    for (const font of ['Luck Sans', 'Luck Serif', 'Luck WenKai', 'Luck XiaoWei']) {
      const loaded = await page.evaluate(
        async (family) => (await document.fonts.load(`400 16px "${family}"`, '中文Aa0123')).length,
        font,
      );
      assert.ok(loaded > 0, `${name}: ${font}`);
    }
    await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
    await page.getByRole('heading', { name: '目录自动备份', exact: true }).waitFor();
    await page.getByRole('heading', { name: '导入 PDF 或图片', exact: true }).waitFor();
    const pending = page.waitForEvent('download', { timeout: 120000 });
    await page.getByRole('button', { name: '导出长图 PNG', exact: true }).click();
    const download = await pending;
    await download.saveAs(new URL(`${name}.png`, output).pathname.replace(/^\/(\w:)/, '$1'));
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.screenshot({
      path: new URL(`${name}-desktop.png`, output).pathname.replace(/^\/(\w:)/, '$1'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: new URL(`${name}-mobile.png`, output).pathname.replace(/^\/(\w:)/, '$1'),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${name}: mobile overflow`,
    );
    assert.deepEqual(errors, [], `${name}: page errors`);
    assert.deepEqual(external, [], `${name}: external requests`);
    assert.deepEqual(failed, [], `${name}: missing assets`);
    results.push({
      engine: name,
      status: 'passed',
      checks: [
        'JSON import',
        'locale persistence',
        'original text preserved',
        'four local fonts',
        'backup and import panels',
        'long PNG download',
        'desktop and mobile layout',
        'same-origin assets',
        'no page errors',
      ],
    });
  } catch (error) {
    await page.screenshot({
      path: new URL(`${name}-failure.png`, output).pathname.replace(/^\/(\w:)/, '$1'),
      fullPage: true,
    });
    results.push({
      engine: name,
      status: 'failed',
      error: error.message,
      errors,
      external,
      failed,
    });
  } finally {
    await browser.close();
  }
}
await writeFile(new URL('results.json', output), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
assert.ok(
  results.every((result) => result.status === 'passed'),
  'Browser matrix has failures',
);
