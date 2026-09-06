import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5187';
const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
let server;
try {
  await fetch(baseURL);
} catch {
  if (process.env.LUCK_TEST_URL) throw new Error('The configured preview server is not reachable.');
  server = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host',
      '127.0.0.1',
      '--port',
      '5187',
      '--strictPort',
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: 'ignore' },
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(baseURL);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
const browser = await chromium.launch({
  channel:
    process.env.LUCK_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  headless: true,
});
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
const open = async (locator) => {
  if (!(await locator.getAttribute('open'))) await locator.locator(':scope > summary').click();
};
const readDocument = (page, id) =>
  page.evaluate(async (id) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    return useWorkspace.getState().documents[id || useWorkspace.getState().activeId];
  }, id);
const fresh = async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${baseURL}/#editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pagination-source .resume-document', { state: 'attached' });
  const id = await page.evaluate(async () => {
    const { createDocument, createSection, createEntry } = await import('/src/resume/model.ts');
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const doc = createDocument();
    doc.profile.name = 'Media Example';
    const work = createSection('experience');
    work.items = [createEntry()];
    work.items[0].title = 'Example Organization';
    const certificates = createSection('certifications');
    certificates.items = [];
    doc.sections = [work, certificates];
    return useWorkspace.getState().add(doc);
  });
  return { page, id };
};
try {
  {
    const { page, id } = await fresh();
    const logo = page.locator('.logo-editor').first();
    await open(logo);
    await open(logo.locator('.university-search'));
    await logo.getByLabel('学校名称', { exact: true }).fill('Example');
    let searches = 0;
    await page.route('**/api/assets/universities', async (route) => {
      const body = route.request().postDataJSON();
      searches++;
      if (searches === 1) {
        await route.fulfill({ status: 502, json: { error: 'Synthetic source failure' } });
        return;
      }
      await route.fulfill({
        json: {
          items: [
            {
              name: `Example ${body.page}`,
              image: `https://universitylogos.top/uni_logo/example${body.page}.png`,
              url: 'https://universitylogos.top/?q=Example',
            },
          ],
          page: body.page,
          hasMore: body.page === 1,
          source: 'https://universitylogos.top',
        },
      });
    });
    await page.route('**/api/assets/image', (route) =>
      route.fulfill({ contentType: 'image/png', body: png }),
    );
    await logo.getByRole('button', { name: '搜索学校', exact: true }).click();
    await logo.getByRole('button', { name: '重试搜索', exact: true }).click();
    await logo.locator('.logo-search-result').filter({ hasText: 'Example 1' }).waitFor();
    await logo.getByRole('button', { name: '下一页', exact: true }).click();
    const result = logo.locator('.logo-search-result').filter({ hasText: 'Example 2' });
    await result.getByRole('link', { name: '查看来源', exact: true }).waitFor();
    await result.getByRole('button', { name: '使用校徽', exact: true }).click();
    await page.waitForFunction(async (id) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      return useWorkspace
        .getState()
        .documents[id].sections[0].items[0].logo?.startsWith('data:image/png;');
    }, id);
    await logo.getByLabel('标识宽度', { exact: true }).fill('100');
    await logo.getByLabel('标识高度', { exact: true }).fill('50');
    await logo.getByLabel('锁定标识比例', { exact: true }).check();
    await logo.getByLabel('标识宽度', { exact: true }).fill('120');
    const entry = (await readDocument(page, id)).sections[0].items[0];
    assert.equal(entry.logoWidth, 120);
    assert.equal(entry.logoHeight, 60);
    assert.equal(entry.logoRatio, 2);
    assert.equal(entry.logo.startsWith('data:image/png;'), true);
    await logo
      .locator('.university-search')
      .screenshot({ path: fileURLToPath(new URL('media-school-search.png', output)) });
    await page.close();
  }
  {
    const { page, id } = await fresh();
    const calendar = page.locator('.contributions-editor');
    await open(calendar);
    await calendar.getByLabel('导入年份', { exact: true }).fill('2026');
    await calendar.getByLabel('GitHub 用户名', { exact: true }).fill('example');
    await calendar.getByLabel('GitHub Token', { exact: true }).fill('synthetic-token');
    let received;
    await page.route('**/api/assets/github', async (route) => {
      received = route.request().postDataJSON();
      await route.fulfill({
        json: {
          title: 'example · GitHub',
          visible: true,
          year: 2026,
          days: [{ date: '2026-01-01', count: 7 }],
        },
      });
    });
    await calendar.getByRole('button', { name: '获取 GitHub 日历', exact: true }).click();
    await calendar.getByRole('button', { name: '应用此日历', exact: true }).waitFor();
    await calendar
      .locator('.contributions-preview')
      .screenshot({ path: fileURLToPath(new URL('media-calendar-preview.png', output)) });
    assert.equal((await readDocument(page, id)).profile.contributions, undefined);
    await calendar.getByRole('button', { name: '应用此日历', exact: true }).click();
    const doc = await readDocument(page, id);
    assert.equal(doc.profile.contributions.days[0].count, 7);
    assert.equal(JSON.stringify(doc).includes('synthetic-token'), false);
    assert.equal(received.token, 'synthetic-token');
    assert.equal(
      await page.evaluate(() => JSON.stringify({ ...localStorage }).includes('synthetic-token')),
      false,
    );
    let release;
    let started;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const requested = new Promise((resolve) => {
      started = resolve;
    });
    await page.unroute('**/api/assets/github');
    await page.route('**/api/assets/github', async (route) => {
      started();
      await gate;
      try {
        await route.fulfill({
          json: {
            title: 'Stale',
            visible: true,
            year: 2026,
            days: [{ date: '2026-01-01', count: 99 }],
          },
        });
      } catch {
        /* The document change cancels this request. */
      }
    });
    await calendar.getByRole('button', { name: '获取 GitHub 日历', exact: true }).click();
    await requested;
    const nextId = await page.evaluate(async () => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      return useWorkspace.getState().create();
    });
    release();
    await page.waitForTimeout(150);
    assert.equal((await readDocument(page, id)).profile.contributions.days[0].count, 7);
    assert.equal((await readDocument(page, nextId)).profile.contributions, undefined);
    assert.equal(await calendar.getByLabel('GitHub Token', { exact: true }).inputValue(), '');
    assert.equal(await calendar.locator('.contributions-preview').count(), 0);
    await page.close();
  }
  {
    const { page, id } = await fresh();
    const intake = page.locator('.editor-form > .image-acquisition').first();
    await open(intake.locator('.image-url-input'));
    await intake.getByLabel('图片链接', { exact: true }).fill('https://example.invalid/photo.png');
    let release;
    let started;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const requested = new Promise((resolve) => {
      started = resolve;
    });
    await page.route('**/api/assets/image', async (route) => {
      started();
      await gate;
      await route.fulfill({ contentType: 'image/png', body: png });
    });
    await intake.getByRole('button', { name: '读取图片链接', exact: true }).click();
    await requested;
    const nextId = await page.evaluate(async () => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      return useWorkspace.getState().create();
    });
    release();
    await page.waitForFunction(async (id) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      return useWorkspace.getState().documents[id].profile.photo?.startsWith('data:image/png;');
    }, id);
    assert.equal((await readDocument(page, nextId)).profile.photo, '');
    await intake.evaluate((element, base64) => {
      const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
      element.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
      );
    }, png.toString('base64'));
    await page.waitForFunction(async (id) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      return Boolean(useWorkspace.getState().documents[id].profile.photo);
    }, nextId);
    await page.evaluate(async () => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      useWorkspace.getState().update((doc) => {
        doc.profile.photo = '';
      });
    });
    await intake.evaluate((element, base64) => {
      const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    }, png.toString('base64'));
    await page.waitForFunction(async (id) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      return Boolean(useWorkspace.getState().documents[id].profile.photo);
    }, nextId);
    await page.close();
  }
  {
    const { page, id } = await fresh();
    const batch = page.locator('.certificate-image-batch');
    await open(batch);
    await batch.locator('input[type=file]').setInputFiles([
      { name: 'first.png', mimeType: 'image/png', buffer: png },
      { name: 'second.png', mimeType: 'image/png', buffer: png },
    ]);
    await page.waitForFunction(async (id) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      return useWorkspace.getState().documents[id].sections[1].items.length === 2;
    }, id);
    assert.deepEqual(
      (await readDocument(page, id)).sections[1].items.map((entry) => entry.title),
      ['first', 'second'],
    );
    await batch.locator('.image-acquisition').evaluate((element, base64) => {
      const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'third.png', { type: 'image/png' }));
      data.items.add(new File([bytes], 'fourth.png', { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    }, png.toString('base64'));
    await page.waitForFunction(async (id) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      return useWorkspace.getState().documents[id].sections[1].items.length === 4;
    }, id);
    let release;
    let started;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const requested = new Promise((resolve) => {
      started = resolve;
    });
    await page.route('**/api/assets/image', async (route) => {
      started();
      await gate;
      await route.fulfill({ contentType: 'image/png', body: png });
    });
    await open(batch.locator('.image-url-input'));
    await batch
      .getByLabel('图片链接', { exact: true })
      .fill('https://example.invalid/certificate.png');
    await batch.getByRole('button', { name: '读取图片链接', exact: true }).click();
    await requested;
    const nextId = await page.evaluate(async () => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      return useWorkspace.getState().create();
    });
    release();
    await page.waitForFunction(async (id) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      return useWorkspace.getState().documents[id].sections[1].items.length === 5;
    }, id);
    assert.equal(
      (await readDocument(page, nextId)).sections.some((section) =>
        section.items.some((entry) => entry.image),
      ),
      false,
    );
    const document = await readDocument(page, id);
    assert.equal(
      document.sections[1].items.every((entry) => entry.image.startsWith('data:image/png;')),
      true,
    );
    await page.close();
  }
  console.log('Media browser scenarios passed.');
} finally {
  await browser.close();
  server?.kill();
}
