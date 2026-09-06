import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDocument, createEntry, createSection, richText } from '../src/resume/model.ts';
import { serializeResume } from '../src/resume/files.ts';

const base = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5196';
const engine = process.env.LUCK_IMPROVEMENTS_ENGINE || 'chromium';
const output = new URL(`../test-results/local-improvements/${engine}/`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === 'chromium' && process.platform === 'win32' ? { channel: 'msedge' } : {},
);
const context = await browser.newContext({ viewport: { width: 1450, height: 1100 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function saved() {
  await page.waitForFunction(() =>
    document.querySelector('.save-status')?.textContent?.includes('草稿已保存'),
  );
}
async function current() {
  await saved();
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('luck-resume');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const row = db
            .transaction('documents')
            .objectStore('documents')
            .get(localStorage.getItem('luck-active'));
          row.onsuccess = () => {
            resolve(row.result.document);
            db.close();
          };
          row.onerror = () => {
            reject(row.error);
            db.close();
          };
        };
      }),
  );
}
async function closeDialog(name) {
  await page
    .getByRole('dialog', { name, exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
}
try {
  const doc = createDocument('linen');
  doc.profile.name = 'LOCAL ORIGINAL';
  doc.profile.email = 'fixture@example.com';
  const section = createSection('experience');
  section.items = [
    {
      ...createEntry(),
      title: 'Original studio',
      description: richText('PRIVATE CONTENT FOR NATIVE BACKUP ONLY'),
    },
  ];
  doc.sections = [section];
  await page.goto(base);
  await page
    .locator('input[accept=".json,application/json"]')
    .first()
    .setInputFiles({
      name: 'local.json',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeResume(doc)),
    });
  await page.waitForFunction(
    () => document.querySelector('.preview-panel h1')?.textContent === 'LOCAL ORIGINAL',
  );
  await page.getByRole('button', { name: '调风格', exact: true }).click();
  await page.getByText('我的样式预设', { exact: true }).click();
  const panel = page.locator('.appearance-presets-panel');
  await page.getByLabel('自定义模板颜色', { exact: true }).fill('#ddd1eb');
  await panel.getByLabel('样式名称', { exact: true }).fill('Personal style');
  await panel.getByRole('button', { name: '保存当前样式', exact: true }).click();
  await panel.getByText('Personal style', { exact: true }).waitFor();
  await page.getByLabel('自定义模板颜色', { exact: true }).fill('#c4d9ce');
  const beforePreview = await current();
  await panel.getByRole('button', { name: '预览样式', exact: true }).first().click();
  assert.deepEqual(await current(), beforePreview);
  await page
    .getByRole('dialog', { name: '样式预览', exact: true })
    .getByRole('button', { name: '应用此样式', exact: true })
    .click();
  let state = await current();
  assert.equal(state.appearance.accent, '#ddd1eb');
  assert.deepEqual(state.profile, beforePreview.profile);
  assert.deepEqual(state.sections, beforePreview.sections);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal((await current()).appearance.accent, '#c4d9ce');

  await panel.getByRole('button', { name: '重命名样式', exact: true }).first().click();
  const rename = page.getByRole('dialog', { name: '重命名样式', exact: true });
  await rename.getByLabel('样式名称', { exact: true }).fill('Renamed style');
  await rename.getByRole('button', { name: '保存样式名称', exact: true }).click();
  await panel.getByText('Renamed style', { exact: true }).waitFor();
  const pendingDownload = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出样式', exact: true }).first().click();
  const stylePath = fileURLToPath(new URL('style.json', output));
  await (await pendingDownload).saveAs(stylePath);
  const styleBytes = await readFile(stylePath);
  assert.equal(styleBytes.toString().includes('PRIVATE CONTENT'), false);
  await panel
    .locator('input[type=file]')
    .setInputFiles({ name: 'style.json', mimeType: 'application/json', buffer: styleBytes });
  const review = page.getByRole('dialog', { name: '检查导入样式', exact: true });
  await review.getByRole('button', { name: '预览样式', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '样式预览', exact: true });
  await preview.getByRole('button', { name: '应用此样式', exact: true }).click();
  await review.getByRole('button', { name: '确认导入样式', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.appearance-preset-list > li').length === 2,
  );
  await page.reload();
  await page.getByRole('button', { name: '调风格', exact: true }).click();
  await page.getByText('我的样式预设', { exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.appearance-preset-list > li').length === 2,
  );

  await page.getByRole('button', { name: '写内容', exact: true }).click();
  await page.getByLabel('姓名', { exact: true }).fill('Before version');
  await saved();
  const identity = (await current()).id;
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const history = page.getByRole('dialog', { name: '版本历史', exact: true });
  await history.getByLabel('版本名称', { exact: true }).fill('Milestone A');
  await history.getByRole('button', { name: '保存命名版本', exact: true }).click();
  await history
    .getByRole('option')
    .filter({ hasText: 'Milestone A' })
    .waitFor({ state: 'attached' });
  await closeDialog('版本历史');
  await page.getByLabel('姓名', { exact: true }).fill('After version');
  await saved();
  await page.reload();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const option = history.getByRole('option').filter({ hasText: 'Milestone A' });
  await history
    .getByLabel('选择版本', { exact: true })
    .selectOption(await option.getAttribute('value'));
  await history.getByText('After version → Before version', { exact: true }).waitFor();
  const beforeHistoryPreview = await current();
  const historyPreview = history.locator('.version-history-preview details').filter({
    has: page.getByText('预览版本', { exact: true }),
  });
  await historyPreview.locator('summary').click();
  const thumbnail = historyPreview.locator('.document-thumbnail');
  async function checkHistoryThumbnail() {
    const bounds = await thumbnail.boundingBox();
    assert.ok(
      bounds && bounds.width > 100 && bounds.height > 100,
      'The expanded history thumbnail must occupy visible space.',
    );
    const textBounds = await historyPreview.locator(':scope > article').first().boundingBox();
    assert.ok(
      textBounds && textBounds.y >= bounds.y + bounds.height,
      'Snapshot text must follow the thumbnail without overlap.',
    );
    assert.ok(
      await thumbnail.locator('h1').isVisible(),
      'The selected snapshot heading must be visible inside the thumbnail.',
    );
    assert.equal(await thumbnail.locator('h1').textContent(), 'Before version');
    assert.ok(
      await thumbnail.evaluate(
        (element) =>
          element.getBoundingClientRect().right <=
          element.parentElement.getBoundingClientRect().right + 1,
      ),
      'The history thumbnail must fit inside its preview.',
    );
  }
  await checkHistoryThumbnail();
  await thumbnail.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: fileURLToPath(new URL('history-thumbnail-desktop.png', output)),
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkHistoryThumbnail();
  await thumbnail.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: fileURLToPath(new URL('history-thumbnail-mobile.png', output)),
    fullPage: false,
  });
  await historyPreview.locator('summary').click();
  assert.equal(await thumbnail.isVisible(), false);
  await historyPreview.locator('summary').click();
  await checkHistoryThumbnail();
  assert.deepEqual(await current(), beforeHistoryPreview);
  await page.setViewportSize({ width: 1450, height: 1100 });
  await history.getByRole('button', { name: '保存当前副本并恢复此版本', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('.pagination-source h1')?.textContent === 'Before version',
  );
  await closeDialog('版本历史');
  assert.equal((await current()).id, identity);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal((await current()).profile.name, 'After version');
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  await history
    .getByRole('option')
    .filter({ hasText: '恢复前副本' })
    .first()
    .waitFor({ state: 'attached' });
  await closeDialog('版本历史');

  await page.getByRole('button', { name: '调风格', exact: true }).click();
  await page.getByRole('checkbox', { name: '自动适配一页', exact: true }).check();
  await page.getByRole('slider', { name: '自动一页最低比例', exact: true }).fill('90');
  await saved();
  assert.equal((await current()).appearance.automaticOnePageMinScale, 0.9);
  await page.getByRole('button', { name: '检查一下', exact: true }).click();
  await page.getByRole('region', { name: '打印版式检查', exact: true }).waitFor();
  assert.equal(await page.locator('.edit-panel-body').evaluate((element) => element.scrollTop), 0);
  await page.screenshot({ path: fileURLToPath(new URL('review.png', output)), fullPage: true });
  const activeBeforeImport = (await current()).id;
  await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
  const workspace = page.getByRole('region', { name: '工作区备份', exact: true });
  const workspaceDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: '准备工作区备份', exact: true }).click();
  const workspacePath = fileURLToPath(new URL('workspace.json', output));
  await (await workspaceDownload).saveAs(workspacePath);
  const workspaceFile = await readFile(workspacePath);
  await workspace
    .getByLabel('选择工作区备份全部分片', { exact: true })
    .setInputFiles({ name: 'workspace.json', mimeType: 'application/json', buffer: workspaceFile });
  await workspace.getByText('工作区备份预览', { exact: false }).waitFor();
  await workspace.getByRole('button', { name: '确认导入工作区副本', exact: true }).click();
  await workspace.getByText('工作区副本已导入', { exact: true }).waitFor();
  assert.equal((await current()).id, activeBeforeImport);
  await closeDialog('导入与导出');
  await page.getByRole('link', { name: '我的简历', exact: true }).click();
  const importedId = await page.evaluate(
    (originalId) =>
      new Promise((resolve, reject) => {
        const opening = indexedDB.open('luck-resume');
        opening.onsuccess = () => {
          const db = opening.result;
          const reading = db.transaction('documents').objectStore('documents').getAll();
          reading.onsuccess = () => {
            resolve(
              reading.result.find(
                (row) => row.id !== originalId && row.document.profile.name === 'After version',
              )?.id,
            );
            db.close();
          };
          reading.onerror = () => reject(reading.error);
        };
        opening.onerror = () => reject(opening.error);
      }),
    activeBeforeImport,
  );
  assert.ok(importedId);
  await page
    .locator('.library-preview')
    .filter({ has: page.locator(`[data-document-id="${importedId}"]`) })
    .click();
  await page.getByRole('button', { name: '写内容', exact: true }).click();
  await page.getByLabel('姓名', { exact: true }).fill('After workspace import');
  await saved();
  assert.equal((await current()).profile.name, 'After workspace import');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: reusable presets, reviewed import preview, undo, durable named history, guarded restore, scale settings and layout checks',
  );
} finally {
  await browser.close();
}
