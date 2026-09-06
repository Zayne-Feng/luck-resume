import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium, firefox, webkit } from 'playwright';

const base = process.env.LUCK_REPAIR_URL || 'http://127.0.0.1:5250';
const engine = process.env.LUCK_REPAIR_ENGINE || 'chromium';
let server;
try {
  await fetch(base);
} catch {
  server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5250', '--strictPort'],
    { windowsHide: true, stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(base);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
let browser;
try {
  browser = await { chromium, firefox, webkit }[engine].launch(
    engine === 'chromium' && process.platform === 'win32' ? { channel: 'msedge' } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const sent = [];
  await page.route('**/api/ai/generate', (route) => {
    const request = route.request().postDataJSON();
    sent.push(request.text);
    return route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ delta: request.text })}\n\ndata: {"done":true}\n\n`,
    });
  });
  await page.goto(base);
  await page.waitForSelector('.preview-panel .resume-document');
  const ids = await page.evaluate(async () => {
    const { createDocument, createSection, createEntry } = await import('/src/resume/model.ts');
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const { useAISettings } = await import('/src/ai/settings.ts');
    const document = createDocument(),
      section = createSection('experience'),
      entry = createEntry();
    entry.title = 'Snapshot fixture';
    entry.description = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [
            {
              type: 'text',
              text: 'Original wording',
              marks: [{ type: 'textStyle', attrs: { color: '#123456', fontSize: '18px' } }],
            },
          ],
        },
      ],
    };
    section.items = [entry];
    document.sections = [section];
    useWorkspace.getState().add(document);
    const settings = structuredClone(useAISettings.getState().settings);
    settings.providers.openai = {
      ...settings.providers.openai,
      apiKey: 'SYNTHETIC',
      endpoint: 'https://synthetic.invalid/v1',
      models: [{ id: 'audit', name: 'Audit', vision: false }],
    };
    settings.text = { provider: 'openai', model: 'audit' };
    useAISettings.getState().update(settings);
    return { document: document.id, section: section.id, entry: entry.id };
  });
  const card = page.locator(`#entry-${ids.entry}`);
  await card.getByRole('button', { name: 'AI 润色', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '生成建议', exact: true }).click();
  await dialog.getByLabel('修改建议', { exact: true }).waitFor();
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    useWorkspace.getState().update((doc) => {
      doc.sections[0].items[0].description = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Concurrent wording',
                marks: [{ type: 'textStyle', attrs: { color: '#654321', fontSize: '24px' } }],
              },
            ],
          },
        ],
      };
    });
  });
  await dialog.getByText('原文已变化，请重新生成。', { exact: true }).waitFor();
  const original = dialog.locator('.ai-comparison > div').first();
  assert.ok((await original.innerText()).includes('Original wording'));
  assert.ok(!(await original.innerText()).includes('Concurrent wording'));
  assert.equal(await original.locator('[data-text-color]').count(), 0);
  const originalStyle = await original
    .locator('.resume-rich span')
    .evaluate((element) => ({ color: element.style.color, size: element.style.fontSize }));
  assert.deepEqual(originalStyle, { color: 'rgb(18, 52, 86)', size: '18px' });
  const previewStyle = await dialog
    .locator('.ai-structured-preview .resume-rich span')
    .evaluate((element) => ({ color: element.style.color, size: element.style.fontSize }));
  assert.deepEqual(previewStyle, originalStyle);
  assert.equal(
    await dialog.getByRole('button', { name: '应用修改', exact: true }).isDisabled(),
    true,
  );
  await dialog.getByRole('button', { name: '重新生成', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('.ai-comparison > div')?.textContent.includes('Concurrent wording'),
  );
  await dialog.getByRole('button', { name: '应用修改', exact: true }).click();
  assert.equal(sent.length, 2);
  assert.deepEqual(errors, []);
  console.log(
    'PASS frozen rich source and preview, stale apply protection and explicit regeneration',
  );
} finally {
  await browser?.close();
  server?.kill();
}
