import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge' });
const baseURL = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5252';
const results = [];
const sourceTable = '<table><tr><td>A</td></tr></table>';
const cases = [
  ['siblings', `${sourceTable}<p>After table</p>${sourceTable}`],
  ['list', '<table><tr><td><ul><li><h2>Heading item</h2></li></ul></td></tr></table>'],
  [
    'code',
    '<table><tr><td><pre><code class="language-typescript">const answer = 42;\n&amp;copy;</code></pre><p>Keep</p></td></tr></table>',
  ],
  [
    'style',
    '<table><tr><td><p><span style="font-size:18px"><span style="color:#123456">Styled</span></span></p></td></tr></table>',
  ],
];
try {
  for (const [name, response] of cases) {
    console.log(`Checking ${name}`);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const diagnostics = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(message.text());
    });
    page.on('requestfailed', (request) =>
      diagnostics.push(`${request.url()} ${request.failure()?.errorText}`),
    );
    await page.route('**/api/ai/generate', (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({ delta: response })}\n\ndata: {"done":true}\n\n`,
      }),
    );
    await page.goto(baseURL);
    await page.waitForSelector('.resume-document');
    const ids = await page.evaluate(async () => {
      const { createDocument, createSection, createEntry, richText } = await import(
        '/src/resume/model.ts'
      );
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      const { useAISettings } = await import('/src/ai/settings.ts');
      const document = createDocument();
      const section = createSection('experience');
      const entry = createEntry();
      entry.title = 'Interchange browser check';
      entry.description = richText('Original');
      section.items = [entry];
      document.sections = [section];
      useWorkspace.getState().add(document);
      const settings = structuredClone(useAISettings.getState().settings);
      settings.providers.openai = {
        ...settings.providers.openai,
        apiKey: 'SYNTHETIC_TEST',
        endpoint: 'https://synthetic.example.test/v1',
        models: [{ id: 'test', name: 'Test', vision: false }],
      };
      settings.text = { provider: 'openai', model: 'test' };
      useAISettings.getState().update(settings);
      return { entry: entry.id, document: document.id };
    });
    const card = page.locator(`#entry-${ids.entry}`);
    await card.waitFor();
    await card.evaluate((element) => {
      for (let node = element; node; node = node.parentElement)
        if (node.tagName === 'DETAILS') node.open = true;
    });
    await card.getByRole('button', { name: 'AI 润色', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '生成建议', exact: true }).click();
    const apply = dialog.getByRole('button', { name: '应用修改', exact: true });
    await apply.waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent.trim() === '应用修改' && !button.disabled,
      ),
    );
    const preview = await dialog.innerText();
    if (name === 'siblings') {
      assert.ok(preview.includes('After table'));
      assert.equal(await dialog.locator('.ai-structured-preview table').count(), 2);
    }
    await apply.click();
    const editor = page.locator(`#entry-${ids.entry} .rich-input`);
    await editor.waitFor();
    const before = await editor.evaluate((element) => {
      element.editor.state.doc.check();
      return element.editor.getJSON();
    });
    if (name === 'siblings') {
      assert.deepEqual(
        before.content.map((node) => node.type),
        ['table', 'paragraph', 'table'],
      );
      assert.ok(
        (await page.locator('.preview-panel .resume-document').innerText()).includes('After table'),
      );
      assert.equal(await page.locator('.preview-panel .resume-document table').count(), 2);
    }
    if (name === 'list') {
      const item = before.content[0].content[0].content[0].content[0].content[0];
      assert.deepEqual(
        item.content.map((node) => node.type),
        ['paragraph', 'heading'],
      );
      await editor.click();
      await editor.evaluate((element) => {
        const editor = element.editor;
        let position;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading') position = pos + 1 + node.content.size;
        });
        editor.commands.setTextSelection(position);
        element.focus();
      });
      await page.keyboard.type('!');
      await page.keyboard.press('Enter');
      const afterEnter = await editor.evaluate((element) => {
        element.editor.state.doc.check();
        return element.editor.getJSON();
      });
      assert.ok(JSON.stringify(afterEnter).includes('Heading item!'));
      await page.keyboard.press('Control+z');
      const afterUndo = await editor.evaluate((element) => {
        element.editor.state.doc.check();
        return element.editor.getJSON();
      });
      assert.notDeepEqual(afterUndo, afterEnter);
      assert.ok(JSON.stringify(afterUndo).includes('Heading item'));
    }
    if (name === 'code') {
      const block = before.content[0].content[0].content[0].content[0];
      assert.equal(block.type, 'codeBlock');
      assert.equal(block.attrs.language, 'typescript');
      assert.equal(block.content[0].text, 'const answer = 42;\n&copy;');
      assert.equal(block.content[0].marks, undefined);
    }
    const saved = await page.evaluate(async () => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      const state = useWorkspace.getState();
      await state.flush(state.activeId);
      return state.documents[state.activeId].sections[0].items[0].description;
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator(`#entry-${ids.entry}`).waitFor();
    await page.locator(`#entry-${ids.entry}`).evaluate((element) => {
      for (let node = element; node; node = node.parentElement)
        if (node.tagName === 'DETAILS') node.open = true;
    });
    await page.locator(`#entry-${ids.entry}`).scrollIntoViewIfNeeded();
    await page
      .locator(`#entry-${ids.entry} .rich-input`)
      .waitFor({ timeout: 30000 })
      .catch(async (error) => {
        console.log(
          JSON.stringify(
            {
              name,
              errors,
              diagnostics,
              saved,
              card: (await page.locator(`#entry-${ids.entry}`).innerHTML()).slice(-1000),
            },
            null,
            2,
          ),
        );
        await page.screenshot({ path: '.cache/repair-interchange-debug.png', fullPage: true });
        throw error;
      });
    const reloaded = await page.locator(`#entry-${ids.entry} .rich-input`).evaluate((element) => {
      element.editor.state.doc.check();
      return element.editor.getJSON();
    });
    const expected = await page
      .locator(`#entry-${ids.entry} .rich-input`)
      .evaluate((element, saved) => {
        const document = element.editor.schema.nodeFromJSON(saved);
        document.check();
        return document.toJSON();
      }, saved);
    assert.deepEqual(reloaded, expected);
    assert.equal(
      await page
        .locator(`#entry-${ids.entry}`)
        .getByRole('toolbar', { name: '文字格式', exact: true })
        .isVisible(),
      true,
    );
    await page.locator(`#entry-${ids.entry} .rich-input`).click();
    await page.locator(`#entry-${ids.entry} .rich-input`).evaluate((element) => {
      const editor = element.editor;
      let position = 1;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText) position = pos + node.nodeSize;
      });
      editor.commands.setTextSelection(position);
      element.focus();
    });
    await page.keyboard.type('!');
    const afterReloadTyping = await page
      .locator(`#entry-${ids.entry} .rich-input`)
      .evaluate((element) => {
        element.editor.state.doc.check();
        return element.editor.getJSON();
      });
    assert.notDeepEqual(afterReloadTyping, reloaded);
    assert.ok(JSON.stringify(afterReloadTyping).includes('!'));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `.cache/repair-interchange-${name}.png`, fullPage: true });
    results.push({ name, preview, before, saved, reloaded, afterReloadTyping, errors });
    await page.close();
  }
  await writeFile(
    '.cache/repair-interchange-browser-results.json',
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify(
      results.map(({ name, errors }) => ({ name, errors, valid: true })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
