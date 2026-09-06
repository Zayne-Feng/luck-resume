import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.env.LUCK_REPAIR_URL || 'http://127.0.0.1:5250';
const output = new URL('../test-results/original-portability/', import.meta.url);
await mkdir(output, { recursive: true });
let server, browser;
try {
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
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [],
    downloads = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('download', (download) => downloads.push(download));
  await page.goto(base);
  await page.waitForSelector('.preview-panel .resume-document');
  const original = await page.evaluate(async () => {
    const { createDocument, createSection, createEntry } = await import('/src/resume/model.ts');
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const { readResumeImage } = await import('/src/resume/images.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const context = canvas.getContext('2d'),
      pixels = context.createImageData(800, 800);
    let seed = 123456789;
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      for (let channel = 0; channel < 3; channel++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        pixels.data[offset + channel] = seed & 255;
      }
      pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const image = await readResumeImage(
      new File([blob], 'allowed-image.png', { type: 'image/png' }),
    );
    const doc = createDocument(),
      section = createSection('certifications');
    doc.title = 'Large original';
    doc.profile.name = 'Image fixture';
    section.items = Array.from({ length: 12 }, (_, index) => ({
      ...createEntry(),
      title: `Certificate ${index + 1}`,
      image,
      imageWidth: 5,
    }));
    doc.sections = [section];
    useWorkspace.getState().add(doc);
    return { id: doc.id, imageCharacters: image.length };
  });
  assert.ok(original.imageCharacters < 4 * 1024 * 1024);
  await page.waitForFunction(
    (id) =>
      document.querySelector('.pagination-source .resume-document')?.dataset.documentId === id,
    original.id,
  );
  const downloadEvent = page.waitForEvent('download', { timeout: 60000 }).then(
    (download) => ({ download }),
    (error) => ({ error }),
  );
  await page
    .getByRole('button', { name: '保存 JSON', exact: true })
    .click()
    .catch(async (error) => {
      console.log(
        JSON.stringify(
          {
            phase: 'original-button',
            message: error.message,
            errors,
            body: (await page.locator('body').innerText()).slice(-3500),
          },
          null,
          2,
        ),
      );
      throw error;
    });
  const downloaded = await downloadEvent;
  if (downloaded.error) {
    console.log(
      JSON.stringify(
        { errors, body: (await page.locator('body').innerText()).slice(-3500) },
        null,
        2,
      ),
    );
    throw downloaded.error;
  }
  const download = downloaded.download;
  const path = fileURLToPath(new URL('large-original.json', output));
  await download.saveAs(path);
  const content = await readFile(path, 'utf8');
  assert.ok(Buffer.byteLength(content) > 32 * 1024 * 1024);
  const input = page.locator('input[type=file][accept=".json,application/json"]');
  await input.setInputFiles(path);
  await page.waitForFunction(
    (id) =>
      document.querySelector('.pagination-source .resume-document')?.dataset.documentId !== id,
    original.id,
  );
  const imported = await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const s = useWorkspace.getState();
    const d = s.documents[s.activeId];
    return {
      id: d.id,
      count: d.sections[0].items.length,
      first: d.sections[0].items[0].image,
      last: d.sections[0].items[11].image,
    };
  });
  assert.notEqual(imported.id, original.id);
  assert.equal(imported.count, 12);
  assert.equal(imported.first, imported.last);
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const { cloneEntry } = await import('/src/resume/model.ts');
    useWorkspace.getState().update((doc) => {
      const items = doc.sections[0].items;
      while (items.length < 24) items.push(cloneEntry(items[0]));
    });
  });
  const count = downloads.length;
  await page.getByRole('button', { name: '保存 JSON', exact: true }).click();
  await page
    .getByText('当前原稿超过 64 MB，请压缩配图或将内容拆分为多份简历后保存。', { exact: true })
    .waitFor();
  assert.equal(downloads.length, count);
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.keyboard.press('Control+s');
  await page
    .getByText('当前原稿超过 64 MB，请压缩配图或将内容拆分为多份简历后保存。', { exact: true })
    .waitFor();
  assert.equal(downloads.length, count);
  const remaining = await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const s = useWorkspace.getState();
    return s.documents[s.activeId].sections[0].items.length;
  });
  assert.equal(remaining, 24);
  assert.deepEqual(errors, []);
  console.log(
    'PASS permitted image processing, 35 MiB original download/import and guarded oversized button/shortcut with intact draft',
  );
} finally {
  await browser?.close();
  server?.kill();
}
