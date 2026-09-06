import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5215';
const browser = await chromium.launch({
  channel:
    process.env.LUCK_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const external = [];
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (request.url().startsWith('http') && !request.url().startsWith(baseURL))
    external.push(request.url());
});
const source = {
  id: 'foreign-a',
  title: 'Converted A',
  templateId: 'classic',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  basic: {
    name: 'Ada',
    title: 'Engineer',
    email: 'ada@example.com',
    birthDate: '1994-06',
    customFields: [],
    photo: '',
    fieldOrder: [],
  },
  experience: [
    {
      id: 'e',
      company: 'Original Co',
      position: 'Engineer',
      date: '2020-01 - present',
      details:
        '<script>window.referenceUnsafe = true</script><h2 style="text-align:center">Achievements</h2><p><strong>Bold <em>both</em></strong> <u>under</u><s>strike</s><sub>sub</sub><sup>sup</sup><span style="font-size:18px;color:#123456;background-color:#aabbcc">color</span><a href="https://example.com">safe</a><a href="javascript:alert(1)">unsafe</a><img src="data:image/png;base64,YQ==" alt="Chart"><img src="https://remote.example/never.png"></p><ol start="3"><li>One</li><li>Two</li></ol><blockquote><p>Quote</p></blockquote><pre><code>const a = 1;</code></pre><table><tr><td>A</td><td><b>B</b></td></tr><tr><td>C</td><td>D</td></tr></table><p onclick="alert(1)" style="font-family:Alien">Tail</p>',
    },
  ],
  projects: [],
  education: [],
  certificates: [],
  customData: {},
  skillContent: '<ul><li>TypeScript</li></ul>',
  selfEvaluationContent: '<p>Summary</p>',
  menuSections: [
    { id: 'experience', title: 'Work', enabled: false, order: 1 },
    { id: 'skills', title: 'Skills', enabled: true, order: 2 },
  ],
  globalSettings: {},
};
try {
  await page.route('**/reference-import-test.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Reference conversion test</title>',
    }),
  );
  await page.goto(`${baseURL}/reference-import-test.html`);
  const converted = await page.evaluate(async (source) => {
    const { parseReferenceImport } = await import('/src/resume/referenceImport.ts');
    const { textContent } = await import('/src/resume/model.ts');
    const result = parseReferenceImport(JSON.stringify(source));
    const candidate = result.candidates[0];
    if (candidate.error) throw new Error(candidate.error);
    return {
      result,
      text: textContent(candidate.document.sections[0].items[0].description),
      unsafe: window.referenceUnsafe,
    };
  }, source);
  const candidate = converted.result.candidates[0];
  const work = candidate.document.sections[0];
  assert.equal(work.visible, false);
  assert.equal(work.items.length, 2);
  assert.equal(work.items[1].image, 'data:image/png;base64,YQ==');
  assert.equal(work.items[1].visible, true);
  assert.equal(converted.unsafe, undefined);
  assert.ok(!converted.text.includes('window.referenceUnsafe'));
  for (const word of [
    'Achievements',
    'Bold',
    'both',
    'under',
    'strike',
    'sub',
    'sup',
    'color',
    'safe',
    'unsafe',
    'Chart',
    'One',
    'Two',
    'Quote',
    'const a = 1;',
    'A',
    'B',
    'C',
    'D',
    'Tail',
  ])
    assert.ok(converted.text.includes(word), word);
  const nodes = [];
  const walk = (node) => {
    nodes.push(node);
    for (const child of node.content ?? []) walk(child);
  };
  walk(work.items[0].description);
  assert.deepEqual(nodes.find((node) => node.type === 'heading').attrs, {
    level: 2,
    textAlign: 'center',
  });
  assert.equal(
    nodes
      .find((node) => node.text === 'both')
      .marks.filter((mark) => ['bold', 'italic'].includes(mark.type)).length,
    2,
  );
  for (const type of ['underline', 'strike', 'subscript', 'superscript', 'textStyle', 'highlight'])
    assert.ok(
      nodes.some((node) => node.marks?.some((mark) => mark.type === type)),
      type,
    );
  assert.ok(nodes.some((node) => node.type === 'orderedList' && node.attrs.start === 3));
  assert.ok(nodes.some((node) => node.type === 'blockquote'));
  assert.ok(nodes.some((node) => node.type === 'codeBlock'));
  assert.ok(
    !nodes.some((node) => node.marks?.some((mark) => mark.attrs?.href?.startsWith('javascript:'))),
  );
  const nativeTable = nodes.find((node) => node.type === 'table');
  assert.ok(nativeTable);
  assert.equal(nativeTable.content.length, 2);
  assert.equal(nativeTable.content[0].content[1].content[0].content[0].marks[0].type, 'bold');
  assert.ok(!candidate.notes.some((note) => note.code === 'table'));
  for (const code of ['html', 'link', 'media', 'style'])
    assert.ok(
      candidate.notes.some((note) => note.code === code),
      code,
    );
  assert.equal(external.length, 0);
  console.log(
    'PASS: HTML rich marks, headings, lists, quotes, code, native tables, embedded images and unsafe content review',
  );

  const tableProbe = await page.evaluate(async (source) => {
    const { parseReferenceImport } = await import('/src/resume/referenceImport.ts');
    const convert = (details) =>
      parseReferenceImport(
        JSON.stringify({ ...source, experience: [{ ...source.experience[0], details }] }),
      ).candidates[0];
    return {
      supported: convert(
        '<table><tr><th colspan="2" style="background-color:#aabbcc;text-align:right">Header</th></tr><tr><td data-colwidth="140">A</td><td><u>B</u></td></tr></table>',
      ),
      fallback: convert(
        '<table><tr><td rowspan="3">Fallback A</td><td>Fallback B</td></tr></table>',
      ),
    };
  }, source);
  assert.equal(tableProbe.supported.error, undefined);
  const table = tableProbe.supported.document.sections[0].items[0].description.content[0];
  assert.equal(table.type, 'table');
  assert.equal(table.content[0].content[0].type, 'tableHeader');
  assert.equal(table.content[0].content[0].attrs.colspan, 2);
  assert.equal(table.content[0].content[0].attrs.backgroundColor, '#aabbcc');
  assert.equal(table.content[0].content[0].content[0].attrs.textAlign, 'right');
  assert.deepEqual(table.content[1].content[0].attrs.colwidth, [140]);
  assert.equal(tableProbe.fallback.error, undefined);
  assert.ok(tableProbe.fallback.notes.some((note) => note.code === 'table'));
  assert.ok(JSON.stringify(tableProbe.fallback.document).includes('Fallback A'));
  assert.ok(JSON.stringify(tableProbe.fallback.document).includes('Fallback B'));
  console.log(
    'PASS: native table headers, merged cells, widths, shading, alignment and explicit invalid-grid fallback',
  );

  await page.goto(baseURL);
  await page.getByLabel('姓名', { exact: true }).waitFor();
  await page.waitForFunction(async () => {
    const { loadDocuments } = await import('/src/storage/database.ts');
    return (await loadDocuments()).documents.length > 0;
  });
  const baseline = await page.evaluate(async () => {
    const { loadDocuments } = await import('/src/storage/database.ts');
    return (await loadDocuments()).documents.length;
  });
  await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
  const panel = page.getByRole('region', { name: '转换参考简历与浏览器草稿' });
  await panel.getByLabel('参考 JSON 内容', { exact: true }).fill(
    JSON.stringify({
      state: {
        resumes: {
          a: source,
          b: { ...source, id: 'foreign-b', title: 'Converted B' },
          bad: { basic: { name: 5 } },
        },
      },
      version: 0,
    }),
  );
  await panel.getByRole('button', { name: '预览参考转换', exact: true }).click();
  assert.equal(await panel.getByText('此文档无法转换：', { exact: false }).count(), 1);
  const create = panel.getByRole('button', { name: '创建所选本地简历 (2)', exact: true });
  assert.equal(await create.isDisabled(), true);
  assert.equal(
    await page.evaluate(async () => {
      const { loadDocuments } = await import('/src/storage/database.ts');
      return (await loadDocuments()).documents.length;
    }),
    baseline,
  );
  await panel.getByLabel('已复核所选简历及转换说明', { exact: true }).check();
  assert.equal(await create.isEnabled(), true);
  await panel.getByLabel('Converted B', { exact: true }).uncheck();
  assert.equal(
    await panel.getByLabel('已复核所选简历及转换说明', { exact: true }).isChecked(),
    false,
  );
  await panel.getByLabel('Converted B', { exact: true }).check();
  await panel.getByLabel('已复核所选简历及转换说明', { exact: true }).check();
  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: '下载转换报告', exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'reference-conversion-report.json');
  await create.click();
  await page.waitForFunction(async (baseline) => {
    const { loadDocuments } = await import('/src/storage/database.ts');
    return (await loadDocuments()).documents.length === baseline + 2;
  }, baseline);
  await page.reload();
  await page.getByLabel('姓名', { exact: true }).waitFor();
  const persisted = await page.evaluate(async () => {
    const { loadDocuments } = await import('/src/storage/database.ts');
    return (await loadDocuments()).documents
      .map((row) => row.document)
      .filter((document) => document.title.startsWith('Converted '));
  });
  assert.equal(persisted.length, 2);
  assert.ok(persisted.every((document) => !document.id.startsWith('foreign')));
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(external.length, 0, external.join('\n'));
  console.log(
    'PASS: review gating, batch selection, failed candidate isolation, report download, new local document creation and reload persistence',
  );
} finally {
  await context.close();
  await browser.close();
}
