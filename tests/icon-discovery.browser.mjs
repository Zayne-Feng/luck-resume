import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseURL = process.env.LUCK_ICON_URL || 'http://127.0.0.1:5182';
let server;
try {
  await fetch(baseURL);
} catch {
  server = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host',
      '127.0.0.1',
      '--port',
      '5182',
      '--strictPort',
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(baseURL);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
const browser = await chromium.launch({
  channel:
    process.env.LUCK_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  headless: true,
});
try {
  for (const [locale, width] of [
    ['zh', 1440],
    ['en', 390],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(
      (value) => localStorage.setItem('luck-interface-locale', value),
      locale,
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseURL);
    const profileOptions = page.locator('.profile-options').first();
    await profileOptions.locator(':scope > summary').click();
    const picker = profileOptions
      .locator('.field')
      .filter({ has: page.locator('select') })
      .first();
    const selected = picker.locator('.icon-picker > select');
    assert.ok((await selected.locator('option').count()) >= 61);
    await picker.locator('details > summary').click();
    const search = picker.getByRole('searchbox');
    await search.fill(locale === 'zh' ? '数据库' : 'SQL');
    await picker.getByRole('combobox').nth(1).selectOption('technology');
    assert.ok(await selected.locator('option[value="database"]').count());
    await selected.focus();
    await selected.press('End');
    await selected.press('Enter');
    assert.equal(await selected.inputValue(), 'database');
    await picker.getByRole('combobox').nth(1).selectOption('personal');
    assert.equal(await selected.inputValue(), 'database');
    assert.match(
      await picker.getByRole('status').textContent(),
      locale === 'zh' ? /没有/ : /No icons/,
    );
    await search.fill('');
    await picker.getByRole('combobox').nth(1).selectOption('all');
    await selected.selectOption('github');
    await page.waitForFunction(() =>
      /已保存|Draft saved/.test(document.querySelector('.save-status')?.textContent || ''),
    );
    await page.reload();
    await page.locator('.profile-options > summary').first().click();
    assert.equal(
      await page.locator('.profile-options .icon-picker > select').first().inputValue(),
      'github',
    );
    assert.deepEqual(errors, []);
    console.log(`PASS: icon discovery ${locale} ${width}px`);
    await context.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
