import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5187';
const browser = await chromium.launch({
  channel:
    process.env.LUCK_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  headless: true,
});
const page = await browser.newPage();
await page.addInitScript(() => {
  crypto.getRandomValues = (array) => {
    array.fill(23456);
    return array;
  };
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let requests = [];
const resume = {
  title: 'Synthetic semantic resume',
  profile: {
    name: 'Synthetic Tester',
    headline: 'Software Engineer',
    email: 'tester@example.test',
  },
  sections: [
    {
      type: 'experience',
      title: 'Synthetic Work',
      items: [
        {
          title: 'Synthetic Engineer',
          subtitle: 'Synthetic Company',
          description: 'Built synthetic systems.',
        },
      ],
    },
  ],
};
await page.route('**/api/ai/**', async (route) => {
  const request = route.request();
  const body = request.method() === 'POST' ? request.postDataJSON() : {};
  requests.push({ path: new URL(request.url()).pathname, body });
  const json = (data) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  if (request.url().endsWith('/models'))
    return json({ models: [{ id: 'synthetic-vision', name: 'Synthetic Vision', vision: true }] });
  if (request.url().endsWith('/test')) return json({ text: body.vision ? '123456' : 'OK' });
  if (request.url().endsWith('/generate')) {
    let text = 'Synthetic improved description.';
    if (body.operation === 'grammar')
      text = JSON.stringify({
        suggestions: [
          {
            original: body.text.slice(0, 2),
            replacement: 'Synthetic',
            start: 0,
            reason: 'Synthetic grammar reason',
          },
        ],
      });
    if (body.operation === 'semantic') text = JSON.stringify(resume);
    return route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ delta: text.slice(0, 8) })}\n\ndata: ${JSON.stringify({ delta: text.slice(8) })}\n\ndata: {"done":true}\n\n`,
    });
  }
  return json({ error: 'Unknown test request' });
});
try {
  await page.goto(base);
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  const settings = page.getByRole('dialog');
  assert.equal(requests.length, 0, 'Opening settings must not contact any provider');
  await settings.getByLabel('API 地址', { exact: true }).fill('https://synthetic.example.test/v1');
  await settings.getByLabel('API key', { exact: true }).fill('SYNTHETIC_BROWSER_SECRET');
  await settings.getByLabel('模型 ID', { exact: true }).fill('synthetic-fallback');
  await settings.getByRole('button', { name: '添加模型', exact: true }).click();
  await settings.getByText('synthetic-fallback · synthetic-fallback', { exact: true }).waitFor();
  assert.equal(requests.length, 0, 'Manual model selection must not contact a provider');
  await settings.getByRole('button', { name: '移除', exact: true }).click();
  await settings.getByRole('button', { name: '读取模型列表', exact: true }).click();
  await settings.getByText('已读取 1 个模型', { exact: true }).waitFor();
  await settings.getByRole('button', { name: '测试连接', exact: true }).click();
  await settings.getByText('连接测试通过', { exact: true }).waitFor();
  await settings.getByRole('button', { name: '测试视觉', exact: true }).click();
  await settings.getByText('视觉测试通过', { exact: true }).waitFor();
  await settings
    .getByRole('group', { name: '文字任务模型', exact: true })
    .getByLabel('模型', { exact: true })
    .selectOption('synthetic-vision');
  await settings
    .getByRole('group', { name: 'PDF 任务模型', exact: true })
    .getByLabel('模型', { exact: true })
    .selectOption('synthetic-vision');
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem('luck-ai-settings').includes('SYNTHETIC_BROWSER_SECRET'),
    ),
    false,
  );
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem('luck-ai-session-credentials').includes('SYNTHETIC_BROWSER_SECRET'),
    ),
    true,
  );
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: 'AI 润色', exact: true }).first().click();
  const polish = page.getByRole('dialog');
  await polish.getByLabel('本次写作要求', { exact: true }).fill('Use concise English.');
  await polish.getByRole('button', { name: '生成建议', exact: true }).click();
  await polish.getByLabel('修改建议', { exact: true }).waitFor();
  await polish.getByRole('button', { name: '应用修改', exact: true }).click();
  assert.ok(
    await page
      .locator('.tiptap')
      .evaluateAll((elements) =>
        elements.some((element) => element.textContent.includes('Synthetic improved description.')),
      ),
  );
  const polishRequest = requests.find((request) => request.body.operation === 'polish');
  assert.equal(polishRequest.body.instructions, 'Use concise English.');
  await page.getByRole('button', { name: '检查一下', exact: true }).click();
  await page.getByRole('button', { name: '开始语法检查', exact: true }).click();
  await page.getByText('Synthetic grammar reason', { exact: true }).waitFor();
  await page.getByRole('button', { name: '定位原文', exact: true }).click();
  await page.getByRole('button', { name: '检查一下', exact: true }).click();
  await page.getByText('Synthetic grammar reason', { exact: true }).waitFor();
  await page.getByRole('button', { name: '接受', exact: true }).click();
  await page.getByText('已接受', { exact: true }).waitFor();
  await page.getByRole('button', { name: '更多导入导出', exact: true }).click();
  const transfer = page.getByRole('dialog');
  const semantic = transfer.getByRole('region', { name: 'AI 语义导入', exact: true });
  await semantic
    .getByLabel('Markdown 内容', { exact: true })
    .fill('# Synthetic Tester\nSoftware Engineer');
  await semantic.getByRole('button', { name: '分析并预览', exact: true }).click();
  await semantic.getByLabel('简历名称', { exact: true }).waitFor();
  assert.equal(
    await semantic.getByLabel('简历名称', { exact: true }).inputValue(),
    'Synthetic semantic resume',
  );
  assert.equal(
    await semantic.getByRole('button', { name: '创建新简历', exact: true }).isDisabled(),
    true,
  );
  await semantic.getByLabel('选择 PDF 或 Markdown', { exact: true }).setInputFiles({
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nSynthetic PDF fixture\n%%EOF'),
  });
  await semantic.getByRole('button', { name: '分析并预览', exact: true }).click();
  await semantic.getByLabel('简历名称', { exact: true }).waitFor();
  const pdfRequest = requests.filter((request) => request.body.operation === 'semantic').at(-1);
  assert.equal(pdfRequest.body.attachments[0].mime, 'application/pdf');
  assert.ok(pdfRequest.body.attachments[0].data.startsWith('JVBERi0xLjQ'));
  await semantic.getByLabel('已核对内容，创建为新简历', { exact: true }).check();
  await semantic.getByRole('button', { name: '创建新简历', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByText('Synthetic Tester', { exact: true }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'AI browser settings, session credentials, streaming review, grammar location/history, and semantic preview passed.',
  );
  const callback = await browser.newPage();
  await callback.addInitScript(() =>
    sessionStorage.setItem(
      'luck-orca-pkce',
      JSON.stringify({ state: 'synthetic-state', verifier: 'a'.repeat(64), created: Date.now() }),
    ),
  );
  await callback.route('**/api/ai/oauth/exchange', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ key: 'SYNTHETIC_OAUTH_KEY' }),
    }),
  );
  await callback.goto(`${base}/auth/orca/callback?code=synthetic-code&state=synthetic-state`);
  await callback.getByText('已连接 OrcaRouter', { exact: true }).waitFor();
  assert.equal(new URL(callback.url()).pathname, '/');
  assert.equal(
    await callback.evaluate(() =>
      sessionStorage.getItem('luck-ai-session-credentials').includes('SYNTHETIC_OAUTH_KEY'),
    ),
    true,
  );
  assert.equal(
    await callback.evaluate(() =>
      localStorage.getItem('luck-ai-settings').includes('SYNTHETIC_OAUTH_KEY'),
    ),
    false,
  );
  console.log('AI browser Orca callback state validation and session credential storage passed.');
} finally {
  if (errors.length) console.error('Browser page errors:', errors);
  await browser.close();
}
