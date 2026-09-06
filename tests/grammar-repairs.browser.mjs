import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDocument, createEntry, createSection } from '../src/resume/model.ts';
import { grammarFields } from '../src/ai/grammar.ts';

const baseURL = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5251';
const output = new URL('../.cache/repair-grammar/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  headless: true,
});
const results = [];
const errors = [];
let suggestions = [];
let sentText = '';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/ai/generate', (route) => {
    sentText = route.request().postDataJSON().text;
    const text = JSON.stringify({ suggestions });
    return route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ delta: text })}\n\ndata: {"done":true}\n\n`,
    });
  });
  await page.goto(baseURL);
  await page.waitForSelector('.preview-panel .resume-document');
  const setup = async (document) => {
    await page.evaluate(async (document) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      useWorkspace.getState().add(document);
      const { useAISettings } = await import('/src/ai/settings.ts');
      const settings = structuredClone(useAISettings.getState().settings);
      settings.providers.openai = {
        ...settings.providers.openai,
        apiKey: 'SYNTHETIC_TEST',
        endpoint: 'https://synthetic.invalid/v1',
        models: [{ id: 'test', name: 'Test', vision: false }],
      };
      settings.text = { provider: 'openai', model: 'test' };
      useAISettings.getState().update(settings);
    }, document);
  };
  const run = async () => {
    await page.getByRole('button', { name: '检查一下', exact: true }).click();
    await page.getByRole('button', { name: '开始语法检查', exact: true }).click();
    await page.waitForSelector('.review-issues li');
  };
  const accept = (reason) =>
    page
      .locator('.review-issues li')
      .filter({ hasText: reason })
      .getByRole('button', { name: '接受', exact: true })
      .click();
  const snapshot = () =>
    page.evaluate(async () => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      const state = useWorkspace.getState();
      return state.documents[state.activeId];
    });
  const fixture = () => {
    const document = createDocument();
    document.profile.name = 'Grammar fixture';
    const section = createSection('experience');
    const entry = createEntry();
    entry.title = 'Editable entry';
    section.items = [entry];
    document.sections = [section];
    return { document, section, entry };
  };
  const suggestion = (field, original, replacement, reason) => ({
    original,
    replacement,
    reason,
    start: field.start + field.text.indexOf(original),
  });

  const deletion = fixture();
  deletion.entry.description = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'redundant', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' useful text' },
        ],
      },
    ],
  };
  suggestions = [
    suggestion(
      grammarFields(deletion.document).find((field) => field.field === 'description'),
      'redundant',
      '',
      'Delete redundant text',
    ),
  ];
  await setup(deletion.document);
  await run();
  await accept('Delete redundant text');
  await page.getByRole('button', { name: '写内容', exact: true }).click();
  const editor = page.locator(`#entry-${deletion.entry.id} .rich-input`);
  await editor.waitFor();
  assert.equal(await editor.innerText(), ' useful text');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await page.waitForFunction(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const state = useWorkspace.getState();
    return JSON.stringify(state.documents[state.activeId]).includes('useful text edited');
  });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal(await editor.innerText(), ' useful text');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal(await editor.innerText(), 'redundant useful text');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  assert.equal(await editor.innerText(), ' useful text');
  await page.waitForFunction(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const state = useWorkspace.getState();
    return state.statuses[state.activeId] === 'saved';
  });
  await page.reload();
  await page.waitForSelector(`#entry-${deletion.entry.id} .rich-input`);
  assert.equal(
    await page.locator(`#entry-${deletion.entry.id} .rich-input`).innerText(),
    ' useful text',
  );
  await page.screenshot({ path: fileURLToPath(new URL('deletion-reloaded.png', output)) });
  results.push({ case: 'deletion-editor-history-reload', passed: true });

  const metadata = fixture();
  metadata.document.profile.name = 'Repeated wording';
  metadata.entry.location = 'Repeated wording';
  metadata.entry.subtitle = 'Engineer';
  metadata.entry.degree = 'Degree sentinel';
  metadata.entry.gpa = 'GPA sentinel';
  metadata.entry.publication = {
    authors: 'Authors sentinel',
    highlightedAuthor: '',
    venue: 'Venue sentinel',
    status: 'none',
    citationStyle: 'plain',
  };
  metadata.entry.fieldLabels = { title: 'Shared label typo', subtitle: 'Shared label typo' };
  metadata.document.profile.employmentStatus = 'Status sentinel';
  metadata.document.profile.location = 'City sentinel';
  const fields = grammarFields(metadata.document);
  suggestions = [
    suggestion(
      fields.find((field) => field.entryId === metadata.entry.id && field.field === 'location'),
      'Repeated wording',
      'Correct location',
      'Correct entry location',
    ),
    suggestion(
      fields.find((field) => field.labelKey === 'title'),
      'Shared label typo',
      'Title label fixed',
      'Correct title label',
    ),
    suggestion(
      fields.find((field) => field.labelKey === 'subtitle'),
      'Shared label typo',
      'Subtitle label fixed',
      'Correct subtitle label',
    ),
    suggestion(
      fields.find((field) => field.field === 'employmentStatus'),
      'Status sentinel',
      'Changed status',
      'Reject hidden status',
    ),
  ];
  await setup(metadata.document);
  await run();
  for (const value of [
    'Repeated wording',
    'Degree sentinel',
    'GPA sentinel',
    'Authors sentinel',
    'Venue sentinel',
    'Status sentinel',
    'City sentinel',
  ])
    assert.ok(sentText.includes(value), value);
  await accept('Correct entry location');
  await accept('Correct title label');
  await accept('Correct subtitle label');
  let current = await snapshot();
  assert.equal(current.profile.name, 'Repeated wording');
  assert.equal(current.sections[0].items[0].location, 'Correct location');
  assert.deepEqual(current.sections[0].items[0].fieldLabels, {
    title: 'Title label fixed',
    subtitle: 'Subtitle label fixed',
  });
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    useWorkspace.getState().update((next) => {
      next.profile.hiddenFields = ['employmentStatus'];
    });
  });
  await accept('Reject hidden status');
  assert.ok(
    (
      await page
        .locator('.review-issues li')
        .filter({ hasText: 'Reject hidden status' })
        .innerText()
    ).includes('原文已变化'),
  );
  assert.equal((await snapshot()).profile.employmentStatus, 'Status sentinel');
  results.push({ case: 'metadata-request-duplicates-label-identities-hidden-guard', passed: true });

  const table = fixture();
  const cell = (text) => ({
    type: 'tableCell',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  table.entry.description = {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('Skill'), cell('Level')] },
          { type: 'tableRow', content: [cell('TypeScript'), cell('Expert')] },
        ],
      },
    ],
  };
  const tableField = grammarFields(table.document).find((field) => field.field === 'description');
  suggestions = [
    suggestion(tableField, 'Skill\tLevel', 'Competency', 'Reject cross cell'),
    suggestion(tableField, 'Expert', 'Advanced', 'Correct within cell'),
  ];
  await setup(table.document);
  await run();
  assert.ok(sentText.includes('Skill\tLevel\nTypeScript\tExpert'));
  await accept('Reject cross cell');
  assert.deepEqual((await snapshot()).sections[0].items[0].description, table.entry.description);
  await accept('Correct within cell');
  await page.getByRole('button', { name: '写内容', exact: true }).click();
  assert.equal(
    await page.locator(`#entry-${table.entry.id} .rich-input td`).nth(3).innerText(),
    'Advanced',
  );
  assert.equal(
    await page.locator(`#entry-${table.entry.id} .rich-input td`).nth(1).innerText(),
    'Level',
  );
  results.push({
    case: 'table-request-boundaries-cross-cell-rejection-within-cell-edit',
    passed: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(new URL('results.json', output), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
}
