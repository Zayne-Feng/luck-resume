import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { createDocument, createEntry, createSection, richText } from '../src/resume/model.ts';

const base = process.env.LUCK_ADVANCED_URL || 'http://127.0.0.1:5202';
const engineName = process.env.LUCK_ADVANCED_ENGINE || 'chromium';
const engine = { chromium, firefox, webkit }[engineName];
if (!engine) throw new Error('Unsupported browser engine.');
const output = new URL('../test-results/advanced-editor/', import.meta.url);
let server;
let browser;
await mkdir(output, { recursive: true });
try {
  try {
    await fetch(base, { signal: AbortSignal.timeout(1000) });
  } catch {
    server = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
        '--host',
        '127.0.0.1',
        '--port',
        '5202',
        '--strictPort',
      ],
      {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        windowsHide: true,
        stdio: 'ignore',
      },
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await fetch(base, { signal: AbortSignal.timeout(500) });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  browser = await engine.launch(
    engineName === 'chromium' && process.platform === 'win32' ? { channel: 'msedge' } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.waitForSelector('.preview-panel .resume-document');
  const fixture = createDocument();
  fixture.profile.name = 'Advanced editor';
  const section = createSection('experience');
  const entry = createEntry();
  entry.title = 'Operations';
  entry.description = richText('Advanced result');
  section.items = [entry];
  fixture.sections = [section];
  await page.evaluate(async (document) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    useWorkspace.getState().add(document);
  }, fixture);
  const container = page.locator(`#entry-${entry.id}`);
  await container.evaluate((element) => {
    for (let current = element; current; current = current.parentElement)
      if (current.tagName === 'DETAILS') current.open = true;
  });
  const input = container.locator('.rich-input');
  await input.click();
  await page.keyboard.press('Control+a');
  await container.locator('.rich-advanced > summary').filter({ hasText: '高级格式' }).click();
  const structure = container.getByLabel('文本结构', { exact: true });
  await structure.selectOption('2');
  await input.locator('h2').waitFor();
  await container.getByRole('button', { name: '引用块', exact: true }).click();
  await input.locator('blockquote h2').waitFor();
  await container.getByRole('button', { name: '引用块', exact: true }).click();
  await container.getByRole('button', { name: '行内代码', exact: true }).click();
  assert.equal(await input.locator('code').textContent(), 'Advanced result');
  await container.getByRole('button', { name: '行内代码', exact: true }).click();
  await container.getByRole('button', { name: '上标', exact: true }).click();
  await input.locator('sup').waitFor();
  await container.getByRole('button', { name: '下标', exact: true }).click();
  await input.locator('sub').waitFor();
  assert.equal(await input.locator('sup').count(), 0);
  await structure.selectOption('codeBlock');
  await input.locator('pre code').waitFor();
  await input.locator('pre code').click();
  await container.getByLabel('代码语言', { exact: true }).fill('typescript');
  await input.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('const value = 42;');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('console.log(value);');
  assert.equal(
    await input.locator('pre code').textContent(),
    'const value = 42;\nconsole.log(value);',
  );
  const stored = await page.evaluate(
    async ({ sectionId, entryId }) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      const state = useWorkspace.getState();
      return state.documents[state.activeId].sections
        .find((item) => item.id === sectionId)
        .items.find((item) => item.id === entryId).description;
    },
    { sectionId: section.id, entryId: entry.id },
  );
  const findCode = (node) =>
    node.type === 'codeBlock' ? node : node.content?.map(findCode).find(Boolean);
  assert.equal(findCode(stored)?.attrs?.language, 'typescript');
  await structure.selectOption('paragraph');
  await input.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('https://example.com');
  await page.keyboard.press('Space');
  await input.locator('a[href="https://example.com"]').waitFor();
  await input.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('Selected portfolio');
  await page.keyboard.press('Control+a');
  await input.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', 'https://example.org/portfolio');
    const event = new ClipboardEvent('paste', {
      clipboardData: clipboard,
      bubbles: true,
      cancelable: true,
    });
    if (event.clipboardData?.getData('text/plain') !== 'https://example.org/portfolio')
      Object.defineProperty(event, 'clipboardData', { value: clipboard });
    element.dispatchEvent(event);
  });
  assert.equal(
    await input.locator('a[href="https://example.org/portfolio"]').textContent(),
    'Selected portfolio',
  );
  await container.getByLabel('选区字号', { exact: true }).selectOption('48px');
  await page.keyboard.insertText('Large');
  await input.locator('span[style*="48px"]').waitFor();
  await container.getByRole('button', { name: '分隔线', exact: true }).click();
  await input.locator('hr').waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('toolbar.png', output)) });
  assert.deepEqual(errors, []);
  const results = {
    passed: [
      'heading',
      'blockquote',
      'inline code',
      'superscript/subscript exclusion',
      'code block language',
      'typed autolink',
      'paste destination onto selected label',
      '48px selection',
      'horizontal rule',
    ],
    errors,
  };
  await writeFile(new URL('results.json', output), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  server?.kill();
}
