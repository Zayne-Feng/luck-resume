import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { createDocument, createEntry, createSection } from '../src/resume/model.ts';

const base = process.env.LUCK_FREEDOM_URL || 'http://127.0.0.1:5211';
const engineName = process.env.LUCK_PATCH_ENGINE || 'chromium';
const engine = { chromium, firefox, webkit }[engineName];
const output = new URL(`../test-results/parity-patches/${engineName}/`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await engine.launch(
  engineName === 'chromium' && process.platform === 'win32' ? { channel: 'msedge' } : {},
);
const results = [];
const errors = [];
const fixture = createDocument();
fixture.profile.name = 'Patch fixture';
fixture.profile.birthday = '2000-05-16';
const section = createSection('publications');
const entry = createEntry('publications');
entry.title = 'Publication fixture';
entry.link = 'https://example.org';
entry.linkLabel = 'Evidence';
entry.description = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Aligned heading' }] },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Small ',
          marks: [
            { type: 'textStyle', attrs: { fontSize: '12px', color: '#123456' } },
            { type: 'bold' },
          ],
        },
        {
          type: 'text',
          text: 'Large',
          marks: [
            { type: 'textStyle', attrs: { fontSize: '24px', color: '#654321' } },
            { type: 'italic' },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Outside',
          marks: [{ type: 'textStyle', attrs: { fontSize: '18px', color: '#112233' } }],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Default ' },
        {
          type: 'text',
          text: 'Sized',
          marks: [{ type: 'textStyle', attrs: { fontSize: '20px' } }],
        },
      ],
    },
  ],
};
section.items = [entry];
fixture.sections = [section];
async function setup() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.waitForSelector('.preview-panel .resume-document');
  await page.evaluate(async (document) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    useWorkspace.getState().add(document);
  }, fixture);
  const card = page.locator(`#entry-${entry.id}`);
  await card.evaluate((element) => {
    for (let node = element; node; node = node.parentElement)
      if (node.tagName === 'DETAILS') node.open = true;
  });
  return { page, card, input: card.locator('.rich-input') };
}
async function current(page) {
  return page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const state = useWorkspace.getState();
    return state.documents[state.activeId];
  });
}
async function run(name, operation) {
  const context = await setup();
  try {
    await operation(context);
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  } finally {
    await context.page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
    await context.page.close();
  }
}
try {
  await run('heading-alignment', async ({ page, card, input }) => {
    await input.locator('h2').click();
    const alignment = card.getByLabel('段落对齐', { exact: true });
    for (const value of ['center', 'right', 'justify', 'left', 'center']) {
      await alignment.selectOption(value);
      assert.equal(
        await input.locator('h2').evaluate((element) => getComputedStyle(element).textAlign),
        value,
      );
      assert.equal(
        (await current(page)).sections[0].items[0].description.content[0].attrs.textAlign,
        value,
      );
    }
    await input.locator('p').first().click();
    await page.waitForFunction(
      () => document.querySelector('select[aria-label="段落对齐"]')?.value === 'left',
    );
    assert.equal(await alignment.inputValue(), 'left');
    await input.locator('h2').click();
    await page.waitForFunction(
      () => document.querySelector('select[aria-label="段落对齐"]')?.value === 'center',
    );
    assert.equal(await alignment.inputValue(), 'center');
    await page.waitForFunction(
      () =>
        document.querySelector('.pagination-source .resume-rich h2')?.style.textAlign === 'center',
    );
    const html = await page.evaluate(async () => {
      const { buildPrintHtml } = await import('/src/resume/htmlExport.ts');
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      const state = useWorkspace.getState();
      return buildPrintHtml(state.documents[state.activeId]);
    });
    assert.match(html, /<h2 style="text-align: center;?">Aligned heading<\/h2>/);
    await writeFile(new URL('aligned.html', output), html);
    const response = await page.request.post(`${base}/api/pdf`, {
      data: { html },
      timeout: 120000,
    });
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    await writeFile(new URL('aligned.pdf', output), bytes);
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const pdf = await loading.promise;
    try {
      const text = await (await pdf.getPage(1)).getTextContent();
      const heading = text.items.find((item) => item.str === 'Aligned heading');
      assert.ok(heading);
      // Linen reserves 102 CSS pixels for its section label and gap.
      const center = heading.transform[4] + heading.width / 2;
      assert.ok(Math.abs(center - 335.89) < 3, `Unexpected heading center: ${center}`);
    } finally {
      await loading.destroy();
    }
  });
  await run('doi-prefix', async ({ page, card }) => {
    await card.getByLabel('相关链接（可选）', { exact: true }).fill('doi: 10.1000/Example');
    await page.locator('.preview-panel a[href="https://doi.org/10.1000/Example"]').waitFor();
    assert.equal((await current(page)).sections[0].items[0].link, 'doi: 10.1000/Example');
  });
  await run('mixed-font-size', async ({ page, card, input }) => {
    await input
      .locator('p')
      .first()
      .evaluate((element) => {
        element.closest('[contenteditable]').focus();
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
    const font = card.getByLabel('选区字号', { exact: true });
    await page.waitForFunction(
      () => document.querySelector('select[aria-label="选区字号"]')?.value === 'mixed',
    );
    assert.equal(await font.locator('option:checked').textContent(), '混合字号');
    await font.selectOption('16px');
    let content = (await current(page)).sections[0].items[0].description.content;
    assert.deepEqual(
      content[1].content.map(
        (node) => node.marks.find((mark) => mark.type === 'textStyle').attrs.fontSize,
      ),
      ['16px', '16px'],
    );
    await font.selectOption('');
    content = (await current(page)).sections[0].items[0].description.content;
    assert.deepEqual(
      content[1].content.map(
        (node) => node.marks.find((mark) => mark.type === 'textStyle').attrs.color,
      ),
      ['#123456', '#654321'],
    );
    assert.ok(
      content[1].content.every(
        (node) => !node.marks.find((mark) => mark.type === 'textStyle')?.attrs.fontSize,
      ),
    );
    assert.ok(content[1].content[0].marks.some((mark) => mark.type === 'bold'));
    assert.ok(content[1].content[1].marks.some((mark) => mark.type === 'italic'));
    assert.equal(content[2].content[0].marks[0].attrs.fontSize, '18px');
    assert.equal(await font.inputValue(), '');
    await input
      .locator('p')
      .nth(2)
      .evaluate((element) => {
        element.closest('[contenteditable]').focus();
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
    await page.waitForFunction(
      () => document.querySelector('select[aria-label="选区字号"]')?.value === 'mixed',
    );
    await font.selectOption('');
    const validated = await page.evaluate(async () => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      const { validateDocument } = await import('/src/resume/files.ts');
      const state = useWorkspace.getState();
      return validateDocument(state.documents[state.activeId]);
    });
    assert.ok(
      validated.sections[0].items[0].description.content[3].content.every(
        (node) => !node.marks?.some((mark) => mark.type === 'textStyle'),
      ),
    );
  });
  await run('birth-date-precision', async ({ page }) => {
    const field = page.locator('input[name="profile-birthday"]');
    await field.evaluate((element) => {
      for (let node = element; node; node = node.parentElement)
        if (node.tagName === 'DETAILS') node.open = true;
    });
    const precision = page.getByLabel('出生日期精度', { exact: true });
    await precision.selectOption('month');
    assert.equal(await field.getAttribute('type'), 'month');
    await field.fill('2001-06');
    assert.equal((await current(page)).profile.birthday, '2001-06');
    await precision.selectOption('date');
    assert.equal(await field.inputValue(), '');
    assert.equal((await current(page)).profile.birthday, '2001-06');
    await field.fill('2001-06-18');
    await precision.selectOption('month');
    assert.equal((await current(page)).profile.birthday, '2001-06');
    await page.evaluate(async () => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      await useWorkspace.getState().flush();
    });
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('input[name="profile-birthday"]')?.value === '2001-06',
    );
    assert.equal(await field.getAttribute('type'), 'month');
    assert.equal(
      await page.locator('.preview-panel [data-field-id="birthday"]').textContent(),
      '2001-06',
    );
  });
  await run('birth-date-keyboard', async ({ page }) => {
    const field = page.locator('input[name="profile-birthday"]');
    await field.evaluate((element) => {
      for (let node = element; node; node = node.parentElement)
        if (node.tagName === 'DETAILS') node.open = true;
    });
    await page.getByLabel('出生日期精度', { exact: true }).selectOption('month');
    await field.evaluate((element) => {
      element.type = 'text';
    });
    await field.fill('');
    await field.pressSequentially('2001-', { delay: 30 });
    assert.equal(await field.inputValue(), '2001-');
    assert.equal((await current(page)).profile.birthday, '');
    await field.pressSequentially('06', { delay: 30 });
    assert.equal((await current(page)).profile.birthday, '2001-06');
    await field.fill('2001-0');
    await field.blur();
    assert.equal((await current(page)).profile.birthday, '2001-06');
    assert.equal(await field.inputValue(), '2001-0');
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    await page.evaluate(async (fixture) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      const next = structuredClone(fixture);
      next.id = crypto.randomUUID();
      next.profile.birthday = '2001-06';
      useWorkspace.getState().add(next);
    }, fixture);
    await page.waitForFunction(
      () => document.querySelector('input[name="profile-birthday"]')?.value === '2001-06',
    );
    assert.notEqual(await field.getAttribute('aria-invalid'), 'true');
  });
  await writeFile(
    new URL('results.json', output),
    JSON.stringify({ engine: engineName, results, errors }, null, 2),
  );
  console.log(JSON.stringify({ engine: engineName, results, errors }, null, 2));
  assert.ok(results.every((result) => result.passed));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
