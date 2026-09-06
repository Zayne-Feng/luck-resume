import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5174';
const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
let server;
try {
  await fetch(baseURL);
} catch {
  if (process.env.LUCK_TEST_URL) throw new Error('The configured preview server is not reachable.');
  server = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host',
      '127.0.0.1',
      '--port',
      '5174',
      '--strictPort',
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: 'ignore' },
  );
  let available = false;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(baseURL);
      available = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!available) {
    server.kill();
    throw new Error('The preview server could not be started.');
  }
}
const browser = await chromium
  .launch({
    channel:
      process.env.LUCK_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
  })
  .catch((error) => {
    server?.kill();
    throw error;
  });
const results = [];
const pdfPageCounts = {};
const errors = [];
const externalRequests = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
context.on('page', (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== new URL(baseURL).origin)
      externalRequests.push(request.url());
  });
});
const page = await context.newPage();
const preview = page.locator('.preview-panel');
const saved = async (target = page) =>
  target.waitForFunction(() =>
    document.querySelector('.save-status')?.textContent?.includes('已保存'),
  );
const nav = async (name, target = page) => {
  await target.locator('.main-nav').getByRole('link', { name, exact: true }).click();
};
const step = async (name, run) => {
  await run();
  results.push(name);
  console.log(`PASS: ${name}`);
};
const importBackup = async (data, name = 'backup.json') => {
  const previous = await page.evaluate(() => localStorage.getItem('luck-active'));
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.waitForFunction((id) => localStorage.getItem('luck-active') !== id, previous);
  await saved();
};

try {
  await page.goto(baseURL);
  await page.getByLabel('姓名', { exact: true }).waitFor();
  await saved();

  await step('desktop editor and local persistence', async () => {
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '林知夏');
    await page.screenshot({
      path: new URL('desktop.png', output).pathname.replace(/^\/(\w:)/, '$1'),
      fullPage: true,
    });
    await page.getByLabel('姓名', { exact: true }).fill('陈小满');
    await saved();
    assert.equal(await preview.locator('.resume-header h1').textContent(), '陈小满');
    await page.reload();
    await saved();
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '陈小满');
  });

  await step('undo and redo', async () => {
    await page.getByLabel('姓名', { exact: true }).fill('新的姓名');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '陈小满');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '新的姓名');
    await saved();
  });

  let exported;
  await step('self-contained JSON export', async () => {
    await page.getByLabel('简历名称', { exact: true }).fill('我的求职简历');
    await saved();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '保存 JSON', exact: true }).click();
    const download = await downloadEvent;
    exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(exported.format, 'luck-resume');
    assert.equal(exported.resume.profile.name, '新的姓名');
    await writeFile(new URL('resume.json', output), JSON.stringify(exported, null, 2));
  });

  await step('three templates, pastel accents, and dark text', async () => {
    await page.getByRole('button', { name: '调风格', exact: true }).click();
    await page.getByRole('button', { name: '浅樱粉', exact: true }).click();
    for (const template of ['拼色', '来信', '书签']) {
      await page
        .locator('.template-options')
        .getByRole('button', { name: template, exact: true })
        .click();
      assert.equal(await preview.locator('.resume-header h1').textContent(), '新的姓名');
    }
    await saved();
    assert.equal(
      await preview.locator('.resume-document').evaluate((el) => getComputedStyle(el).color),
      'rgb(37, 43, 40)',
    );
    await page
      .locator('.template-options')
      .getByRole('button', { name: '拼色', exact: true })
      .click();
    await saved();
    await page.screenshot({
      path: new URL('appearance.png', output).pathname.replace(/^\/(\w:)/, '$1'),
      fullPage: true,
    });
    await nav('模板中心');
    assert.equal(await page.locator('.template-card').count(), 9);
    await page.screenshot({
      path: new URL('templates.png', output).pathname.replace(/^\/(\w:)/, '$1'),
      fullPage: true,
    });
    await nav('简历编辑');
  });

  await step('rich text editing, visibility, and section order', async () => {
    await page.getByRole('button', { name: '写内容', exact: true }).click();
    await page
      .locator('.section-quicknav')
      .getByRole('button', { name: '工作经历', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: '工作经历描述 1', exact: true })
      .fill('负责产品设计与跨团队协作。');
    await saved();
    assert.match(await preview.textContent(), /负责产品设计与跨团队协作/);
    await page.getByRole('button', { name: '隐藏工作经历', exact: true }).click();
    assert.equal(await preview.locator('.resume-section-experience').count(), 0);
    await page.getByRole('button', { name: '显示工作经历', exact: true }).click();
    await page.getByRole('button', { name: '上移工作经历', exact: true }).click();
    assert.match(
      await page.locator('.module-details:not(.profile-module) > summary').first().textContent(),
      /工作经历/,
    );
    await saved();
  });

  await step(
    'DIY layout, density, heading style, and entry duplication survive export',
    async () => {
      const experience = page
        .locator('.module-details')
        .filter({ has: page.locator('summary > span', { hasText: '工作经历' }) });
      await experience.getByRole('button', { name: '双列', exact: true }).click();
      await experience.getByRole('button', { name: '复制条目', exact: true }).first().click();
      assert.equal(await experience.locator('.entry-editor').count(), 3);
      await page.getByRole('button', { name: '调风格', exact: true }).click();
      await page.getByRole('button', { name: '紧凑', exact: true }).click();
      await page.getByRole('button', { name: '居中，正式一点', exact: true }).click();
      await page.getByRole('button', { name: '色块', exact: true }).click();
      await saved();
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: '保存 JSON', exact: true }).click();
      const doc = JSON.parse(await readFile(await (await downloadEvent).path(), 'utf8')).resume;
      assert.equal(doc.appearance.headerAlign, 'center');
      assert.equal(doc.appearance.headingStyle, 'highlight');
      assert.equal(doc.appearance.fontSize, 12);
      assert.equal(doc.sections.find((s) => s.type === 'experience').columns, 2);
      assert.equal(doc.sections.find((s) => s.type === 'experience').items.length, 3);
      await page.getByRole('button', { name: '检查一下', exact: true }).click();
      assert.equal(await page.locator('[data-check-id="dates"]').count(), 1);
      assert.equal(await page.locator('[data-check-id="links"]').count(), 1);
      assert.equal(await page.locator('[data-check-id="contact"]').count(), 1);
      await page.getByRole('button', { name: '写内容', exact: true }).click();
    },
  );

  await step('import creates an independent document and rejects unrelated JSON', async () => {
    await importBackup(exported);
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '新的姓名');
    await nav('我的简历');
    assert.equal(await page.locator('.library-item').count(), 2);
    await nav('简历编辑');
    await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"other":true}'),
    });
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /幸运简历/);
    await page.getByRole('button', { name: '知道了', exact: true }).click();
  });

  await step('document creation, duplication, deletion, and empty search', async () => {
    await page.getByRole('button', { name: '新建简历', exact: true }).click();
    await page.getByRole('dialog').getByLabel('简历名称', { exact: true }).fill('空白版本');
    await page.getByRole('button', { name: '创建简历', exact: true }).click();
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '');
    await saved();
    await nav('我的简历');
    await page.getByRole('button', { name: '复制空白版本', exact: true }).click();
    assert.equal(
      await page.getByLabel('简历名称', { exact: true }).inputValue(),
      '空白版本（副本）',
    );
    await saved();
    await nav('我的简历');
    await page.getByRole('button', { name: '删除空白版本（副本）', exact: true }).click();
    await page.getByRole('button', { name: '删除草稿', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.library-item').count(), 3);
    await page.getByLabel('搜索简历').fill('not-found');
    assert.match(await page.locator('.empty-state').textContent(), /没有找到/);
    await page.getByRole('button', { name: '清空搜索', exact: true }).click();
    await page.locator('.library-preview').first().click();
  });

  await step('photo stays embedded in JSON', async () => {
    await page
      .locator('.section-quicknav')
      .getByRole('button', { name: '基本信息', exact: true })
      .click();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
      'base64',
    );
    await page
      .locator('#module-profile input[type=file][accept="image/jpeg,image/png,image/webp"]')
      .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
    await page.locator('.photo-field img').waitFor();
    await saved();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '保存 JSON', exact: true }).click();
    const doc = JSON.parse(await readFile(await (await downloadEvent).path(), 'utf8'));
    assert.match(doc.resume.profile.photo, /^data:image\/png;base64,/);
  });

  await step('an asynchronous photo upload updates its original document', async () => {
    await page.getByLabel('简历名称', { exact: true }).fill('照片归属原稿');
    await page.getByRole('button', { name: '移除', exact: true }).click();
    await saved();
    await page.evaluate(() => {
      window.__originalDecode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function () {
        const image = this;
        return new Promise((resolve, reject) => {
          window.__releasePhoto = () => window.__originalDecode.call(image).then(resolve, reject);
        });
      };
    });
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
      'base64',
    );
    await page
      .locator('#module-profile input[type=file][accept="image/jpeg,image/png,image/webp"]')
      .setInputFiles({ name: 'delayed.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => typeof window.__releasePhoto === 'function');
    await page.getByRole('button', { name: '新建简历', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByLabel('简历名称', { exact: true })
      .fill('照片处理中的另一份简历');
    await page.getByRole('button', { name: '创建简历', exact: true }).click();
    await page.evaluate(async () => {
      await window.__releasePhoto();
      HTMLImageElement.prototype.decode = window.__originalDecode;
    });
    assert.equal(await page.locator('.photo-field img').count(), 0);
    await nav('我的简历');
    await page.getByRole('button', { name: '照片归属原稿', exact: true }).click();
    await page.locator('.photo-field img').waitFor();
    await saved();
  });

  await step('concurrent edits preserve content as an independent copy', async () => {
    await saved();
    const other = await context.newPage();
    await other.goto(baseURL);
    await saved(other);
    await page.getByLabel('姓名', { exact: true }).fill('标签页一');
    await saved();
    await other.getByLabel('姓名', { exact: true }).fill('标签页二');
    await other.waitForFunction(() =>
      document.querySelector('.save-status')?.textContent?.includes('冲突'),
    );
    await other.getByRole('button', { name: '另存为副本', exact: true }).click();
    await saved(other);
    assert.equal(await other.getByLabel('姓名', { exact: true }).inputValue(), '标签页二');
    await page.reload();
    await saved();
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '标签页二');
    await other.close();
  });

  await step('storage failure is visible and JSON export remains available', async () => {
    await page.evaluate(() => {
      window.__originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('Storage full', 'QuotaExceededError');
      };
    });
    await page.getByLabel('姓名', { exact: true }).fill('保留未保存内容');
    await page.waitForFunction(() =>
      document.querySelector('.save-status')?.textContent?.includes('失败'),
    );
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '保留未保存内容');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '保存 JSON', exact: true }).click();
    const doc = JSON.parse(await readFile(await (await downloadEvent).path(), 'utf8'));
    assert.equal(doc.resume.profile.name, '保留未保存内容');
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = window.__originalPut;
    });
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    await saved();
  });

  await step('retrying an unavailable database retains edits made during the failure', async () => {
    const blocked = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await blocked.addInitScript(() => {
      window.__originalOpen = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function () {
        throw new DOMException('Database unavailable', 'SecurityError');
      };
    });
    const retryPage = await blocked.newPage();
    retryPage.on('pageerror', (error) => errors.push(error.message));
    await retryPage.goto(baseURL);
    await retryPage.getByLabel('姓名', { exact: true }).fill('恢复时保留的草稿');
    await retryPage.waitForFunction(() =>
      document.querySelector('.save-status')?.textContent?.includes('失败'),
    );
    await retryPage.evaluate(() => {
      IDBFactory.prototype.open = window.__originalOpen;
    });
    await retryPage.getByRole('button', { name: '重新读取', exact: true }).click();
    await saved(retryPage);
    assert.equal(
      await retryPage.getByLabel('姓名', { exact: true }).inputValue(),
      '恢复时保留的草稿',
    );
    await blocked.close();
  });

  await step('mobile editor, navigation, and preview fit the viewport', async () => {
    await importBackup(exported, 'mobile.json');
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.locator('.edit-panel').isVisible(), true);
    await page.screenshot({
      path: new URL('mobile-editor.png', output).pathname.replace(/^\/(\w:)/, '$1'),
      fullPage: true,
    });
    await page.getByRole('button', { name: '预览简历', exact: true }).click();
    assert.equal(await preview.isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({
      path: new URL('mobile-preview.png', output).pathname.replace(/^\/(\w:)/, '$1'),
      fullPage: true,
    });
    await page.getByRole('button', { name: '打开导航', exact: true }).click();
    await nav('模板中心');
    assert.equal(await page.locator('.template-card').count(), 9);
    await page.getByRole('button', { name: '打开导航', exact: true }).click();
    await nav('简历编辑');
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await step('print action and A4 PDF output', async () => {
    await page.evaluate(() => {
      window.print = () => {
        window.__printCalled = true;
      };
    });
    await page.getByRole('button', { name: '导出 PDF', exact: true }).click();
    await page.waitForFunction(() => window.__printCalled === true);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.app-shell').isVisible(), false);
    assert.equal(await page.locator('.print-root').isVisible(), true);
    await page.pdf({
      path: new URL('resume.pdf', output).pathname.replace(/^\/(\w:)/, '$1'),
      printBackground: true,
      preferCSSPageSize: true,
    });
    pdfPageCounts['resume.pdf'] = await page.locator('.print-root .resume-page').count();
    await page.emulateMedia({ media: 'screen' });
  });

  await step('printing refreshes pagination after fonts finish loading', async () => {
    const before = await page.locator('.print-root .resume-page').count();
    await page.evaluate(() => {
      Object.defineProperty(document.fonts, 'ready', {
        configurable: true,
        value: new Promise((resolve) => {
          window.__finishFonts = resolve;
        }),
      });
      window.requestAnimationFrame = () => 0;
      window.print = () => {
        window.__printedPageCount = document.querySelectorAll('.print-root .resume-page').length;
      };
    });
    await page.getByRole('button', { name: '导出 PDF', exact: true }).click();
    await page.evaluate(() => {
      const paper = document.querySelector('.pagination-source .resume-document');
      paper.style.setProperty('--resume-font-size', '17px');
      paper.style.setProperty('--resume-line-height', '2');
      window.__finishFonts();
    });
    await page.waitForFunction(() => window.__printedPageCount > 0);
    assert.ok(
      (await page.evaluate(() => window.__printedPageCount)) > before,
      'Printing must measure the final font layout.',
    );
    await page.reload();
    await page.getByLabel('姓名', { exact: true }).waitFor();
    await saved();
  });

  await step('all templates print and long content preserves the last entry', async () => {
    await page.getByRole('button', { name: '调风格', exact: true }).click();
    for (const [id, name] of [
      ['linen', '书签'],
      ['column', '拼色'],
      ['graduate', '来信'],
    ]) {
      await page.locator('.template-options').getByRole('button', { name, exact: true }).click();
      await saved();
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('.app-shell').isVisible(), false);
      await page.pdf({
        path: new URL(`template-${id}.pdf`, output).pathname.replace(/^\/(\w:)/, '$1'),
        printBackground: true,
        preferCSSPageSize: true,
      });
      pdfPageCounts[`template-${id}.pdf`] = await page.locator('.print-root .resume-page').count();
      await page.emulateMedia({ media: 'screen' });
    }
    const long = structuredClone(exported);
    const section = long.resume.sections.find((s) => s.type === 'experience');
    section.items = Array.from({ length: 14 }, (_, i) => ({
      ...structuredClone(section.items[0]),
      id: crypto.randomUUID(),
      title: i === 13 ? 'PRINT_END_MARKER' : `Experience ${i + 1}`,
    }));
    long.resume.appearance.template = 'linen';
    await importBackup(long, 'long.json');
    await page.waitForFunction(() =>
      document.querySelector('.print-root')?.textContent?.includes('PRINT_END_MARKER'),
    );
    const previewPages = await preview.locator('.resume-page').count();
    assert.ok(previewPages > 1, 'Long resumes must have explicit preview pages.');
    assert.match(
      await preview.locator('.paper-label').innerText(),
      new RegExp(`${previewPages} 页`),
    );
    assert.equal(await page.locator('.print-root .resume-page').count(), previewPages);
    const bounds = await preview.locator('.resume-page').evaluateAll((pages) =>
      pages.map((paper) => {
        const rect = paper.getBoundingClientRect();
        const scale = rect.width / paper.offsetWidth;
        const limit = rect.bottom - parseFloat(getComputedStyle(paper).paddingBottom) * scale;
        return Array.from(paper.querySelectorAll('.resume-entry, .resume-section h2')).every(
          (el) => el.getBoundingClientRect().bottom <= limit + 1,
        );
      }),
    );
    assert.ok(bounds.every(Boolean), 'Preview content must stay inside page margins.');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.app-shell').isVisible(), false);
    await page.pdf({
      path: new URL('long-resume.pdf', output).pathname.replace(/^\/(\w:)/, '$1'),
      printBackground: true,
      preferCSSPageSize: true,
    });
    pdfPageCounts['long-resume.pdf'] = previewPages;
    await page.emulateMedia({ media: 'screen' });
  });

  await step(
    'oversized paragraphs and numbered lists retain text across preview and print pages',
    async () => {
      const large = structuredClone(exported);
      large.resume.appearance.template = 'column';
      const section = large.resume.sections.find((s) => s.type === 'experience');
      large.resume.sections = [section];
      section.columns = 2;
      section.items = [structuredClone(section.items[0])];
      section.items[0].description = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'A long paragraph 中文排版 '.repeat(400) + 'PARAGRAPH_END' },
            ],
          },
          {
            type: 'orderedList',
            attrs: { start: 5 },
            content: Array.from({ length: 35 }, (_, i) => ({
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text:
                        `Numbered item ${i + 5} ` +
                        'List content '.repeat(8) +
                        (i === 34 ? 'LIST_END' : ''),
                    },
                  ],
                },
              ],
            })),
          },
        ],
      };
      await importBackup(large, 'large-entry.json');
      await page.waitForFunction(() =>
        document.querySelector('.preview-panel .resume-pages')?.textContent.includes('LIST_END'),
      );
      const count = await preview.locator('.resume-page').count();
      assert.ok(count > 2);
      assert.equal(await page.locator('.print-root .resume-page').count(), count);
      const overflowing = await preview.locator('.resume-page').evaluateAll(
        (papers) =>
          papers.filter((paper) => {
            const rect = paper.getBoundingClientRect();
            const scale = rect.width / paper.offsetWidth;
            const limit = rect.bottom - parseFloat(getComputedStyle(paper).paddingBottom) * scale;
            return Array.from(
              paper.querySelectorAll('.resume-entry,.resume-rich p,.resume-rich li'),
            ).some((el) => el.getBoundingClientRect().bottom > limit + 1);
          }).length,
      );
      assert.equal(overflowing, 0, 'Oversized entries must not cross page margins.');
      assert.match(await preview.innerText(), /PARAGRAPH_END/);
      assert.match(await preview.innerText(), /LIST_END/);
      assert.equal(await preview.locator('ol').first().getAttribute('start'), '5');
      assert.equal(
        await preview
          .locator('.resume-rich')
          .evaluateAll((blocks) => blocks.map((el) => el.textContent).join('')),
        section.items[0].description.content
          .map((n) =>
            n.type === 'paragraph'
              ? n.content[0].text
              : n.content.map((li) => li.content[0].content[0].text).join(''),
          )
          .join(''),
      );
      await page.screenshot({ path: fileURLToPath(new URL('paginated-preview.png', output)) });
      await page.emulateMedia({ media: 'print' });
      await page.pdf({
        path: fileURLToPath(new URL('large-entry.pdf', output)),
        printBackground: true,
        preferCSSPageSize: true,
      });
      pdfPageCounts['large-entry.pdf'] = count;
      await page.emulateMedia({ media: 'screen' });
    },
  );

  await step('mixed recovery files restore valid drafts and preserve invalid records', async () => {
    const source = structuredClone(exported.resume);
    source.title = 'Recovered draft';
    const broken = {
      id: 'broken-import',
      data: { document: { title: 'Incomplete' } },
      reason: 'Incomplete row',
    };
    await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({
      name: 'recovery.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'luck-resume-recovery',
          version: 1,
          drafts: [
            { id: source.id, data: { document: source, revision: -1 }, reason: 'Index damaged' },
            broken,
          ],
        }),
      ),
    });
    const dialog = page.getByRole('dialog', { name: '恢复本地草稿' });
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /1 份可恢复简历/);
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '下载未恢复记录' }).click();
    const file = await downloadPromise;
    const remaining = JSON.parse(await readFile(await file.path(), 'utf8'));
    assert.deepEqual(remaining.drafts, [broken]);
    await dialog.getByRole('button', { name: '导入可恢复简历' }).click();
    await saved();
    assert.equal(
      await page.getByLabel('简历名称', { exact: true }).inputValue(),
      'Recovered draft',
    );
    const restored = await page.evaluate(() => localStorage.getItem('luck-active'));
    assert.notEqual(restored, source.id);
  });

  await step(
    'long metadata and split entry containers stay within all template page bounds',
    async () => {
      for (const template of [
        'linen',
        'column',
        'graduate',
        'ledger',
        'campus',
        'folio',
        'research',
        'executive',
        'mono',
      ]) {
        for (const columns of [1, 2]) {
          const data = structuredClone(exported);
          const section = data.resume.sections.find((s) => s.type === 'experience');
          data.resume.sections = [section];
          Object.assign(data.resume.appearance, {
            template,
            fontSize: 17,
            lineHeight: 2,
            pageMargin: 18,
            sectionGap: 20,
          });
          section.columns = columns;
          const base = section.items[0];
          section.items = [
            {
              ...structuredClone(base),
              id: crypto.randomUUID(),
              title: 'Leading entry',
              description: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: Array.from({ length: 28 }, (_, i) => [
                      { type: 'text', text: 'FILL' },
                      ...(i < 27 ? [{ type: 'hardBreak' }] : []),
                    ]).flat(),
                  },
                ],
              },
            },
            {
              ...structuredClone(base),
              id: crypto.randomUUID(),
              title: 'TitleWord '.repeat(30),
              location: 'LOCATION'.repeat(24),
              description: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Long body content '.repeat(600) }],
                  },
                ],
              },
            },
            { ...structuredClone(base), id: crypto.randomUUID(), title: 'END_ENTRY' },
          ];
          await importBackup(data, `bounds-${template}-${columns}.json`);
          await page.waitForFunction(() =>
            document
              .querySelector('.preview-panel .resume-pages')
              ?.textContent.includes('END_ENTRY'),
          );
          const violations = await preview.locator('.resume-page').evaluateAll((papers) =>
            papers.flatMap((paper, index) => {
              const rect = paper.getBoundingClientRect();
              const scale = rect.width / parseFloat(getComputedStyle(paper).width);
              const style = getComputedStyle(paper);
              const bottom = rect.bottom - parseFloat(style.paddingBottom) * scale;
              const right = rect.right - parseFloat(style.paddingRight) * scale;
              return Array.from(
                paper.querySelectorAll('.resume-entry,.resume-rich p,.resume-entry-meta'),
              )
                .filter((el) => {
                  const bounds = el.getBoundingClientRect();
                  return bounds.bottom > bottom + 1 || bounds.right > right + 1;
                })
                .map((el) => ({ page: index + 1, element: el.className }));
            }),
          );
          assert.deepEqual(violations, [], `${template}/${columns} must retain page bounds`);
        }
      }
    },
  );

  await step('imported rich-text links and location-only entries survive editing', async () => {
    const linked = structuredClone(exported);
    linked.resume.appearance.template = 'graduate';
    linked.resume.sections.find((s) => s.type === 'summary').items[0].description = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'kept link',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
      ],
    };
    const entry = linked.resume.sections.find((s) => s.type === 'experience').items[0];
    entry.startDate = '';
    entry.endDate = '';
    entry.current = false;
    entry.location = 'LOCATION_ONLY';
    await importBackup(linked, 'linked.json');
    await page.getByRole('button', { name: '写内容', exact: true }).click();
    const input = page.getByRole('textbox', { name: '个人简介描述 1', exact: true });
    assert.match(await input.textContent(), /kept link/);
    await input.click();
    await input.press('Control+End');
    await input.press('x');
    await saved();
    assert.match(await input.textContent(), /kept link/);
    assert.equal(await input.locator('a[href="https://example.com"]').count(), 1);
    assert.match(await preview.locator('.resume-entry-meta').first().innerText(), /LOCATION_ONLY/);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '保存 JSON', exact: true }).click();
    const file = JSON.parse(await readFile(await (await downloadEvent).path(), 'utf8'));
    assert.match(
      JSON.stringify(file.resume.sections.find((s) => s.type === 'summary').items[0].description),
      /kept link/,
    );
    assert.match(
      JSON.stringify(file.resume.sections.find((s) => s.type === 'summary').items[0].description),
      /"type":"link"/,
    );
  });

  await step(
    'an invalid stored row does not hide healthy drafts and can be downloaded',
    async () => {
      await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open('luck-resume');
            request.onsuccess = () => {
              const db = request.result;
              const transaction = db.transaction('documents', 'readwrite');
              transaction.objectStore('documents').put({
                id: 'invalid-draft',
                revision: 1,
                document: { id: 'invalid-draft', originalText: 'RECOVERY_MARKER' },
              });
              transaction.oncomplete = () => {
                db.close();
                resolve(true);
              };
              transaction.onerror = () => reject(transaction.error);
            };
          }),
      );
      await page.reload();
      await saved();
      assert.equal(await page.locator('.recovery-banner').isVisible(), true);
      assert.equal(
        await page.getByLabel('姓名', { exact: true }).inputValue(),
        exported.resume.profile.name,
      );
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: '下载恢复文件', exact: true }).click();
      const data = JSON.parse(await readFile(await (await downloadEvent).path(), 'utf8'));
      assert.equal(data.drafts[0].data.document.originalText, 'RECOVERY_MARKER');
    },
  );

  assert.deepEqual(errors, []);
  await step('large recovery sets expose separate downloadable parts', async () => {
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('luck-resume');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction('documents', 'readwrite');
            const store = transaction.objectStore('documents');
            for (let i = 0; i < 1000; i++)
              store.put({
                id: `invalid-part-${i}`,
                revision: 1,
                document: { originalText: `PART_RECORD_${i}` },
              });
            transaction.oncomplete = () => {
              db.close();
              resolve(true);
            };
            transaction.onabort = () => {
              db.close();
              reject(transaction.error);
            };
          };
        }),
    );
    await page.reload();
    await saved();
    await page.getByRole('button', { name: '下载恢复文件', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '下载分卷恢复文件' });
    await dialog.waitFor();
    assert.equal(await dialog.locator('.recovery-parts li').count(), 2);
    const records = [];
    for (let i = 0; i < 2; i++) {
      const event = page.waitForEvent('download');
      await dialog
        .locator('.recovery-parts li')
        .nth(i)
        .getByRole('button', { name: '下载', exact: true })
        .click();
      const file = await event;
      const data = JSON.parse(await readFile(await file.path(), 'utf8'));
      assert.ok(data.drafts.length <= 1000);
      records.push(...data.drafts);
    }
    assert.equal(records.length, 1001);
    assert.equal(new Set(records.map((row) => row.id)).size, 1001);
    await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  });

  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  results.push('no page errors or external content requests');
  await writeFile(
    new URL('browser-results.json', output),
    JSON.stringify({ passed: results, errors, externalRequests }, null, 2),
  );
  await writeFile(new URL('pdf-page-counts.json', output), JSON.stringify(pdfPageCounts, null, 2));
  console.log(`Browser verification complete: ${results.length} checks passed.`);
} finally {
  await browser.close();
  server?.kill();
}
