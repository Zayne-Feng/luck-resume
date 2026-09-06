import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import {
  createDocument,
  createSection,
  createEntry,
  richText,
  textContent,
} from '../src/resume/model.ts';
const engine = process.env.LUCK_ENGINE || 'chromium';
const baseURL = process.env.LUCK_FUNCTIONAL_URL || 'http://127.0.0.1:5213';
const output = new URL(`../test-results/functional-improvements/${engine}/`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await { chromium, firefox, webkit }[engine].launch(
  engine === 'chromium' ? { channel: 'msedge' } : {},
);
const errors = [];
const sent = [];
const results = [];
async function setup(description = richText('AlphaBeta'), type = 'experience', responseDelay = 0) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/ai/generate', async (route) => {
    const request = route.request().postDataJSON();
    sent.push({ operation: request.operation, text: request.text });
    if (responseDelay) await new Promise((resolve) => setTimeout(resolve, responseDelay));
    await route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ delta: request.text })}\n\ndata: {"done":true}\n\n`,
    });
  });
  await page.goto(baseURL);
  await page.waitForSelector('.preview-panel .resume-document');
  const document = createDocument();
  document.profile.name = 'Functional audit';
  const section = createSection(type);
  const entry = createEntry(type);
  entry.title = 'Example entry';
  entry.description = description;
  if (type === 'education') {
    entry.degree = 'MSc';
    entry.gpa = '3.9/4.0';
  }
  section.items = [entry];
  document.sections = [section];
  await page.evaluate(async (document) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    useWorkspace.getState().add(document);
    const { useAISettings } = await import('/src/ai/settings.ts');
    const settings = structuredClone(useAISettings.getState().settings);
    settings.providers.openai = {
      ...settings.providers.openai,
      apiKey: 'SYNTHETIC_AUDIT',
      endpoint: 'https://synthetic.example.test/v1',
      models: [{ id: 'audit-model', name: 'Audit model', vision: false }],
    };
    settings.text = { provider: 'openai', model: 'audit-model' };
    useAISettings.getState().update(settings);
  }, document);
  const card = page.locator(`#entry-${entry.id}`);
  await card.waitFor({ timeout: 5000 }).catch(async (error) => {
    console.log(
      JSON.stringify(
        {
          phase: 'setup',
          engine,
          expected: entry.id,
          state: await page.evaluate(async () => {
            const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
            const state = useWorkspace.getState();
            return {
              activeId: state.activeId,
              ready: state.ready,
              ids: Object.keys(state.documents),
              dom: document.body.innerText.slice(0, 500),
            };
          }),
          errors,
        },
        null,
        2,
      ),
    );
    throw error;
  });
  await card.evaluate((element) => {
    for (let node = element; node; node = node.parentElement)
      if (node.tagName === 'DETAILS') node.open = true;
  });
  return { page, card, input: card.locator('.rich-input'), entryId: entry.id };
}
async function current(page) {
  return page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const state = useWorkspace.getState();
    return state.documents[state.activeId];
  });
}
async function applyEcho(page, card) {
  await card.getByRole('button', { name: 'AI 润色', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '生成建议', exact: true }).click();
  await dialog.getByRole('button', { name: '应用修改', exact: true }).waitFor();
  const preview = await dialog.locator('.ai-structured-preview').innerText();
  await dialog
    .getByRole('button', { name: '应用修改', exact: true })
    .click({ timeout: 10000 })
    .catch(async (error) => {
      console.log(await dialog.innerText());
      throw error;
    });
  return preview;
}

try {
  const styledInput = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2, textAlign: 'center' },
        content: [{ type: 'text', text: 'Evidence heading' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'AlphaBeta',
            marks: [
              { type: 'underline' },
              { type: 'textStyle', attrs: { fontSize: '18px', color: '#123456' } },
            ],
          },
        ],
      },
    ],
  };
  const styled = await setup(styledInput);
  const original = (await current(styled.page)).sections[0].items[0].description;
  await applyEcho(styled.page, styled.card);
  assert.deepEqual((await current(styled.page)).sections[0].items[0].description, original);
  results.push('Unchanged AI application preserves all appearance');
  await styled.page.close();

  const rapid = await setup();
  await rapid.page.unroute('**/api/ai/generate');
  await rapid.page.route('**/api/ai/generate', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ delta: 'Improved <sub><s>Beta</s></sub>' })}\n\ndata: {"done":true}\n\n`,
    }),
  );
  await rapid.input.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.setStart(element.querySelector('p').firstChild, 5);
    range.setEnd(element.querySelector('p').firstChild, 9);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await rapid.card.getByRole('button', { name: '删除线', exact: true }).click();
  await rapid.card.locator('.rich-advanced > summary').filter({ hasText: '高级格式' }).click();
  await rapid.card.getByRole('button', { name: '下标', exact: true }).click();
  const before = (await current(rapid.page)).sections[0].items[0].description;
  await applyEcho(rapid.page, rapid.card);
  const applied = (await current(rapid.page)).sections[0].items[0].description;
  assert.equal(textContent(applied), 'Improved Beta');
  await rapid.page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.deepEqual((await current(rapid.page)).sections[0].items[0].description, before);
  await rapid.page.getByRole('button', { name: '重做', exact: true }).click();
  assert.deepEqual((await current(rapid.page)).sections[0].items[0].description, applied);
  results.push('Fast AI application creates an independent undo and redo step');
  await rapid.page.close();

  const table = await setup(richText(''));
  await table.input.click();
  const pasteInfo = await table.input.evaluate((element) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<table><tbody><tr><th>Skill</th><th>Level</th></tr><tr><td>TypeScript</td><td>Expert</td></tr></tbody></table>',
    );
    data.setData('text/plain', 'Skill\tLevel\nTypeScript\tExpert');
    const event = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    if (event.clipboardData?.getData('text/html') !== data.getData('text/html'))
      Object.defineProperty(event, 'clipboardData', { value: data });
    element.dispatchEvent(event);
    return {
      types: Array.from(data.types),
      html: data.getData('text/html'),
      eventHtml: event.clipboardData?.getData('text/html'),
      prevented: event.defaultPrevented,
    };
  });
  assert.ok(pasteInfo.prevented);
  await table.input
    .locator('table')
    .waitFor({ timeout: 5000 })
    .catch(async (error) => {
      console.log(
        JSON.stringify(
          {
            engine,
            html: await table.input.innerHTML(),
            stored: (await current(table.page)).sections[0].items[0].description,
            errors,
          },
          null,
          2,
        ),
      );
      throw error;
    });
  assert.equal(await table.input.locator('tr').count(), 2);
  assert.equal(await table.input.locator('td,th').count(), 4);
  const stored = (await current(table.page)).sections[0].items[0].description;
  assert.equal(stored.content.find((n) => n.type === 'table').content.length, 2);
  await table.card.locator('.rich-advanced > summary').filter({ hasText: '表格编辑' }).click();
  await table.input.locator('td').last().click();
  await table.card.getByRole('button', { name: '下方插入行', exact: true }).click();
  assert.equal(await table.input.locator('tr').count(), 3);
  await table.card.getByLabel('单元格底色', { exact: true }).selectOption('#ebe3f6');
  assert.ok(
    JSON.stringify((await current(table.page)).sections[0].items[0].description).includes(
      '#ebe3f6',
    ),
  );
  await table.card.getByRole('button', { name: '右侧插入列', exact: true }).click();
  assert.equal(await table.input.locator('tr').first().locator('td,th').count(), 3);
  await table.input.locator('tr').last().locator('td,th').last().click();
  await table.card.getByRole('button', { name: '删除列', exact: true }).click();
  assert.equal(await table.input.locator('tr').first().locator('td,th').count(), 2);
  await table.page.screenshot({ path: fileURLToPath(new URL('table-editor.png', output)) });
  const html = await table.page.evaluate(async () => {
    const { buildPrintHtml } = await import('/src/resume/htmlExport.ts');
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const state = useWorkspace.getState();
    return buildPrintHtml(state.documents[state.activeId]);
  });
  assert.ok(html.includes('<table'));
  assert.ok(html.includes('TypeScript'));
  assert.ok(html.includes('Expert'));
  results.push('Table paste, row/column operations, cell shading and print HTML retain structure');
  await table.page.close();
  assert.deepEqual(errors, []);
  await writeFile(new URL('results.json', output), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ engine, results, errors }, null, 2));
} finally {
  await browser.close();
}
