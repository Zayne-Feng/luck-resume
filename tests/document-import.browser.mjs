import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { jsPDF } from 'jspdf';

const root = new URL('../', import.meta.url);
const output = new URL('../test-results/document-import/', import.meta.url);
const baseUrl = process.env.LUCK_DOCUMENT_IMPORT_URL || 'http://127.0.0.1:5177';
await mkdir(output, { recursive: true });
let server;
try {
  await fetch(baseUrl);
} catch {
  if (process.env.LUCK_DOCUMENT_IMPORT_URL)
    throw new Error('The configured test server is not reachable.');
  server = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import { createServer } from 'vite'; const server = await createServer({server:{host:'127.0.0.1',port:5177,strictPort:true,hmr:false,watch:null}}); await server.listen();",
    ],
    {
      cwd: fileURLToPath(root),
      windowsHide: true,
      stdio: 'ignore',
    },
  );
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(baseUrl);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!ready) {
    server.kill();
    throw new Error('The test server could not be started.');
  }
}

const browser = await chromium.launch({
  channel:
    process.env.LUCK_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const external = [];
context.on('request', (request) => {
  if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseUrl).origin)
    external.push(request.url());
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) console.log(`NAVIGATED: ${frame.url()}`);
});
page.setDefaultTimeout(30000);
const panel = page.locator('.document-import-panel');
const chooseFile = async (name, mimeType, buffer) =>
  panel
    .getByLabel('选择 PDF 或图片文件', { exact: true })
    .setInputFiles({ name, mimeType, buffer });
const open = async () => page.getByRole('button', { name: '更多导入导出', exact: true }).click();
const read = async () => {
  await panel.getByRole('button', { name: '提取所选页面', exact: true }).click();
  await panel.locator('.document-import-review').waitFor();
};
const results = [];
const step = async (name, run) => {
  await run();
  results.push(name);
  console.log(`PASS: ${name}`);
};

try {
  await page.goto(baseUrl);
  await page.getByLabel('姓名', { exact: true }).waitFor();
  await open();
  const activeBefore = await page.evaluate(() => localStorage.getItem('luck-active'));
  const pdf = new jsPDF();
  pdf.text('Alpha Engineer', 20, 25);
  pdf.text('Built reliable local tools.', 20, 35);
  pdf.addPage();
  pdf.text('Beta Experience', 20, 25);
  pdf.addPage();
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

  await step('PDF page ranges validate without changing the current document', async () => {
    await chooseFile('pages.pdf', 'application/pdf', pdfBuffer);
    await panel.getByText('共 3 页', { exact: false }).waitFor();
    await panel.getByLabel('指定页码', { exact: true }).check();
    await panel.getByLabel('页码范围', { exact: true }).fill('4');
    await panel.getByRole('button', { name: '提取所选页面', exact: true }).click();
    await panel.getByRole('alert').getByText('请输入有效页码', { exact: false }).waitFor();
    await panel.getByLabel('页码范围', { exact: true }).fill('2,1,2');
    await read();
    assert.equal(await panel.locator('.document-import-page textarea').count(), 2);
    assert.match(
      await panel.locator('.document-import-page textarea').nth(0).inputValue(),
      /Alpha Engineer/,
    );
    assert.match(
      await panel.locator('.document-import-page textarea').nth(1).inputValue(),
      /Beta Experience/,
    );
    assert.equal(await page.evaluate(() => localStorage.getItem('luck-active')), activeBefore);
  });

  await step(
    'blank PDF pages require explicit review before preview and new document import',
    async () => {
      await panel.getByLabel('全部页面', { exact: true }).check();
      await read();
      assert.equal(await panel.locator('.document-import-page textarea').count(), 3);
      assert.equal(
        await panel.getByRole('button', { name: '预览导入', exact: true }).isDisabled(),
        true,
      );
      await panel.getByLabel('确认此页无需导入文字', { exact: true }).check();
      await panel.getByRole('button', { name: '预览导入', exact: true }).click();
      await panel.getByRole('button', { name: '确认导入为新简历', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('luck-active')), activeBefore);
      await panel
        .locator('.document-import-page textarea')
        .nth(0)
        .fill('Edited Engineer\nVerified local import.');
      assert.equal(
        await panel.getByRole('button', { name: '确认导入为新简历', exact: true }).count(),
        0,
      );
      await panel.getByRole('button', { name: '预览导入', exact: true }).click();
      await page.screenshot({ path: fileURLToPath(new URL('review.png', output)), fullPage: true });
      await panel.getByRole('button', { name: '确认导入为新简历', exact: true }).click();
      await page.waitForFunction(
        (previous) => localStorage.getItem('luck-active') !== previous,
        activeBefore,
      );
      await page.locator('dialog').waitFor({ state: 'hidden' });
      assert.match(await page.locator('.preview-panel').innerText(), /Edited Engineer/);
    },
  );

  await open();
  await step('encrypted PDF accepts a retry after an incorrect password', async () => {
    const encrypted = new jsPDF({
      encryption: {
        userPassword: 'correct-password',
        ownerPassword: 'owner-password',
        userPermissions: ['print', 'copy'],
      },
    });
    encrypted.text('Password protected engineer', 20, 20);
    await chooseFile(
      'protected.pdf',
      'application/pdf',
      Buffer.from(encrypted.output('arraybuffer')),
    );
    await panel.getByLabel('PDF 密码', { exact: true }).fill('incorrect-password');
    await panel.getByRole('button', { name: '解锁 PDF', exact: true }).click();
    await panel.getByText('PDF 密码不正确，请重试。', { exact: true }).waitFor();
    await panel.getByLabel('PDF 密码', { exact: true }).fill('correct-password');
    await panel.getByRole('button', { name: '解锁 PDF', exact: true }).click();
    await panel.getByText('共 1 页', { exact: false }).waitFor();
    await read();
    assert.match(await panel.locator('textarea').inputValue(), /Password protected engineer/);
  });

  const imageData = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 400;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    context.font = 'bold 68px Arial';
    context.fillText('LOCAL ENGINEER', 60, 135);
    context.font = '52px Arial';
    context.fillText('Reliable browser text recognition', 60, 235);
    return canvas.toDataURL('image/png');
  });
  const imageBuffer = Buffer.from(imageData.split(',')[1], 'base64');

  await step('OCR initialization can be cancelled and a later import remains usable', async () => {
    await chooseFile('resume.png', 'image/png', imageBuffer);
    await panel.getByText('共 1 页', { exact: false }).waitFor();
    await panel.getByLabel('OCR 语言', { exact: true }).selectOption('eng');
    await panel.getByRole('button', { name: '提取所选页面', exact: true }).click();
    await panel.getByRole('button', { name: '取消读取', exact: true }).click();
    await panel.getByText('已取消文档读取。', { exact: true }).waitFor();
    assert.equal(await panel.locator('textarea').count(), 0);
  });

  await step('image OCR reads same-origin English assets and returns editable text', async () => {
    await chooseFile('resume.png', 'image/png', imageBuffer);
    await panel.getByText('共 1 页', { exact: false }).waitFor();
    await panel.getByRole('button', { name: '提取所选页面', exact: true }).click();
    await panel.locator('.document-import-review').waitFor({ timeout: 120000 });
    assert.match(await panel.locator('textarea').inputValue(), /LOCAL ENGINEER/);
    await page.screenshot({ path: fileURLToPath(new URL('ocr.png', output)), fullPage: true });
  });

  await step('mixed scanned PDF fallback retains the existing text page', async () => {
    const mixed = new jsPDF();
    mixed.text('Original text page', 20, 20);
    mixed.addPage();
    mixed.addImage(imageData, 'PNG', 10, 20, 190, 55);
    await chooseFile('mixed.pdf', 'application/pdf', Buffer.from(mixed.output('arraybuffer')));
    await panel.getByText('共 2 页', { exact: false }).waitFor();
    await read();
    assert.equal(
      await panel.getByRole('button', { name: '预览导入', exact: true }).isDisabled(),
      true,
    );
    const original = await panel.locator('textarea').nth(0).inputValue();
    await panel.getByRole('button', { name: '对无文字页面使用 OCR', exact: true }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelectorAll('.document-import-page textarea')[1]
          ?.value.includes('LOCAL ENGINEER'),
      undefined,
      { timeout: 120000 },
    );
    assert.equal(await panel.locator('textarea').nth(0).inputValue(), original);
    assert.equal(
      await panel.getByRole('button', { name: '预览导入', exact: true }).isEnabled(),
      true,
    );
  });

  await step(
    'combined local Chinese and English language data recognizes bilingual images',
    async () => {
      const bilingualImage = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1400;
        canvas.height = 400;
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#000';
        context.font = 'bold 78px Microsoft YaHei';
        context.fillText('软件工程师', 60, 135);
        context.font = 'bold 68px Arial';
        context.fillText('LOCAL ENGINEER', 60, 265);
        return canvas.toDataURL('image/png').split(',')[1];
      });
      await chooseFile('bilingual.png', 'image/png', Buffer.from(bilingualImage, 'base64'));
      await panel.getByText('共 1 页', { exact: false }).waitFor();
      await panel.getByLabel('OCR 语言', { exact: true }).selectOption('eng+chi_sim');
      await panel.getByRole('button', { name: '提取所选页面', exact: true }).click();
      await panel.locator('.document-import-review').waitFor({ timeout: 120000 });
      const text = await panel.locator('textarea').inputValue();
      assert.match(text.replace(/\s/g, ''), /软件工程师/);
      assert.match(text, /LOCAL ENGINEER/);
    },
  );

  await step('closing an initializing import discards stale results on reopening', async () => {
    await panel.getByRole('button', { name: '提取所选页面', exact: true }).click();
    await panel.getByRole('button', { name: '取消读取', exact: true }).waitFor();
    await page.locator('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await open();
    assert.equal(await panel.locator('textarea').count(), 0);
    assert.equal(await panel.getByRole('button', { name: '提取所选页面', exact: true }).count(), 0);
  });

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    new URL('results.json', output),
    JSON.stringify({ results, errors, external }, null, 2),
  );
  console.log(`Verified ${results.length} document import scenarios.`);
} catch (error) {
  await page
    .screenshot({ path: fileURLToPath(new URL('failure.png', output)), fullPage: true })
    .catch(() => {});
  await writeFile(
    new URL('failure.txt', output),
    `${String(error)}\n\n${await page.locator('body').innerText()}\n\n${JSON.stringify({ errors, external })}`,
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  server?.kill();
}
