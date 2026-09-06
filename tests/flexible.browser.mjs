import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  createDocument,
  createEntry,
  createField,
  createSection,
  richText,
  templates,
} from '../src/resume/model.ts';
import { serializeResume } from '../src/resume/files.ts';

const root = new URL('../', import.meta.url);
const output = new URL('../test-results/flexible/', import.meta.url);
const baseURL = process.env.LUCK_FLEXIBLE_URL || 'http://127.0.0.1:5175';
await mkdir(output, { recursive: true });
let server;
try {
  await fetch(baseURL);
} catch {
  if (process.env.LUCK_FLEXIBLE_URL)
    throw new Error('The configured test server is not reachable.');
  server = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('node_modules/vite/bin/vite.js', root)),
      '--host',
      '127.0.0.1',
      '--port',
      '5175',
      '--strictPort',
    ],
    { cwd: fileURLToPath(root), windowsHide: true, stdio: 'ignore' },
  );
  let reachable = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(baseURL);
      reachable = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!reachable) {
    server.kill();
    throw new Error('The test server could not be started.');
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
const pageErrors = [];
const externalRequests = [];
const pdfPageCounts = {};

function fixture() {
  const doc = createDocument();
  doc.title = 'Flexible verification';
  Object.assign(doc.profile, {
    name: '林知夏',
    headline: 'Product engineer',
    phone: '13800000000',
    email: 'resume@example.com',
    location: '杭州',
  });
  const summary = createSection('summary');
  summary.items[0].description = richText(
    'Build thoughtful software with clear evidence and reliable delivery.',
  );
  const experience = createSection('experience');
  const entry = createEntry();
  Object.assign(entry, {
    title: 'Flexible Company',
    subtitle: 'Product engineer',
    startDate: '2023-03',
    endDate: '2025-08',
    description: richText('Delivered accessible tools for a growing team.'),
  });
  const field = createField('Team');
  field.value = 'Platform';
  entry.customFields = [field];
  experience.items = [entry];
  const projects = createSection('projects');
  const project = createEntry();
  Object.assign(project, {
    title: 'Offline portfolio',
    description: richText('Designed an offline portfolio and improved editing reliability.'),
  });
  projects.items = [project];
  doc.sections = [summary, experience, projects];
  return doc;
}

async function settle(page) {
  await page.waitForFunction(() =>
    document.querySelector('.save-status')?.textContent?.includes('已保存'),
  );
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="导出 PDF"]');
    return (
      button &&
      !button.disabled &&
      document.querySelectorAll('.preview-panel .resume-document').length > 0
    );
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function importJson(page, doc) {
  const previous = await page.evaluate(() => localStorage.getItem('luck-active'));
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeResume(doc)),
  });
  await page.waitForFunction((id) => localStorage.getItem('luck-active') !== id, previous);
  await settle(page);
}
async function downloaded(page, action, name) {
  const pending = page.waitForEvent('download');
  await action();
  const download = await pending;
  const bytes = await readFile(await download.path());
  if (name) await writeFile(new URL(name, output), bytes);
  return bytes;
}
async function snapshot(page, name) {
  return JSON.parse(
    (
      await downloaded(
        page,
        () => page.getByRole('button', { name: '保存 JSON', exact: true }).click(),
        name,
      )
    ).toString('utf8'),
  ).resume;
}
async function tab(page, name) {
  await page.locator('.edit-tabs').getByRole('button', { name, exact: true }).click();
}
async function openDetails(locator) {
  if ((await locator.getAttribute('open')) === null)
    await locator.locator(':scope > summary').click();
}
async function scenario(name, run) {
  if (
    process.env.LUCK_FLEXIBLE_SCENARIO &&
    !process.env.LUCK_FLEXIBLE_SCENARIO.split(',').includes(name)
  )
    return;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  context.on('page', (page) => {
    page.on('pageerror', (error) => pageErrors.push({ scenario: name, message: error.message }));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith('http') && url.origin !== new URL(baseURL).origin)
        externalRequests.push({ scenario: name, url: request.url() });
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  try {
    await page.goto(baseURL);
    await settle(page);
    await run(page, context);
    results.push({ name, status: 'passed' });
    console.log(`PASS: ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', error: error.stack || String(error) });
    await page
      .screenshot({ path: fileURLToPath(new URL(`${name}-failed.png`, output)), fullPage: true })
      .catch(() => {});
    console.error(`FAIL: ${name}: ${error.message}`);
  } finally {
    await context.close();
  }
}

try {
  await scenario('paginated-numbering-and-hidden-media', async (page) => {
    const doc = createDocument('research');
    doc.profile.name = 'PRIVATE_NAME';
    doc.profile.headline = 'Research profile';
    doc.profile.hiddenFields = ['name'];
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
    doc.profile.photo = image;
    const section = createSection('publications');
    section.items = [0, 1].map((index) => {
      const entry = createEntry('publications');
      entry.title = index === 0 ? 'PRIVATE_TITLE' : 'Publication Two';
      entry.description = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: Array.from({ length: 24 }, (_, i) => [
              { type: 'text', text: `Paper ${index + 1} line ${i + 1}` },
              ...(i < 23 ? [{ type: 'hardBreak' }] : []),
            ]).flat(),
          },
        ],
      };
      if (index === 0) {
        entry.hiddenFields = ['title'];
        entry.image = image;
        entry.imageWidth = 20;
      }
      return entry;
    });
    doc.sections = [section];
    await importJson(page, doc);
    const html = await page.locator('.preview-panel .resume-pages').innerHTML();
    assert.ok(!html.includes('PRIVATE_NAME') && !html.includes('PRIVATE_TITLE'));
    assert.ok((await page.locator('.preview-panel .resume-page').count()) >= 2);
    for (const [index, entry] of section.items.entries()) {
      const numbers = await page
        .locator(`.preview-panel [data-entry-id="${entry.id}"]`)
        .evaluateAll((elements) => elements.map((el) => el.dataset.entryNumber));
      assert.ok(numbers.length > 0);
      assert.ok(numbers.every((value) => value === String(index + 1)));
    }
    pdfPageCounts['research-numbered'] = {
      expectedPages: await page.locator('.print-root .resume-page').count(),
      pdf: 'research-numbered.pdf',
    };
    await page.pdf({
      path: fileURLToPath(new URL('research-numbered.pdf', output)),
      printBackground: true,
      preferCSSPageSize: true,
    });
    const ledger = createDocument('ledger');
    ledger.profile.name = 'Module numbering';
    ledger.sections = [0, 1].map((index) => {
      const block = createSection('custom');
      block.title = `Module ${index + 1}`;
      block.items[0].description = richText(
        ...Array.from({ length: 24 }, (_, line) => `Module ${index + 1} line ${line + 1}`),
      );
      return block;
    });
    await importJson(page, ledger);
    assert.ok((await page.locator('.preview-panel .resume-page').count()) >= 2);
    const numbers = await page
      .locator(`.preview-panel [data-section-id="${ledger.sections[1].id}"]`)
      .evaluateAll((elements) => elements.map((el) => el.dataset.sectionNumber));
    assert.ok(numbers.length > 0 && numbers.every((value) => value === '02'));
    pdfPageCounts['ledger-numbered'] = {
      expectedPages: await page.locator('.print-root .resume-page').count(),
      pdf: 'ledger-numbered.pdf',
    };
    await page.pdf({
      path: fileURLToPath(new URL('ledger-numbered.pdf', output)),
      printBackground: true,
      preferCSSPageSize: true,
    });
  });
  await scenario('fonts', async (page) => {
    await importJson(page, fixture());
    await tab(page, '调风格');
    for (const [button, family] of [
      ['简洁黑体', 'Luck Sans'],
      ['雅致宋体', 'Luck Serif'],
    ]) {
      await page.getByRole('button', { name: button, exact: true }).click();
      await settle(page);
      const result = await page.evaluate(async (family) => {
        const loaded = await document.fonts.load(`600 16px "${family}"`, '中文Résumé');
        return {
          registered: loaded.length,
          statuses: loaded.map((font) => font.status),
          computed: getComputedStyle(document.querySelector('.preview-panel .resume-document'))
            .fontFamily,
        };
      }, family);
      assert.ok(result.registered > 0);
      assert.ok(result.statuses.every((status) => status === 'loaded'));
      assert.ok(result.computed.includes(family));
    }
    await page.screenshot({
      path: fileURLToPath(new URL('serif-preview.png', output)),
      fullPage: true,
    });
  });

  await scenario('profile-fields-roundtrip', async (page) => {
    await importJson(page, fixture());
    const profile = page.locator('#module-profile');
    await openDetails(profile.locator('.custom-fields-editor'));
    await profile.getByRole('button', { name: '添加自定义字段', exact: true }).click();
    await profile.getByLabel('字段名称 1', { exact: true }).fill('GitHub');
    await profile.getByLabel('字段内容 1', { exact: true }).fill('https://github.com/example');
    await profile.getByLabel('字段类型 1', { exact: true }).selectOption('link');
    await profile.getByLabel('字段名称 1', { exact: true }).fill('Source profile');
    await profile.getByRole('button', { name: '添加自定义字段', exact: true }).click();
    await profile.getByLabel('字段名称 2', { exact: true }).fill('Private note');
    await profile.getByLabel('字段内容 2', { exact: true }).fill('PRESERVED_HIDDEN_PROFILE');
    await profile
      .locator('.custom-field-card')
      .nth(1)
      .getByLabel('显示此字段', { exact: true })
      .uncheck();
    await openDetails(profile.locator('.profile-options:not(.contributions-editor)'));
    await profile.getByLabel('电子邮箱显示名称', { exact: true }).fill('Contact');
    const moveContact = profile
      .locator('.contact-order li')
      .filter({ hasText: 'Source profile' })
      .getByRole('button', { name: /^上移联系信息 / });
    while (await moveContact.isEnabled()) await moveContact.click();
    await settle(page);
    const original = await snapshot(page, 'profile-before.json');
    assert.equal(original.profile.customFields[0].label, 'Source profile');
    assert.equal(original.profile.customFields[1].visible, false);
    assert.equal(original.profile.contactOrder[0], original.profile.customFields[0].id);
    assert.ok(
      !(await page.locator('.preview-panel').innerText()).includes('PRESERVED_HIDDEN_PROFILE'),
    );
    await importJson(page, original);
    const restored = await snapshot(page, 'profile-restored.json');
    assert.deepEqual(restored.profile, original.profile);
  });

  await scenario('entry-visibility-clone-dates', async (page) => {
    const doc = fixture();
    await importJson(page, doc);
    const section = page.locator('.module-details').filter({
      has: page.getByRole('heading', { name: '工作经历', exact: true, includeHidden: true }),
    });
    const entry = section.locator('.entry-editor').first();
    await entry.getByRole('button', { name: '隐藏条目', exact: true }).click();
    await settle(page);
    assert.ok(!(await page.locator('.preview-panel').innerText()).includes('Flexible Company'));
    const hidden = await snapshot(page);
    assert.equal(hidden.sections[1].items[0].visible, false);
    assert.equal(hidden.sections[1].items[0].title, 'Flexible Company');
    await entry.getByRole('button', { name: '复制条目', exact: true }).click();
    const cloned = await snapshot(page);
    assert.notEqual(cloned.sections[1].items[0].id, cloned.sections[1].items[1].id);
    assert.notEqual(
      cloned.sections[1].items[0].customFields[0].id,
      cloned.sections[1].items[1].customFields[0].id,
    );
    await entry.getByRole('button', { name: '显示条目', exact: true }).click();
    await entry.getByLabel('日期输入方式', { exact: true }).selectOption('month');
    assert.equal(await entry.getByLabel('开始时间', { exact: true }).getAttribute('type'), 'month');
    await entry.getByLabel('开始时间', { exact: true }).fill('2024-02');
    await entry.getByLabel('结束时间', { exact: true }).fill('2025-09');
    await entry.getByLabel('日期输入方式', { exact: true }).selectOption('text');
    await entry.getByLabel('结束时间', { exact: true }).fill('Graduation expected');
    await openDetails(entry.locator('.entry-options:not(.logo-editor):not(.publication-editor)'));
    await entry.getByLabel('标题字段名称', { exact: true }).fill('Employer');
    await entry.getByLabel('Employer', { exact: true }).fill('Flexible Company updated');
    await tab(page, '调风格');
    await openDetails(page.locator('.advanced-settings'));
    await page.getByLabel('日期显示格式', { exact: true }).selectOption('YYYY/MM');
    await settle(page);
    const state = await snapshot(page, 'entry-dates.json');
    assert.equal(state.sections[1].items[0].startDate, '2024-02');
    assert.equal(state.sections[1].items[0].endDate, 'Graduation expected');
    assert.ok((await page.locator('.preview-panel').innerText()).includes('2024/02'));
    assert.ok((await page.locator('.preview-panel').innerText()).includes('Graduation expected'));
  });

  await scenario('rich-formatting', async (page) => {
    await importJson(page, fixture());
    const editor = page.locator('.entry-editor').first();
    const content = editor.locator('[contenteditable=true]');
    for (let repetition = 0; repetition < 3; repetition++) {
      await content.fill('Formatted paragraph survives round trip.');
      await content.press('Control+A');
      await editor.getByLabel('段落对齐', { exact: true }).selectOption('center');
      await editor.getByLabel('选区字号', { exact: true }).selectOption('18px');
      await settle(page);
      const formatted = await snapshot(page, 'rich-formatted.json');
      const paragraph = formatted.sections[0].items[0].description.content[0];
      assert.equal(paragraph.attrs.textAlign, 'center');
      assert.ok(
        paragraph.content.some((node) =>
          node.marks?.some((mark) => mark.type === 'textStyle' && mark.attrs.fontSize === '18px'),
        ),
      );
      await content.click();
      await content.press('Control+A');
      await editor.getByRole('button', { name: '清除格式', exact: true }).click();
      const cleared = await snapshot(page, 'rich-cleared.json');
      const cleanParagraph = cleared.sections[0].items[0].description.content[0];
      assert.ok(!cleanParagraph.attrs?.textAlign || cleanParagraph.attrs.textAlign === 'left');
      assert.ok(
        cleanParagraph.content.every(
          (node) => !node.marks?.some((mark) => mark.type === 'textStyle'),
        ),
      );
    }
  });

  await scenario('modules-images-placement-drag', async (page) => {
    await importJson(page, fixture());
    for (const name of ['论文发表', '证书资质', '荣誉奖项', '语言能力', '志愿活动', '自由文本']) {
      await page.getByRole('button', { name: '添加你需要的模块', exact: true }).click();
      await page.locator('.module-add-options').getByRole('button', { name, exact: true }).click();
      const section = page
        .locator('.module-details')
        .filter({ has: page.getByRole('heading', { name, exact: true, includeHidden: true }) });
      if (name !== '自由文本')
        await section.getByRole('button', { name: '添加一条内容', exact: true }).click();
      const entry = section.locator('.entry-editor').first();
      await entry.locator('[contenteditable=true]').fill(`${name} verification content`);
    }
    const sections = page.locator('.module-details:not(.profile-module)');
    const first = sections.nth(0),
      second = sections.nth(1),
      third = sections.nth(2);
    await first.getByLabel('模块在页面中的位置', { exact: true }).selectOption('left');
    await second.getByLabel('模块在页面中的位置', { exact: true }).selectOption('right');
    await third.getByLabel('模块在页面中的位置', { exact: true }).selectOption('full');
    await third.getByLabel('显示模块标题', { exact: true }).uncheck();
    await third.getByLabel('从新的一页开始', { exact: true }).check();
    const imageEntry = second.locator('.entry-editor').first();
    await openDetails(
      imageEntry.locator('.entry-options:not(.logo-editor):not(.publication-editor)'),
    );
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#70998a';
      ctx.fillRect(0, 0, 64, 32);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await imageEntry
      .locator('.entry-options:not(.logo-editor):not(.publication-editor) input[type=file]')
      .setInputFiles({
        name: 'verification.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
      });
    await imageEntry.locator('.entry-image-thumbnail').waitFor();
    await settle(page);
    let state = await snapshot(page, 'modules-before-drag.json');
    assert.ok(state.sections[1].items[0].image.startsWith('data:image/'));
    assert.equal(state.sections[2].showTitle, false);
    assert.equal(state.sections[2].breakBefore, true);
    assert.equal(
      state.sections.filter((section) =>
        [
          'publications',
          'certifications',
          'awards',
          'languages',
          'volunteering',
          'freeform',
        ].includes(section.type),
      ).length,
      6,
    );
    const geometries = await page
      .locator('.pagination-source .resume-section')
      .evaluateAll((nodes) =>
        nodes.slice(0, 3).map((node) => ({
          placement: node.className,
          left: node.getBoundingClientRect().left,
          width: node.getBoundingClientRect().width,
        })),
      );
    assert.ok(geometries[0].width < geometries[2].width * 0.8);
    assert.ok(geometries[1].left > geometries[0].left);
    const firstId = state.sections[0].id,
      thirdId = state.sections[2].id;
    for (const id of ['profile', ...state.sections.map((section) => section.id)]) {
      if (id === thirdId) continue;
      const module = page.locator(`#module-${id}`);
      if ((await module.getAttribute('open')) !== null)
        await module.locator(':scope > summary').click();
    }
    await page
      .locator(`#module-${thirdId} .drag-handle`)
      .first()
      .dragTo(page.locator(`#module-${firstId} > summary`));
    state = await snapshot(page, 'modules-native-drag.json');
    assert.equal(state.sections[0].id, thirdId);
    await page
      .locator(`#module-${thirdId}`)
      .getByRole('button', { name: '下移项目经历', exact: true })
      .click();
    state = await snapshot(page, 'modules-after-drag.json');
    assert.equal(state.sections[1].id, thirdId);
    await page.screenshot({
      path: fileURLToPath(new URL('modules-preview.png', output)),
      fullPage: true,
    });
  });

  await scenario('one-page-fit', async (page) => {
    const doc = fixture();
    doc.sections = [createSection('summary')];
    doc.sections[0].items[0].description = richText(
      ...Array.from(
        { length: 24 },
        (_, index) =>
          `Achievement ${index + 1}: delivered reliable software with measurable results.`,
      ),
    );
    Object.assign(doc.appearance, {
      fontSize: 18,
      lineHeight: 1.8,
      pageMargin: 24,
      sectionGap: 28,
    });
    await importJson(page, doc);
    await tab(page, '调风格');
    const before = await snapshot(page, 'fit-before.json');
    assert.ok((await page.locator('.preview-panel .resume-document').count()) > 1);
    await page.getByRole('button', { name: '一页适配建议', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '一页适配建议', exact: true });
    await dialog.getByRole('button', { name: '应用建议', exact: true }).waitFor();
    await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
    assert.deepEqual((await snapshot(page)).appearance, before.appearance);
    await page.getByRole('button', { name: '一页适配建议', exact: true }).click();
    await dialog.getByRole('button', { name: '应用建议', exact: true }).click();
    await settle(page);
    assert.equal(await page.locator('.preview-panel .resume-document').count(), 1);
    const after = await snapshot(page, 'fit-applied.json');
    assert.deepEqual(after.sections, before.sections);
    assert.deepEqual(after.profile, before.profile);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await settle(page);
    assert.deepEqual((await snapshot(page)).appearance, before.appearance);
    doc.sections[0].breakBefore = true;
    await importJson(page, doc);
    await tab(page, '调风格');
    await page.getByRole('button', { name: '一页适配建议', exact: true }).click();
    assert.ok((await dialog.innerText()).includes('手动分页'));
    await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
    doc.sections[0].breakBefore = false;
    doc.sections[0].items[0].description = richText(
      ...Array.from(
        { length: 200 },
        (_, index) => `Unavoidable paragraph ${index}: the complete content must remain available.`,
      ),
    );
    await importJson(page, doc);
    await tab(page, '调风格');
    await page.getByRole('button', { name: '一页适配建议', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('dialog[open]')?.textContent?.includes('无法放进一页'),
    );
  });

  await scenario('templates-pdf', async (page) => {
    await importJson(page, fixture());
    await tab(page, '调风格');
    for (const template of templates) {
      await page
        .locator('.template-options')
        .getByRole('button', { name: template.name, exact: true })
        .click();
      await settle(page);
      assert.ok(
        (await page.locator(`.preview-panel .resume-document.template-${template.id}`).count()) > 0,
      );
      const expected = await page.locator('.print-root .resume-document').count();
      pdfPageCounts[template.id] = { expectedPages: expected, pdf: `${template.id}.pdf` };
      await page.pdf({
        path: fileURLToPath(new URL(`${template.id}.pdf`, output)),
        printBackground: true,
        preferCSSPageSize: true,
      });
      await page
        .locator('.preview-panel')
        .screenshot({ path: fileURLToPath(new URL(`${template.id}.png`, output)) });
    }
  });

  await scenario('markdown-html-transfer', async (page, context) => {
    const doc = fixture();
    const field = createField('Hidden metadata');
    field.value = 'PRESERVED_PAYLOAD_VALUE';
    field.visible = false;
    doc.profile.customFields = [field];
    doc.sections[1].items[0].visible = false;
    await importJson(page, doc);
    const before = await snapshot(page);
    await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '导入与导出', exact: true });
    await dialog.getByLabel('附带完整原稿（含隐藏内容，适合备份）', { exact: true }).check();
    const markdown = (
      await downloaded(
        page,
        () => dialog.getByRole('button', { name: '导出 Markdown', exact: true }).click(),
        'resume.md',
      )
    ).toString('utf8');
    assert.match(markdown, /<!-- luck-resume:v1:/);
    await dialog.getByLabel('Markdown 或文本内容', { exact: true }).fill(markdown);
    await dialog.getByRole('button', { name: '预览导入', exact: true }).click();
    await dialog.getByRole('button', { name: '确认导入为新简历', exact: true }).click();
    await settle(page);
    const restored = await snapshot(page, 'markdown-restored.json');
    assert.deepEqual(restored.appearance, before.appearance);
    assert.equal(restored.profile.customFields[0].value, 'PRESERVED_PAYLOAD_VALUE');
    assert.equal(restored.profile.customFields[0].visible, false);
    assert.equal(restored.sections[1].items[0].visible, false);
    await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
    await dialog
      .getByLabel('Markdown 或文本内容', { exact: true })
      .fill(markdown.replace('# 林知夏', '# Edited Person'));
    await dialog.getByRole('button', { name: '预览导入', exact: true }).click();
    await dialog.getByLabel('文件内保存的完整原稿', { exact: true }).check();
    await dialog.getByRole('button', { name: '确认导入为新简历', exact: true }).click();
    await settle(page);
    assert.equal((await snapshot(page)).profile.name, '林知夏');
    await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
    const html = (
      await downloaded(
        page,
        () => dialog.getByRole('button', { name: '导出独立 HTML', exact: true }).click(),
        'resume.html',
      )
    ).toString('utf8');
    assert.match(html, /data:font\/woff2;base64,/);
    const standalone = await context.newPage();
    const standaloneRequests = [];
    standalone.on('request', (request) => {
      if (/^https?:/.test(request.url())) standaloneRequests.push(request.url());
    });
    await standalone.goto(new URL('resume.html', output).href);
    const embeddedFonts = await standalone.evaluate(async () => {
      const loaded = await document.fonts.load('400 16px "Luck Sans"', '中文Résumé');
      await document.fonts.ready;
      return loaded.map((font) => font.status);
    });
    assert.ok(embeddedFonts.length > 0 && embeddedFonts.every((status) => status === 'loaded'));
    assert.deepEqual(standaloneRequests, []);
    assert.ok((await standalone.locator('.resume-document').count()) > 0);
    await standalone.close();
    await dialog
      .getByLabel('Markdown 或文本内容', { exact: true })
      .fill(
        '# Plain Person\n\n## Unknown specialty\n<script>window.__unsafeImport=true</script>\n<img src=x onerror="window.__unsafeImport=true">\nPreserve unknown content.',
      );
    await dialog.getByRole('button', { name: '预览导入', exact: true }).click();
    await dialog.getByRole('button', { name: '确认导入为新简历', exact: true }).click();
    await settle(page);
    assert.equal(await page.evaluate(() => window.__unsafeImport), undefined);
    const plain = await snapshot(page, 'plain-import.json');
    assert.equal(plain.sections[0].title, 'Unknown specialty');
    assert.equal(plain.sections[0].type, 'freeform');
    assert.ok((await page.locator('.preview-panel').innerText()).includes('<script>'));
    assert.equal(
      await page.locator('.preview-panel script, .preview-panel img[src="x"]').count(),
      0,
    );
  });
  await scenario('visible-output-review', async (page) => {
    const doc = fixture();
    doc.profile.hiddenFields = ['name', 'email', 'phone'];
    const entry = doc.sections[1].items[0];
    entry.title = 'Date review target';
    entry.startDate = '2025-08';
    entry.endDate = '2023-03';
    const field = createField('Project link', 'link');
    field.value = 'not a valid link';
    entry.customFields = [field];
    const hidden = createField('Hidden broken link', 'link');
    hidden.value = 'hidden invalid link';
    hidden.visible = false;
    doc.profile.customFields = [hidden];
    await importJson(page, doc);
    await tab(page, '检查一下');
    assert.equal(await page.locator('[data-check-id=name]').getAttribute('class'), '');
    assert.equal(await page.locator('[data-check-id=contact]').getAttribute('class'), '');
    const links = page.locator('[data-check-id=links]');
    assert.equal(await links.locator('.review-issues li').count(), 1);
    assert.ok((await links.innerText()).includes('Project link'));
    await page.locator('[data-check-id=dates] .review-issues button').click();
    const target = page
      .locator('.entry-editor')
      .filter({ has: page.getByLabel('公司名称', { exact: true }) })
      .first();
    await target.getByLabel('开始时间', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(
      await target.getByLabel('公司名称', { exact: true }).inputValue(),
      'Date review target',
    );
    await target.getByLabel('结束时间', { exact: true }).fill('2026-03');
    await tab(page, '检查一下');
    assert.equal(await page.locator('[data-check-id=dates]').getAttribute('class'), 'done');
  });

  await scenario('extended-rich-controls', async (page, context) => {
    await importJson(page, fixture());
    const entry = page.locator('.entry-editor').first();
    const content = entry.locator('[contenteditable=true]');
    await content.fill('Rich flexibility survives local transfer.');
    await content.press('Control+A');
    await entry.getByRole('button', { name: '删除线', exact: true }).click();
    await entry.getByLabel('段落缩进', { exact: true }).selectOption('2');
    await entry.getByLabel('段落行距', { exact: true }).selectOption('2');
    await entry.getByLabel('文字高亮', { exact: true }).selectOption('mint');
    await settle(page);
    let saved = await snapshot(page, 'rich-controls.json');
    const paragraph = saved.sections[0].items[0].description.content[0];
    assert.equal(paragraph.attrs.paragraphIndent, 2);
    assert.equal(paragraph.attrs.lineHeight, 2);
    assert.ok(paragraph.content[0].marks.some((mark) => mark.type === 'strike'));
    assert.ok(
      paragraph.content[0].marks.some(
        (mark) => mark.type === 'highlight' && mark.attrs.color === 'mint',
      ),
    );
    await importJson(page, saved);
    await settle(page);
    const colors = await page
      .locator('.preview-panel .resume-rich mark')
      .first()
      .evaluate((mark) => ({
        color: getComputedStyle(mark).color,
        parent: getComputedStyle(mark.parentElement).color,
        background: getComputedStyle(mark).backgroundColor,
      }));
    assert.equal(colors.color, colors.parent);
    assert.equal(colors.background, 'rgb(222, 238, 228)');
    pdfPageCounts['rich-controls'] = {
      expectedPages: await page.locator('.print-root .resume-document').count(),
      pdf: 'rich-controls.pdf',
    };
    await page.pdf({
      path: fileURLToPath(new URL('rich-controls.pdf', output)),
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '导入与导出', exact: true });
    const html = (
      await downloaded(
        page,
        () => dialog.getByRole('button', { name: '导出独立 HTML', exact: true }).click(),
        'rich-controls.html',
      )
    ).toString('utf8');
    assert.match(html, /<mark/);
    const standalone = await context.newPage();
    await standalone.goto(new URL('rich-controls.html', output).href);
    assert.ok((await standalone.locator('mark').count()) > 0);
    assert.equal(
      await standalone
        .locator('.resume-rich p')
        .first()
        .evaluate((p) => getComputedStyle(p).lineHeight),
      '26px',
    );
    await standalone.close();
    await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
    await content.click();
    await content.press('Control+A');
    await entry.getByRole('button', { name: '清除格式', exact: true }).click();
    saved = await snapshot(page);
    const cleared = saved.sections[0].items[0].description.content[0];
    assert.ok(!cleared.attrs?.paragraphIndent && !cleared.attrs?.lineHeight);
    assert.ok(!cleared.content[0].marks?.length);
    await content.fill('First list item');
    await entry.getByRole('button', { name: '无序列表', exact: true }).click();
    await content.press('Control+End');
    await content.press('Enter');
    await content.pressSequentially('Second list item');
    await entry.getByRole('button', { name: '增加列表缩进', exact: true }).click();
    saved = await snapshot(page);
    assert.equal(
      saved.sections[0].items[0].description.content[0].content[0].content[1].type,
      'bulletList',
    );
    await entry.getByRole('button', { name: '减少列表缩进', exact: true }).click();
    saved = await snapshot(page);
    assert.equal(saved.sections[0].items[0].description.content[0].content.length, 2);
    await page
      .locator('.entry-editor')
      .first()
      .screenshot({ path: fileURLToPath(new URL('rich-controls.png', output)) });
    const long = fixture();
    long.sections = [long.sections[0]];
    long.sections[0].items[0].description.content = Array.from({ length: 60 }, () =>
      structuredClone(paragraph),
    );
    await importJson(page, long);
    const printed = await page.locator('.print-root').innerText();
    assert.equal(printed.split('Rich flexibility survives local transfer.').length - 1, 60);
    assert.ok((await page.locator('.print-root .resume-document').count()) > 1);
    assert.ok((await page.locator('.print-root mark').count()) >= 60);
    pdfPageCounts['rich-controls-long'] = {
      expectedPages: await page.locator('.print-root .resume-document').count(),
      pdf: 'rich-controls-long.pdf',
    };
    await page.pdf({
      path: fileURLToPath(new URL('rich-controls-long.pdf', output)),
      printBackground: true,
      preferCSSPageSize: true,
    });
  });

  await scenario('linked-local-file-workflow', async (page, context) => {
    const disk = fixture();
    disk.profile.name = 'File original';
    await context.addInitScript((initial) => {
      const state = { disk: initial, permission: 'granted' };
      window.__localFileTest = state;
      const handle = {
        name: 'linked-resume.json',
        async getFile() {
          return new File([state.disk], this.name, { type: 'application/json' });
        },
        async requestPermission() {
          return state.permission;
        },
        async isSameEntry(other) {
          return other === handle;
        },
        async createWritable() {
          let pending = '';
          return {
            async write(content) {
              pending = content;
            },
            async close() {
              state.disk = pending;
            },
            async abort() {},
          };
        },
      };
      window.showOpenFilePicker = async () => [handle];
      window.showSaveFilePicker = async () => handle;
    }, serializeResume(disk));
    await page.reload();
    await settle(page);
    await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '导入与导出', exact: true });
    await dialog.getByRole('button', { name: '打开并关联 JSON', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('.local-file-panel')?.textContent?.includes('linked-resume.json'),
    );
    await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), 'File original');
    await page.getByLabel('姓名', { exact: true }).fill('File saved from editor');
    await page.getByLabel('姓名', { exact: true }).press('Control+S');
    await page.waitForFunction(
      () =>
        JSON.parse(window.__localFileTest.disk).resume.profile.name === 'File saved from editor',
    );
    assert.ok(
      (
        await page.getByRole('button', { name: '保存到关联文件', exact: true }).innerText()
      ).includes('文件已保存'),
    );
    await page.evaluate(() => {
      const external = JSON.parse(window.__localFileTest.disk);
      external.resume.profile.name = 'External version';
      window.__localFileTest.disk = JSON.stringify(external);
    });
    await page.getByLabel('姓名', { exact: true }).fill('Keep current draft');
    await page.getByRole('button', { name: '保存到关联文件', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('.storage-banner')?.textContent?.includes('外部修改'),
    );
    assert.equal(
      await page.evaluate(() => JSON.parse(window.__localFileTest.disk).resume.profile.name),
      'External version',
    );
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), 'Keep current draft');
    await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
    await dialog.getByRole('button', { name: '断开文件关联', exact: true }).click();
    assert.ok((await dialog.locator('.local-file-panel').innerText()).includes('尚未关联'));
    await dialog.getByRole('button', { name: '另存为 JSON 文件', exact: true }).click();
    await page.waitForFunction(
      () => JSON.parse(window.__localFileTest.disk).resume.profile.name === 'Keep current draft',
    );
  });

  await scenario('aligned-tall-image', async (page) => {
    const doc = fixture();
    const canvasImage = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 1000;
      const context = canvas.getContext('2d');
      context.fillStyle = '#70998a';
      context.fillRect(0, 0, 10, 1000);
      return canvas.toDataURL('image/png');
    });
    doc.sections = [doc.sections[0]];
    Object.assign(doc.sections[0].items[0], {
      image: canvasImage,
      imageWidth: 60,
      imageAlign: 'right',
    });
    await importJson(page, doc);
    async function sampleImage() {
      const screenshot = await page
        .locator('.preview-panel .resume-entry-image')
        .first()
        .screenshot();
      return page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixel = (x) =>
          Array.from(context.getImageData(x, Math.floor(canvas.height / 2), 1, 1).data).slice(0, 3);
        return {
          left: pixel(2),
          center: pixel(Math.floor(canvas.width / 2)),
          right: pixel(canvas.width - 3),
        };
      }, screenshot.toString('base64'));
    }
    let pixels = await sampleImage();
    assert.deepEqual(pixels.right, [112, 153, 138]);
    assert.deepEqual(pixels.left, [255, 255, 255]);
    await openDetails(page.locator('.entry-options').first());
    await page.getByLabel('配图对齐', { exact: true }).selectOption('center');
    await settle(page);
    pixels = await sampleImage();
    assert.deepEqual(pixels.center, [112, 153, 138]);
    assert.deepEqual(pixels.left, [255, 255, 255]);
    assert.deepEqual(pixels.right, [255, 255, 255]);
  });

  await scenario('column-ratio-and-image-alignment', async (page) => {
    const doc = fixture();
    doc.sections[0].placement = 'left';
    doc.sections[1].placement = 'right';
    doc.sections[2].placement = 'full';
    const entry = doc.sections[1].items[0];
    entry.image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=';
    entry.imageWidth = 30;
    await importJson(page, doc);
    const options = page
      .locator('.entry-editor')
      .filter({ has: page.getByLabel('公司名称', { exact: true }) })
      .first()
      .locator('.entry-options:not(.logo-editor):not(.publication-editor)');
    await openDetails(options);
    await options.getByLabel('配图对齐', { exact: true }).selectOption('right');
    await tab(page, '调风格');
    await openDetails(page.locator('.advanced-settings'));
    await page.locator('#range-columnRatio').fill('35');
    await page.locator('#range-columnGap').fill('18');
    await settle(page);
    const bounds = await page.locator('.pagination-source .resume-document').evaluate((paper) => {
      const left = paper.querySelector('.placement-left').getBoundingClientRect();
      const right = paper.querySelector('.placement-right').getBoundingClientRect();
      const image = paper.querySelector('.resume-entry-image').getBoundingClientRect();
      const imageParent = paper
        .querySelector('.resume-entry-content:has(.resume-entry-image)')
        .getBoundingClientRect();
      return {
        ratio: left.width / (left.width + right.width),
        gap: right.left - left.right,
        imageRight: image.right,
        parentRight: imageParent.right,
      };
    });
    assert.ok(Math.abs(bounds.ratio - 0.35) < 0.01);
    assert.ok(Math.abs(bounds.gap - 18) < 1);
    assert.ok(Math.abs(bounds.imageRight - bounds.parentRight) < 1);
    const saved = await snapshot(page, 'layout-controls.json');
    assert.equal(saved.appearance.columnRatio, 35);
    assert.equal(saved.appearance.columnGap, 18);
    assert.equal(saved.sections[1].items[0].imageAlign, 'right');
    pdfPageCounts['column-controls'] = {
      expectedPages: await page.locator('.print-root .resume-document').count(),
      pdf: 'column-controls.pdf',
    };
    await page.pdf({
      path: fileURLToPath(new URL('column-controls.pdf', output)),
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page
      .locator('.preview-panel')
      .screenshot({ path: fileURLToPath(new URL('layout-controls.png', output)) });
    for (const template of templates) {
      for (const ratio of [20, 80]) {
        const layout = structuredClone(doc);
        Object.assign(layout.appearance, {
          template: template.id,
          columnRatio: ratio,
          columnGap: 64,
        });
        layout.sections[0].columns = 2;
        await importJson(page, layout);
        const overflow = await page
          .locator('.preview-panel .resume-document')
          .evaluateAll((papers) =>
            papers.some((paper) => {
              const rect = paper.getBoundingClientRect();
              return Array.from(
                paper.querySelectorAll('.resume-section,.resume-entry-image,.resume-rich'),
              ).some((element) => {
                const box = element.getBoundingClientRect();
                return (
                  box.left < rect.left - 1 ||
                  box.right > rect.right + 1 ||
                  box.bottom > rect.bottom + 1
                );
              });
            }),
          );
        assert.equal(overflow, false, `${template.id} at ${ratio}% must fit inside A4`);
      }
    }
    const hiddenLayout = fixture();
    hiddenLayout.sections[0].placement = 'left';
    hiddenLayout.sections[0].visible = false;
    await importJson(page, hiddenLayout);
    assert.equal(await page.locator('.pagination-source .resume-custom-layout').count(), 0);
  });
  await scenario('profile-photo-icons-and-layout', async (page) => {
    const doc = fixture();
    doc.profile.photo =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=';
    await importJson(page, doc);
    await openDetails(page.locator('.profile-module .profile-options').first());
    await page.getByLabel('电子邮箱图标', { exact: true }).selectOption('mail');
    await page.getByLabel('个人网站 / 作品集图标', { exact: true }).selectOption('github');
    await tab(page, '调风格');
    await page.getByRole('button', { name: '靠右', exact: true }).click();
    await page.getByLabel('显示字段图标', { exact: true }).check();
    await page.getByRole('button', { name: '上下排列', exact: true }).click();
    await openDetails(page.locator('.advanced-settings'));
    await page.locator('#range-photoWidth').fill('120');
    await page.locator('#range-photoHeight').fill('160');
    await page.locator('#range-photoRadius').fill('18');
    await page.getByLabel('照片适配', { exact: true }).selectOption('contain');
    await page.getByLabel('照片位置', { exact: true }).selectOption('left');
    await page.getByLabel('条目标题布局', { exact: true }).selectOption('stacked');
    await page.getByLabel('副标题对齐', { exact: true }).selectOption('center');
    await page.getByLabel('日期显示格式', { exact: true }).selectOption('MM/YYYY');
    await settle(page);
    const saved = await snapshot(page, 'personalized-profile.json');
    assert.equal(saved.appearance.photoWidth, 120);
    assert.equal(saved.appearance.photoHeight, 160);
    assert.equal(saved.profile.fieldIcons.email, 'mail');
    const geometry = await page.locator('.pagination-source .resume-photo').evaluate((image) => ({
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
      radius: getComputedStyle(image).borderRadius,
      fit: getComputedStyle(image).objectFit,
    }));
    assert.deepEqual(geometry, { width: 120, height: 160, radius: '18px', fit: 'contain' });
    assert.equal(
      await page
        .locator('.pagination-source .resume-identity')
        .evaluate((identity) => getComputedStyle(identity).textAlign),
      'right',
    );
    assert.ok((await page.locator('.preview-panel .resume-contacts svg').count()) >= 3);
    assert.match(await page.locator('.preview-panel').innerText(), /03\/2023/);
    await importJson(page, saved);
    assert.deepEqual((await snapshot(page)).appearance, saved.appearance);
    await tab(page, '调风格');
    await page.getByRole('button', { name: '恢复默认排版', exact: true }).click();
    const reset = await snapshot(page);
    assert.equal(reset.appearance.photoWidth, undefined);
    assert.equal(reset.appearance.headerAlign, 'left');
  });

  await scenario('logos-publications-and-link-labels', async (page) => {
    const doc = fixture();
    const publication = createSection('publications');
    const paper = createEntry('publications');
    paper.title = 'An original research result';
    paper.startDate = '2024-06';
    publication.items = [paper];
    doc.sections.push(publication);
    await importJson(page, doc);
    const company = page
      .locator('.entry-editor')
      .filter({ has: page.getByLabel('公司名称', { exact: true }) })
      .first();
    await company.getByLabel('相关链接（可选）', { exact: true }).fill('https://example.com/work');
    await company.getByLabel('链接显示文字（可选）', { exact: true }).fill('View original work');
    const logo = company.locator('.logo-editor');
    await openDetails(logo);
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      context.fillStyle = '#70998a';
      context.fillRect(0, 0, 64, 64);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await logo.locator('input[type=file]').setInputFiles({
      name: 'organization.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
    await logo.locator('.logo-editor-preview img').waitFor();
    await logo.getByLabel('标识尺寸', { exact: true }).fill('48');
    await logo.getByLabel('标识位置', { exact: true }).selectOption('right');
    await openDetails(logo.locator('.logo-library'));
    await logo.getByLabel('素材名称', { exact: true }).fill('Local organization');
    await logo.getByRole('button', { name: '保存当前标识', exact: true }).click();
    await logo.locator('.logo-asset-row').waitFor();
    await logo.getByRole('button', { name: '移除标识', exact: true }).click();
    await logo.getByLabel('搜索本地标识', { exact: true }).fill('organization');
    await logo
      .locator('.logo-asset-row')
      .getByRole('button', { name: '使用', exact: true })
      .click();
    const pub = page.locator('.publication-editor');
    await openDetails(pub);
    await pub.getByLabel('作者列表', { exact: true }).fill('Alice Doe; Bob Chen');
    await pub.getByLabel('加粗作者', { exact: true }).fill('Bob Chen');
    await pub.getByLabel('期刊 / 会议', { exact: true }).fill('Local Science');
    await pub.getByLabel('发表状态', { exact: true }).selectOption('accepted');
    await pub.getByLabel('引用格式', { exact: true }).selectOption('numbered');
    await settle(page);
    const saved = await snapshot(page, 'personalized-entries.json');
    assert.equal(saved.sections[1].items[0].logoSize, 48);
    assert.equal(saved.sections[1].items[0].linkLabel, 'View original work');
    assert.equal(
      await page.locator('.preview-panel .resume-publication-authors strong').innerText(),
      'Bob Chen',
    );
    assert.equal(
      await page.locator('.preview-panel .resume-entry-link').first().innerText(),
      'View original work',
    );
    assert.equal(await page.locator('.preview-panel .resume-entry-logo').count(), 1);
    await pub.getByLabel('显示论文信息', { exact: true }).uncheck();
    await logo.getByLabel('显示标识', { exact: true }).uncheck();
    await settle(page);
    assert.equal(
      await page
        .locator('.preview-panel .resume-entry-logo, .preview-panel .resume-publication')
        .count(),
      0,
    );
    const hidden = await snapshot(page);
    assert.ok(hidden.sections[1].items[0].logo);
    assert.equal(hidden.sections.at(-1).items[0].publication.authors, 'Alice Doe; Bob Chen');
  });

  await scenario('local-contribution-calendar', async (page) => {
    await importJson(page, fixture());
    const control = page.locator('.contributions-editor');
    await openDetails(control);
    await control.getByLabel('导入年份', { exact: true }).fill('2024');
    await control.getByLabel('导入标题', { exact: true }).fill('Local contributions');
    await control.getByLabel('粘贴贡献数据', { exact: true }).fill('date,count\n2024-02-30,2');
    await control.getByRole('button', { name: '预览数据', exact: true }).click();
    assert.equal(await control.getByRole('alert').count(), 1);
    assert.equal(await page.locator('.preview-panel .resume-contributions').count(), 0);
    await control
      .getByLabel('粘贴贡献数据', { exact: true })
      .fill('date,count\n2024-02-29,12\n2024-03-01,3');
    await control.getByRole('button', { name: '预览数据', exact: true }).click();
    await control.getByRole('button', { name: '应用此日历', exact: true }).click();
    await settle(page);
    assert.equal(
      await page
        .locator('.preview-panel .contribution-cell:not(.contribution-level-empty)')
        .count(),
      366,
    );
    assert.ok(
      (await page.locator('.preview-panel .resume-contributions').innerText()).includes('15'),
    );
    const saved = await snapshot(page, 'personalized-calendar.json');
    await importJson(page, saved);
    assert.deepEqual((await snapshot(page)).profile.contributions, saved.profile.contributions);
    await openDetails(control);
    await control.getByLabel('在简历中显示贡献日历', { exact: true }).uncheck();
    await settle(page);
    assert.equal(await page.locator('.preview-panel .resume-contributions').count(), 0);
  });

  await scenario('workspace-themes-and-introduction', async (page, context) => {
    await importJson(page, fixture());
    const divider = page.getByRole('separator', { name: '调整编辑区宽度', exact: true });
    const before = Number(await divider.getAttribute('aria-valuenow'));
    await divider.focus();
    await divider.press('ArrowRight');
    assert.ok(Number(await divider.getAttribute('aria-valuenow')) > before);
    const box = await divider.boundingBox();
    const current = Number(await divider.getAttribute('aria-valuenow'));
    await page.mouse.move(box.x + box.width / 2, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 70, box.y + 50, { steps: 4 });
    await page.mouse.up();
    assert.ok(Number(await divider.getAttribute('aria-valuenow')) > current);
    await page.getByRole('button', { name: '收起预览区', exact: true }).click();
    assert.equal(await page.locator('.preview-panel').isVisible(), false);
    await page.getByRole('button', { name: '展开预览区', exact: true }).click();
    await page.getByRole('button', { name: '收起编辑区', exact: true }).click();
    assert.equal(await page.locator('.edit-panel').isVisible(), false);
    await page.getByRole('button', { name: '恢复布局', exact: true }).click();
    await page.getByLabel('界面主题', { exact: true }).selectOption('dark');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    const paper = await page
      .locator('.preview-panel .resume-document')
      .first()
      .evaluate((paper) => ({
        background: getComputedStyle(paper).backgroundColor,
        color: getComputedStyle(paper).color,
      }));
    assert.deepEqual(paper, { background: 'rgb(255, 255, 255)', color: 'rgb(37, 43, 40)' });
    await page.reload();
    await settle(page);
    assert.equal(await page.getByLabel('界面主题', { exact: true }).inputValue(), 'dark');
    await page.getByLabel('界面主题', { exact: true }).selectOption('system');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.locator('.main-nav a[href="#home"]').click();
    assert.equal(await page.locator('.introduction-template-grid .document-thumbnail').count(), 9);
    await page.screenshot({
      path: fileURLToPath(new URL('introduction-dark.png', output)),
      fullPage: true,
    });
    await page.locator('.main-nav a[href="#editor"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await divider.isVisible(), false);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page
      .locator('.mobile-view-switch')
      .getByRole('button', { name: '预览简历', exact: true })
      .click();
    assert.equal(await page.locator('.preview-panel').isVisible(), true);
    await page.screenshot({
      path: fileURLToPath(new URL('mobile-dark.png', output)),
      fullPage: true,
    });
  });

  await scenario('personalization-templates-pdf', async (page) => {
    const doc = fixture();
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      context.fillStyle = '#b9d5c3';
      context.fillRect(0, 0, 64, 64);
      return canvas.toDataURL();
    });
    doc.profile.photo = image;
    doc.profile.contributions = {
      title: 'Local contributions',
      visible: true,
      year: 2024,
      days: [{ date: '2024-02-29', count: 15 }],
    };
    const pub = createSection('publications');
    const entry = createEntry('publications');
    entry.title = 'A study of original interfaces';
    entry.startDate = '2024-06';
    entry.publication = {
      authors: 'Alice Doe; Bob Chen',
      highlightedAuthor: 'Bob Chen',
      venue: 'Local Journal',
      status: 'published',
      citationStyle: 'numbered',
    };
    entry.logo = image;
    entry.logoSize = 48;
    pub.items = [entry];
    doc.sections.push(pub);
    Object.assign(doc.appearance, {
      headerAlign: 'right',
      photoWidth: 100,
      photoHeight: 140,
      photoRadius: 12,
      contactIcons: true,
      entryHeadingLayout: 'stacked',
      subtitleAlign: 'center',
      dateFormat: 'MM/YYYY',
    });
    for (const template of templates) {
      doc.appearance.template = template.id;
      await importJson(page, doc);
      assert.equal(await page.locator('.print-root .resume-entry-logo').count(), 1);
      assert.equal(
        await page.locator('.print-root .resume-publication-authors strong').innerText(),
        'Bob Chen',
      );
      const overflow = await page.locator('.preview-panel .resume-document').evaluateAll((papers) =>
        papers.some((paper) => {
          const rect = paper.getBoundingClientRect();
          return Array.from(
            paper.querySelectorAll(
              '.resume-entry-logo,.resume-photo,.resume-section,.resume-contributions',
            ),
          ).some((element) => {
            const box = element.getBoundingClientRect();
            return (
              box.left < rect.left - 1 || box.right > rect.right + 1 || box.bottom > rect.bottom + 1
            );
          });
        }),
      );
      assert.equal(overflow, false, template.id);
      const name = `personalized-${template.id}`;
      pdfPageCounts[name] = {
        expectedPages: await page.locator('.print-root .resume-document').count(),
        pdf: `${name}.pdf`,
      };
      await page.pdf({
        path: fileURLToPath(new URL(`${name}.pdf`, output)),
        printBackground: true,
        preferCSSPageSize: true,
      });
    }
    await page
      .locator('.preview-panel')
      .screenshot({ path: fileURLToPath(new URL('personalized-preview.png', output)) });
  });
  await scenario('photo-header-template-modes', async (page) => {
    const doc = fixture();
    doc.profile.photo =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=';
    Object.assign(doc.appearance, { photoWidth: 180, photoHeight: 220, headerAlign: 'right' });
    for (const template of templates) {
      for (const layout of ['standard', 'stacked']) {
        for (const side of ['left', 'right']) {
          Object.assign(doc.appearance, {
            template: template.id,
            headerLayout: layout,
            photoSide: side,
          });
          await importJson(page, doc);
          const rects = await page
            .locator('.pagination-source .resume-header')
            .evaluate((header) => {
              const read = (element) => {
                const rect = element.getBoundingClientRect();
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
              };
              return {
                header: read(header),
                identity: read(header.querySelector('.resume-identity')),
                photo: read(header.querySelector('.resume-photo')),
              };
            });
          assert.ok(
            rects.photo.bottom <= rects.header.bottom + 1,
            `${template.id} photo fits header`,
          );
          assert.ok(
            layout === 'stacked'
              ? rects.photo.bottom <= rects.identity.top
              : side === 'left'
                ? rects.photo.right <= rects.identity.left
                : rects.identity.right <= rects.photo.left,
            `${template.id} ${layout} ${side} preserves ordering without overlap`,
          );
        }
      }
    }
  });
} finally {
  await writeFile(
    new URL('results.json', output),
    JSON.stringify({ results, pageErrors, externalRequests }, null, 2),
  );
  await writeFile(new URL('pdf-page-counts.json', output), JSON.stringify(pdfPageCounts, null, 2));
  await browser.close();
  server?.kill();
}
if (
  results.some((result) => result.status === 'failed') ||
  pageErrors.length ||
  externalRequests.length
)
  process.exitCode = 1;
console.log(
  `Flexible verification: ${results.filter((result) => result.status === 'passed').length}/${results.length} scenarios passed; ${pageErrors.length} page errors; ${externalRequests.length} external requests.`,
);
