import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { createDocument, createSection, createEntry, richText } from '../src/resume/model.ts';
import { serializeResume } from '../src/resume/files.ts';

const base = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5195';
const engine = process.env.LUCK_IMPROVEMENTS_ENGINE || 'chromium';
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === 'chromium' && process.platform === 'win32' ? { channel: 'msedge' } : {},
);
try {
  const page = await browser.newPage({ viewport: { width: 1450, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const doc = createDocument();
  doc.profile.name = 'DISCOVERY FIXTURE';
  doc.profile.email = 'fixture@example.com';
  const section = createSection('experience');
  section.items = [
    {
      ...createEntry(),
      title: 'Discoverable studio',
      subtitle: 'Engineer',
      description: richText('Original description remains available.'),
    },
  ];
  doc.sections = [section];
  await page.goto(base);
  await page.locator('input[accept=".json,application/json"]').setInputFiles({
    name: 'discovery.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeResume(doc)),
  });
  await page.waitForFunction(
    () => document.querySelector('.preview-panel h1')?.textContent === 'DISCOVERY FIXTURE',
  );
  const picker = page.getByRole('button', { name: '点选预览编辑', exact: true });
  assert.equal(await picker.count(), 1, 'Preview selection must be reachable');
  await page.getByRole('button', { name: '调风格', exact: true }).click();
  await page.getByLabel('查找排版设置', { exact: true }).fill('文字行高');
  await page.locator('.setting-search-results').getByRole('button').first().click();
  assert.equal(
    await page.locator('#range-lineHeight').evaluate((input) => input === document.activeElement),
    true,
  );
  assert.equal((await page.locator('.advanced-settings').getAttribute('open')) !== null, true);
  await picker.click();
  await page.locator('.preview-panel .resume-entry').first().click();
  await page.waitForFunction(() => document.activeElement?.closest('.entry-editor') !== null);
  assert.equal(
    await page.getByRole('button', { name: '写内容', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  const entryId = await page.locator('.entry-editor').first().getAttribute('id');
  assert.equal(
    await page.evaluate(() => document.activeElement?.closest('.entry-editor')?.id),
    entryId,
  );
  await page.locator('.preview-panel .resume-header').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.closest('.profile-module') !== null);
  const mail = page.locator('.preview-panel .resume-contacts a').first();
  assert.equal(await mail.getAttribute('href'), null);
  await mail.click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('name') === 'profile-email',
  );
  assert.match(
    await page.locator('.print-root .resume-contacts a').first().getAttribute('href'),
    /^mailto:/,
  );
  await picker.click();
  assert.match(
    await page.locator('.preview-panel .resume-contacts a').first().getAttribute('href'),
    /^mailto:/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '预览简历', exact: true }).click();
  await picker.click();
  await page.locator('.preview-panel .resume-entry').first().click();
  await page.waitForFunction(() => document.activeElement?.closest('.entry-editor') !== null);
  assert.equal(await page.locator('.edit-panel').isVisible(), true);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: settings discovery, expanded controls, pointer/keyboard preview editing and preserved links',
  );
} finally {
  await browser.close();
}
