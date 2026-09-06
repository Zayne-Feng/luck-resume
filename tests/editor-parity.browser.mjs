import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createDocument, createEntry, createSection, richText } from '../src/resume/model.ts';

const root = new URL('../', import.meta.url);
const baseURL = process.env.LUCK_EDITOR_URL || 'http://127.0.0.1:5178';
let server;
let browser;
try {
  try {
    await fetch(baseURL, { signal: AbortSignal.timeout(1000) });
  } catch {
    await mkdir(new URL('.cache/', root), { recursive: true });
    await writeFile(
      new URL('.cache/editor-vite.config.mjs', root),
      "import react from '@vitejs/plugin-react'; export default {plugins:[react()], optimizeDeps:{entries:['index.html']}};",
    );
    server = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('node_modules/vite/bin/vite.js', root)),
        '--config',
        '.cache/editor-vite.config.mjs',
        '--host',
        '127.0.0.1',
        '--port',
        '5178',
        '--strictPort',
      ],
      { cwd: fileURLToPath(root), windowsHide: true, stdio: 'ignore' },
    );
    for (let attempt = 0; attempt < 300; attempt++) {
      try {
        await fetch(baseURL, { signal: AbortSignal.timeout(1000) });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  browser = await chromium.launch({
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.preview-panel .resume-document');
  const document = createDocument();
  Object.assign(document.profile, {
    name: 'Editor fixture',
    phone: '123456',
    email: 'fixture@example.com',
    birthday: '2000-02-29',
    employmentStatus: 'Open to work',
  });
  const section = createSection('experience');
  const entry = createEntry();
  Object.assign(entry, {
    title: 'Studio',
    subtitle: 'Engineer',
    startDate: '2020',
    endDate: '2024',
    description: richText('Selected color text'),
  });
  section.items = [entry];
  document.sections = [section];
  Object.assign(document.appearance, {
    centerSubtitle: true,
    flexibleHeaderLayout: true,
    entryHeadingSize: 19,
    headingStyle: 'timeline',
  });
  await page.evaluate(async (fixture) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    useWorkspace.getState().add(fixture);
  }, document);
  const profile = page.locator('.profile-module');
  if ((await profile.getAttribute('open')) === null)
    await profile.locator(':scope > summary').click();
  await page.waitForFunction(
    () => document.querySelector('input[name="profile-birthday"]')?.value === '2000-02-29',
  );
  assert.equal(await profile.getByLabel('出生日期', { exact: true }).inputValue(), '2000-02-29');
  await profile.getByLabel('求职状态', { exact: true }).fill('在职，考虑机会');
  const options = profile.locator('.profile-options').first();
  await options.locator(':scope > summary').click();
  const phoneOptions = options
    .locator('.builtin-field-option')
    .filter({ has: page.getByLabel('联系电话显示名称', { exact: true }) });
  await phoneOptions.getByRole('button', { name: '移除编辑字段', exact: true }).click();
  assert.equal(await profile.getByLabel('联系电话', { exact: true }).count(), 0);
  await page.waitForFunction(
    () =>
      !document.querySelector('.pagination-source .resume-contacts').textContent.includes('123456'),
  );
  await phoneOptions.getByRole('button', { name: '恢复编辑字段', exact: true }).click();
  assert.equal(await profile.getByLabel('联系电话', { exact: true }).inputValue(), '123456');
  await profile.getByLabel('邮箱显示下划线', { exact: true }).check();
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector('.pagination-source a[href="mailto:fixture@example.com"]'),
      ).textDecorationLine === 'underline',
  );
  const head = page.locator('.pagination-source .resume-entry-head').first();
  assert.equal(await head.locator('.resume-subtitle-centered').textContent(), 'Engineer');
  assert.equal(
    await head.locator('h3').evaluate((element) => getComputedStyle(element).fontSize),
    '19px',
  );
  assert.equal(
    await head
      .locator('.resume-entry-meta')
      .evaluate((element) => getComputedStyle(element).fontSize),
    '19px',
  );
  assert.equal(await head.evaluate((element) => getComputedStyle(element).display), 'grid');
  assert.equal(
    await page
      .locator('.pagination-source .resume-section')
      .first()
      .evaluate((element) => getComputedStyle(element).borderInlineStartWidth),
    '1px',
  );
  const entryEditor = page.locator(`#entry-${entry.id}`);
  await entryEditor.evaluate((element) => {
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === 'DETAILS') ancestor.open = true;
    }
  });
  const input = entryEditor.locator('.rich-input');
  await input.click();
  await input.press('ControlOrMeta+a');
  await entryEditor.getByLabel('选区字号', { exact: true }).selectOption('16px');
  await entryEditor.getByLabel('文字颜色', { exact: true }).fill('#176854');
  await entryEditor.getByLabel('背景颜色', { exact: true }).fill('#ffeedd');
  await page.waitForFunction(() => {
    const text = document.querySelector('.pagination-source .resume-rich span');
    const mark = document.querySelector('.pagination-source .resume-rich mark');
    return (
      text &&
      mark &&
      getComputedStyle(text).color === 'rgb(23, 104, 84)' &&
      getComputedStyle(mark).backgroundColor === 'rgb(255, 238, 221)'
    );
  });
  const html = await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const { buildPrintHtml } = await import('/src/resume/htmlExport.ts');
    const state = useWorkspace.getState();
    return buildPrintHtml(state.documents[state.activeId]);
  });
  assert.ok(html.includes('rgb(23, 104, 84)') || html.includes('#176854'));
  assert.ok(html.includes('rgb(255, 238, 221)') || html.includes('#ffeedd'));
  assert.ok(html.includes('resume-heading-timeline'));
  assert.ok(html.includes('resume-subtitle-centered'));
  await entryEditor.getByRole('button', { name: '重置文字颜色', exact: true }).click();
  await entryEditor.getByRole('button', { name: '重置背景颜色', exact: true }).click();
  await page.waitForFunction(() => {
    const text = document.querySelector('.pagination-source .resume-rich span');
    return (
      text &&
      getComputedStyle(text).fontSize === '16px' &&
      !document.querySelector('.pagination-source .resume-rich mark')
    );
  });
  await page.locator('.edit-tabs').getByRole('button', { name: '调风格', exact: true }).click();
  await page.locator('.advanced-settings > summary').click();
  await page.getByLabel('锁定照片比例', { exact: true }).check();
  await page.locator('#range-photoWidth').fill('100');
  await page.waitForFunction(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const state = useWorkspace.getState();
    const appearance = state.documents[state.activeId].appearance;
    return (
      appearance.photoWidth === 100 &&
      Math.abs(appearance.photoHeight - 128) < 0.001 &&
      Math.abs(appearance.photoAspectRatio - 1 / 1.28) < 0.001
    );
  });
  await page.locator('#range-photoHeight').fill('64');
  await page.waitForFunction(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const state = useWorkspace.getState();
    return state.documents[state.activeId].appearance.photoWidth === 50;
  });
  for (const [id, value] of [
    ['fontSize', '24'],
    ['lineHeight', '1'],
    ['pageMargin', '0'],
    ['sectionGap', '100'],
    ['paragraphGap', '50'],
  ]) {
    await page.locator(`#range-${id}`).fill(value);
  }
  const state = await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const current = useWorkspace.getState();
    return current.documents[current.activeId];
  });
  assert.deepEqual(
    [
      state.appearance.fontSize,
      state.appearance.lineHeight,
      state.appearance.pageMargin,
      state.appearance.sectionGap,
      state.appearance.paragraphGap,
    ],
    [24, 1, 0, 100, 50],
  );
  assert.deepEqual(errors, []);
  console.log('PASS: editor controls, restored fields, email decoration and heading composition');
} finally {
  await browser?.close();
  server?.kill();
}
