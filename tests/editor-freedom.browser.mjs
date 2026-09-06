import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  createDocument,
  createEntry,
  createSection,
  createField,
  templateIds,
} from '../src/resume/model.ts';

const base = process.env.LUCK_FREEDOM_URL || 'http://127.0.0.1:5199';
const output = new URL('../test-results/editor-freedom/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
const results = [];
const errors = [];
const requests = [];
const semanticFixture = {
  title: 'Semantic fields fixture',
  profile: { name: 'Semantic Student' },
  sections: [
    {
      type: 'education',
      title: 'Education',
      items: [
        {
          title: 'Semantic University',
          subtitle: 'Computer Science',
          degree: 'Master of Science',
          gpa: '3.8 / 4.0',
          link: 'example.org/research',
          linkLabel: 'Research profile',
          description: 'Independent study',
        },
      ],
    },
  ],
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  page.setDefaultTimeout(25000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/ai/generate', async (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    const text =
      request.operation === 'semantic'
        ? JSON.stringify(semanticFixture)
        : '- **Improved result** with [proof](https://example.com)';
    await route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ delta: text })}\n\ndata: {"done":true}\n\n`,
    });
  });
  await page.goto(base);
  await page.waitForSelector('.preview-panel .resume-document');
  const document = createDocument();
  document.profile.name = 'Structured fixture';
  const contact = createField('Portfolio', 'link');
  Object.assign(contact, { value: 'example.org', showLabel: false });
  document.profile.customFields = [contact];
  const section = createSection('education');
  const entry = createEntry();
  entry.title = 'Fixture University';
  entry.description = {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Original result', marks: [{ type: 'bold' }] }],
              },
            ],
          },
        ],
      },
    ],
  };
  section.items = [entry];
  document.sections = [section];
  await page.evaluate(async (fixture) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    useWorkspace.getState().add(fixture);
    const { useAISettings } = await import('/src/ai/settings.ts');
    const settings = structuredClone(useAISettings.getState().settings);
    settings.providers.openai = {
      ...settings.providers.openai,
      apiKey: 'SYNTHETIC_FREEDOM_KEY',
      endpoint: 'https://synthetic.example.test/v1',
      models: [{ id: 'fixture', name: 'Fixture', vision: true }],
    };
    settings.text = { provider: 'openai', model: 'fixture' };
    useAISettings.getState().update(settings);
  }, document);
  const editor = page.locator(`#entry-${entry.id}`);
  await editor.evaluate((element) => {
    for (let current = element; current; current = current.parentElement)
      if (current.tagName === 'DETAILS') current.open = true;
  });
  await editor.locator('.rich-input').waitFor();
  await editor.getByRole('button', { name: 'AI 润色', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '生成建议', exact: true }).click();
  await dialog.getByLabel('修改建议', { exact: true }).waitFor();
  assert.match(requests[0].text, /- \*\*Original result\*\*/);
  await dialog.getByRole('button', { name: '应用修改', exact: true }).click();
  await editor.locator('.rich-input li strong').waitFor();
  assert.equal(await editor.locator('.rich-input li strong').textContent(), 'Improved result');
  assert.equal(await editor.locator('.rich-input a').getAttribute('href'), 'https://example.com/');
  results.push('G10: polish sends Markdown and applies structured lists, bold and links');

  await editor.getByRole('button', { name: 'AI 润色', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '生成建议', exact: true }).click();
  await dialog.getByLabel('修改建议', { exact: true }).waitFor();
  await page.evaluate(
    async ({ sectionId, entryId }) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      useWorkspace.getState().update((document) => {
        const entry = document.sections
          .find((section) => section.id === sectionId)
          .items.find((entry) => entry.id === entryId);
        const visit = (node) => {
          if (node.type === 'text') node.marks = [...(node.marks || []), { type: 'italic' }];
          node.content?.forEach(visit);
        };
        visit(entry.description);
      });
    },
    { sectionId: section.id, entryId: entry.id },
  );
  assert.equal(
    await dialog.getByRole('button', { name: '应用修改', exact: true }).isDisabled(),
    true,
  );
  await dialog.getByText('原文已变化，请重新生成。', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  results.push('G10: formatting-only concurrent edits block stale AI application');

  const profile = page.locator('.profile-module');
  await profile.evaluate((element) => {
    element.open = true;
  });
  await profile
    .getByLabel('求职状态', { exact: true })
    .fill('Available for research collaboration');
  await page.waitForFunction(() =>
    document
      .querySelector('.pagination-source .resume-contacts')
      ?.textContent.includes('Available for research collaboration'),
  );
  results.push('G04: arbitrary employment status is editable and rendered');
  await editor.getByLabel('学历 / 学位', { exact: true }).fill('Doctorate');
  await editor.getByLabel('GPA', { exact: true }).fill('3.95 / 4.0');
  await page.waitForFunction(() => {
    const text = document.querySelector('.pagination-source .resume-body')?.textContent || '';
    return text.includes('Doctorate') && text.includes('3.95 / 4.0');
  });
  results.push('G05: degree and GPA have independent controls and metadata rendering');

  const advanced = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Advanced heading' }],
      },
      {
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted insight' }] }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'x', marks: [{ type: 'code' }] },
          { type: 'text', text: '2', marks: [{ type: 'superscript' }] },
          { type: 'text', text: 'n', marks: [{ type: 'subscript' }] },
        ],
      },
      {
        type: 'codeBlock',
        attrs: { language: 'typescript' },
        content: [{ type: 'text', text: 'const value = 42;\nconsole.log(value);' }],
      },
      { type: 'horizontalRule' },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Fifteen pixels',
            marks: [{ type: 'textStyle', attrs: { fontSize: '15px' } }],
          },
        ],
      },
    ],
  };
  await page.evaluate(
    async ({ sectionId, entryId, description }) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      useWorkspace.getState().update((document) => {
        document.sections
          .find((s) => s.id === sectionId)
          .items.find((e) => e.id === entryId).description = description;
      });
    },
    { sectionId: section.id, entryId: entry.id, description: advanced },
  );
  const printed = page.locator('.pagination-source .resume-rich');
  await printed.locator('blockquote').waitFor({ state: 'attached' });
  assert.equal(
    await printed.locator('pre code').textContent(),
    'const value = 42;\nconsole.log(value);',
  );
  assert.equal(await printed.locator('sup').textContent(), '2');
  assert.equal(await printed.locator('sub').textContent(), 'n');
  assert.equal(await printed.locator('hr').count(), 1);
  assert.equal(
    await printed
      .locator('span')
      .filter({ hasText: 'Fifteen pixels' })
      .evaluate((element) => getComputedStyle(element).fontSize),
    '15px',
  );
  const portable = await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const { serializeResume, parseResumeFile } = await import('/src/resume/files.ts');
    const { serializeMarkdown, parseTextImport } = await import('/src/resume/transfer.ts');
    const state = useWorkspace.getState();
    const source = state.documents[state.activeId];
    return {
      json: parseResumeFile(serializeResume(source)),
      markdown: parseTextImport(serializeMarkdown(source)).document,
    };
  });
  assert.deepEqual(portable.json.sections[0].items[0].description, advanced);
  assert.deepEqual(portable.markdown.sections[0].items[0].description, advanced);
  results.push(
    'G01/G03: advanced blocks, code, super/subscript and 15px survive rendering and portable formats',
  );
  await page.screenshot({
    path: new URL('advanced-editor.png', output).pathname.replace(/^\/(\w:)/, '$1'),
  });

  const input = editor.locator('.rich-input');
  await input.click();
  await input.press('ControlOrMeta+a');
  await input.pressSequentially('https://example.org ');
  await input.locator('a').waitFor();
  assert.equal(new URL(await input.locator('a').getAttribute('href')).href, 'https://example.org/');
  results.push('G02: typing a URL creates a usable rich-text link');
  const contacts = profile.locator('.custom-fields-editor');
  await contacts.evaluate((element) => {
    element.open = true;
  });
  await contacts.getByLabel('链接显示文字 1', { exact: true }).fill('Selected portfolio');
  await contacts.getByLabel('链接地址 1', { exact: true }).fill('10.1234/fixture');
  await page.waitForFunction(() => {
    const link = document.querySelector(
      '.pagination-source .resume-contacts a[href="https://doi.org/10.1234/fixture"]',
    );
    return link?.textContent === 'Selected portfolio';
  });
  results.push('G02/G08: editable contact display text hides destination and normalizes a DOI');

  await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
  const semantic = page.getByLabel('AI 语义导入', { exact: true });
  await semantic.getByLabel('Markdown 内容', { exact: true }).fill('# Synthetic source');
  await semantic.getByRole('button', { name: '分析并预览', exact: true }).click();
  await semantic.getByLabel('简历名称', { exact: true }).waitFor();
  assert.equal(
    await semantic.getByLabel('链接显示文字', { exact: true }).inputValue(),
    'Research profile',
  );
  await semantic.getByLabel('链接显示文字', { exact: true }).fill('Edited research profile');
  assert.equal(
    await semantic.getByLabel('学历 / 学位', { exact: true }).inputValue(),
    'Master of Science',
  );
  await semantic.getByLabel('已核对内容，创建为新简历', { exact: true }).check();
  await semantic.getByRole('button', { name: '创建新简历', exact: true }).click();
  await page.waitForFunction(() => {
    const link = document.querySelector('.pagination-source a.resume-entry-link');
    return (
      link?.textContent === 'Edited research profile' &&
      link.getAttribute('href') === 'https://example.org/research'
    );
  });
  results.push(
    'G09: semantic link labels and independent education fields are reviewed, edited and imported',
  );
  await page.evaluate(
    async ({ id, description }) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      useWorkspace.getState().select(id);
      useWorkspace.getState().update((document) => {
        document.sections[0].items[0].description = description;
      });
    },
    { id: document.id, description: advanced },
  );
  for (const template of templateIds) {
    await page.evaluate(async (template) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      useWorkspace.getState().update((document) => {
        document.appearance.template = template;
      });
    }, template);
    await page.waitForFunction(
      (template) =>
        document
          .querySelector('.pagination-source .resume-document')
          ?.classList.contains('template-' + template),
      template,
    );
    const html = await page.evaluate(async () => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      const { buildPrintHtml } = await import('/src/resume/htmlExport.ts');
      const state = useWorkspace.getState();
      return buildPrintHtml(state.documents[state.activeId]);
    });
    assert.ok(html.includes('<blockquote>') && html.includes('<sup>') && html.includes('<pre>'));
    const pdf = await page.request.post(base + '/api/pdf', { data: { html }, timeout: 90000 });
    assert.equal(
      pdf.status(),
      200,
      await pdf.text().then((text) => (text.startsWith('%PDF') ? 'PDF' : text)),
    );
    const bytes = await pdf.body();
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    await writeFile(new URL(`advanced-${template}.pdf`, output), bytes);
  }
  results.push(
    'Advanced structures export through selectable-text PDF in all nine original templates',
  );
  assert.deepEqual(errors, []);
  await writeFile(new URL('results.json', output), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
}
