import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDocument, createSection, richText } from '../src/resume/model.ts';
import { serializeResume } from '../src/resume/files.ts';

const base = process.env.LUCK_PARITY_URL || 'http://127.0.0.1:5185';
const output = new URL('../test-results/parity/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel:
    process.env.LUCK_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
});
const errors = [],
  external = [],
  results = [];
async function pageFor(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    acceptDownloads: true,
    ...options,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin)
      external.push(request.url());
  });
  return page;
}
async function load(page, doc) {
  await page.goto(base);
  await page.locator('input[accept=".json,application/json"]').setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeResume(doc)),
  });
  await page.waitForFunction(
    (name) => document.querySelector('.pagination-source h1')?.textContent === name,
    doc.profile.name,
  );
  await saved(page);
}
async function saved(page) {
  await page.waitForFunction(() =>
    document.querySelector('.save-status')?.textContent?.includes('草稿已保存'),
  );
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="导出 PDF"]')?.disabled === false,
  );
}
async function current(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('luck-resume');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('documents')
            .objectStore('documents')
            .get(localStorage.getItem('luck-active'));
          read.onsuccess = () => {
            resolve(read.result?.document);
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      }),
  );
}
try {
  const page = await pageFor();
  const doc = createDocument();
  doc.profile.name = 'PARITY ENGINEER';
  doc.title = 'Parity original';
  const section = createSection('summary');
  section.items[0].description = richText(
    ...Array.from(
      { length: 25 },
      (_, i) =>
        `Paragraph ${i + 1}: synthetic resume text for reliable original-layout verification.`,
    ),
  );
  const final = createSection('custom');
  final.breakBefore = true;
  final.items[0].description = richText('PARITY FINAL CONTENT 98765 中文简历');
  doc.sections = [section, final];
  await load(page, doc);
  const before = await current(page);
  await page.getByRole('link', { name: '模板中心', exact: true }).click();
  await page.getByLabel('自定义颜色', { exact: true }).fill('#e6e0ef');
  await page.locator('.template-preview').nth(1).click();
  const modal = page.getByRole('dialog');
  await modal.waitFor();
  assert.deepEqual(await current(page), before, 'Template preview must not mutate the document');
  await modal.getByRole('button', { name: '应用到当前简历', exact: true }).click();
  await saved(page);
  const applied = await current(page);
  assert.equal(applied.appearance.template, 'column');
  assert.equal(applied.appearance.accent, '#e6e0ef');
  assert.equal(applied.id, before.id);
  results.push('non-mutating enlarged template preview and applied gallery color');
  const expectedPages = await page.locator('.preview-panel .resume-page').count();
  await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: '下载 A4 PDF 文件', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(fileURLToPath(new URL('direct.pdf', output)));
  const pdf = await readFile(fileURLToPath(new URL('direct.pdf', output)));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.toString('latin1').includes('/ToUnicode'));
  assert.equal(Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1]), expectedPages);
  results.push('direct selectable-text A4 PDF matches shared page count');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.screenshot({ path: fileURLToPath(new URL('desktop.png', output)), fullPage: true });

  const backup = await pageFor();
  await backup.addInitScript(() => {
    const files = new Map();
    window.__parityScans = 0;
    const file = (name) => ({
      kind: 'file',
      name,
      getFile: async () => new File([files.get(name)], name, { type: 'application/json' }),
      createWritable: async () => {
        let pending = '';
        return {
          write: async (value) => {
            pending = value;
          },
          close: async () => {
            files.set(name, pending);
          },
          abort: async () => {},
        };
      },
    });
    const handle = {
      name: 'Parity directory',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFileHandle: async (name, options) => {
        if (!files.has(name)) {
          if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
          files.set(name, '');
        }
        return file(name);
      },
      async *values() {
        for (const name of files.keys()) yield file(name);
        window.__parityScans++;
      },
      removeEntry: async (name) => {
        files.delete(name);
      },
    };
    window.showDirectoryPicker = async () => handle;
    window.__parityFiles = files;
  });
  const backupDoc = createDocument();
  backupDoc.title = 'Directory original';
  backupDoc.profile.name = 'DIRECTORY ORIGINAL';
  await load(backup, backupDoc);
  await backup.getByRole('button', { name: '更多导入导出', exact: true }).click();
  const panel = backup.locator('.directory-backup-panel');
  await panel.getByRole('button', { name: '选择备份目录', exact: true }).click();
  const activeId = await backup.evaluate(() => localStorage.getItem('luck-active'));
  await backup.waitForFunction(
    (id) =>
      Array.from(window.__parityFiles.entries()).some(([name, text]) => {
        try {
          return name !== 'luck-backup-manifest.json' && JSON.parse(text).resume.id === id;
        } catch {
          return false;
        }
      }),
    activeId,
  );
  const fileName = await backup.evaluate((id) => {
    for (const [name, text] of window.__parityFiles) {
      if (name === 'luck-backup-manifest.json') continue;
      const data = JSON.parse(text);
      if (data.resume.id === id) {
        data.resume.profile.name = 'DIRECTORY NEWER';
        data.resume.updatedAt = '2099-01-01T00:00:00.000Z';
        window.__parityFiles.set(name, JSON.stringify(data, null, 2));
        return name;
      }
    }
  }, activeId);
  await panel.getByRole('button', { name: '重新扫描备份', exact: true }).click();
  await panel.locator(`select:has(option[value="${fileName}"])`).selectOption(fileName);
  await panel.getByRole('button', { name: '将此版本应用到原简历', exact: true }).click();
  await backup.waitForFunction(
    () => document.querySelector('.pagination-source h1')?.textContent === 'DIRECTORY NEWER',
  );
  assert.equal(await backup.evaluate(() => localStorage.getItem('luck-active')), activeId);
  await backup.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await saved(backup);
  await backup.getByRole('button', { name: '撤销', exact: true }).click();
  await saved(backup);
  assert.equal((await current(backup)).profile.name, 'DIRECTORY ORIGINAL');
  results.push('directory reconciliation preserves document identity and undo');
  await backup.getByRole('button', { name: '更多导入导出', exact: true }).click();
  await panel.getByRole('checkbox', { name: '自动读取较新的目录版本', exact: true }).check();
  await backup.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await backup.getByRole('link', { name: '我的简历', exact: true }).click();
  await backup.getByRole('button', { name: '删除Directory original', exact: true }).click();
  await backup.getByRole('dialog').getByRole('button', { name: '删除草稿', exact: true }).click();
  await backup.getByRole('dialog').waitFor({ state: 'hidden' });
  const scans = await backup.evaluate(() => window.__parityScans);
  await backup.evaluate(() => window.dispatchEvent(new Event('focus')));
  await backup.waitForFunction((value) => window.__parityScans > value, scans);
  await backup.waitForTimeout(150);
  const restored = await backup.evaluate(
    (id) =>
      new Promise((resolve) => {
        const opening = indexedDB.open('luck-resume');
        opening.onsuccess = () => {
          const db = opening.result;
          const read = db.transaction('documents').objectStore('documents').get(id);
          read.onsuccess = () => {
            resolve(!!read.result);
            db.close();
          };
        };
      }),
    activeId,
  );
  assert.equal(restored, false, 'Retained backups must not resurrect a deliberately deleted draft');
  assert.equal(await backup.evaluate((name) => window.__parityFiles.has(name), fileName), true);
  results.push('automatic directory read-back does not resurrect retained deleted drafts');

  const touch = await pageFor({
    viewport: { width: 390, height: 2400 },
    hasTouch: true,
    isMobile: true,
  });
  const touchDoc = createDocument();
  touchDoc.profile.name = 'TOUCH TEST';
  touchDoc.sections = [createSection('experience'), createSection('education')];
  await load(touch, touchDoc);
  await touch.locator('#module-profile > summary').click();
  const handles = touch.locator('[data-luck-drag-scope="sections"]');
  const first = await handles.nth(0).boundingBox();
  const target = await handles.nth(1).boundingBox();
  assert.ok(first && target);
  const connection = await touch.context().newCDPSession(touch);
  const point = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await connection.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(first)],
  });
  await connection.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [point(target)],
  });
  await connection.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await saved(touch);
  await touch.waitForFunction(
    (id) => document.querySelector('.module-details:not(.profile-module)')?.id === `module-${id}`,
    touchDoc.sections[1].id,
  );
  results.push('actual touch pointer events reorder sections');
  await touch.screenshot({ path: fileURLToPath(new URL('touch.png', output)), fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    new URL('results.json', output),
    JSON.stringify({ results, errors, external, expectedPages }, null, 2),
  );
  console.log(JSON.stringify({ results, errors, external }, null, 2));
} finally {
  await browser.close();
}
