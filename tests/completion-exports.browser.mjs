import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const baseURL = process.env.LUCK_TEST_URL || 'http://127.0.0.1:5176';
const fonts = (process.env.LUCK_EXPORT_FONTS || 'sans,serif,wenkai,xiaowei').split(',');
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
      '5176',
      '--strictPort',
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: 'ignore' },
  );
  let available = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(baseURL);
      available = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!available) {
    server.kill();
    throw new Error('The export preview server could not be started.');
  }
}

let browser;
try {
  browser = await chromium.launch({
    channel:
      process.env.LUCK_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== new URL(baseURL).origin)
      externalRequests.push(request.url());
  });
  await page.goto(`${baseURL}/#editor`);
  await page.waitForSelector('.pagination-source .resume-document', { state: 'attached' });
  for (const font of fonts) {
    const id = await page.evaluate(async (font) => {
      const { createDocument, createSection, createEntry, richText } = await import(
        '/src/resume/model.ts'
      );
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      const doc = createDocument();
      doc.title = `Long export ${font}`;
      doc.profile.name = 'Export Example 中文姓名';
      doc.appearance.font = font;
      const section = createSection('custom');
      const entry = createEntry();
      entry.title = 'Continuous content';
      entry.description = richText(
        ...Array.from(
          { length: 170 },
          (_, index) =>
            `Line ${index + 1}: Continuous text with local fonts 中文测试 and final image.`,
        ),
      );
      const marker = document.createElement('canvas');
      marker.width = 200;
      marker.height = 40;
      const context = marker.getContext('2d');
      context.fillStyle = '#ed1736';
      context.fillRect(0, 0, 200, 40);
      entry.image = marker.toDataURL();
      entry.imageWidth = 40;
      entry.imageAlign = 'center';
      section.items = [entry];
      doc.sections = [section];
      useWorkspace.getState().add(doc);
      return doc.id;
    }, font);
    await page.waitForFunction(
      (id) =>
        document.querySelector('.pagination-source .resume-document')?.dataset.documentId === id,
      id,
    );
    const result = await page.evaluate(async (id) => {
      const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
      const { exportLongResume } = await import('/src/resume/longExport.ts');
      const { ensureResumeFont } = await import('/src/resume/fonts.ts');
      const doc = useWorkspace.getState().documents[id];
      await ensureResumeFont(doc.appearance.font);
      const source = document.querySelector('.pagination-source .resume-document');
      await Promise.all(Array.from(source.querySelectorAll('img'), (image) => image.decode()));
      const bounds = source.getBoundingClientRect();
      const marker = source.querySelector('.resume-entry-image').getBoundingClientRect();
      const markerX = marker.x - bounds.x + marker.width / 2;
      const markerY = marker.y - bounds.y + marker.height / 2;
      const originalName = source.querySelector('h1').textContent;
      const png = await exportLongResume(doc, 'png', {
        onProgress(progress) {
          if (progress.stage === 'preparing')
            source.querySelector('h1').textContent = 'Changed live source';
        },
      });
      source.querySelector('h1').textContent = originalName;
      const dimensions = [];
      let offset = 0;
      let pixel;
      for (const file of png.files) {
        const image = await createImageBitmap(file.blob);
        dimensions.push([image.width, image.height]);
        const localY = Math.floor(markerY * png.scale) - offset;
        if (localY >= 0 && localY < image.height) {
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          pixel = Array.from(
            context.getImageData(Math.floor(markerX * png.scale), localY, 1, 1).data,
          );
          canvas.width = 0;
          canvas.height = 0;
        }
        offset += image.height;
        image.close();
      }
      const pdf = await exportLongResume(doc, 'pdf');
      const pdfText = await pdf.files[0].blob.text();
      const abort = new AbortController();
      let cancelled = false;
      try {
        await exportLongResume(doc, 'png', {
          signal: abort.signal,
          onProgress(progress) {
            if (progress.stage === 'rendering') abort.abort();
          },
        });
      } catch (error) {
        cancelled = error.name === 'AbortError';
      }
      return {
        width: png.width,
        height: png.height,
        scale: png.scale,
        segmented: png.segmented,
        dimensions,
        pixel,
        pdfCount: pdf.files.length,
        pdfPages: (pdfText.match(/\/Type\s*\/Page\b/g) || []).length,
        pdfBox: pdfText
          .match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1]
          .trim()
          .split(/\s+/)
          .map(Number),
        cancelled,
        temporaryHosts: document.querySelectorAll('[style*="left: -100000px"]').length,
        sourceRetained:
          source.isConnected && source.querySelector('h1').textContent === originalName,
      };
    }, id);
    assert.equal(result.scale, 2);
    assert.equal(result.segmented, true);
    assert.equal(
      result.dimensions.reduce((sum, [, height]) => sum + height, 0),
      Math.ceil(result.height * 2),
    );
    assert.ok(
      result.dimensions.every(
        ([width, height]) => width === Math.ceil(result.width * 2) && height <= 8192,
      ),
    );
    assert.deepEqual(result.pixel, [237, 23, 54, 255]);
    assert.equal(result.pdfCount, 1);
    assert.equal(result.pdfPages, 1);
    assert.ok(Math.abs(result.pdfBox[2] - result.width * 0.75) < 0.01);
    assert.ok(Math.abs(result.pdfBox[3] - result.height * 0.75) < 0.01);
    assert.equal(result.cancelled, true);
    assert.equal(result.temporaryHosts, 0);
    assert.equal(result.sourceRetained, true);
    console.log(`PASS: ${font} PNG parts, final image, single-page PDF, cancellation and cleanup`);
  }
  const backupPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  backupPage.on('pageerror', (error) => errors.push(error.message));
  await backupPage.addInitScript(() => {
    const files = new Map();
    const writes = [];
    const file = (name) => ({
      kind: 'file',
      name,
      async getFile() {
        return new File([files.get(name)], name, { type: 'application/json' });
      },
      async createWritable() {
        let pending = '';
        return {
          async write(content) {
            pending = content;
          },
          async close() {
            files.set(name, pending);
            writes.push(name);
          },
          async abort() {},
        };
      },
    });
    const handle = {
      name: 'Export test backups',
      async queryPermission() {
        return 'granted';
      },
      async requestPermission() {
        return 'granted';
      },
      async getFileHandle(name, options) {
        if (!files.has(name)) {
          if (!options?.create) throw new DOMException('Missing', 'NotFoundError');
          files.set(name, '');
        }
        return file(name);
      },
      async *values() {
        for (const name of files.keys()) yield file(name);
      },
    };
    window.showDirectoryPicker = async () => handle;
    window.__backupDisk = { files, writes };
  });
  await backupPage.goto(`${baseURL}/#editor`);
  await backupPage.waitForSelector('.pagination-source .resume-document', { state: 'attached' });
  const originalFile = await backupPage.evaluate(async () => {
    const { createDocument } = await import('/src/resume/model.ts');
    const { serializeResume } = await import('/src/resume/files.ts');
    const { backupFileName, MANIFEST_NAME } = await import('/src/storage/directoryBackup.ts');
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const original = createDocument();
    original.id = 'backup-original';
    original.profile.name = 'Backed up name';
    const content = serializeResume(original);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    const fingerprint = Array.from(new Uint8Array(hash), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('');
    const name = await backupFileName(original.id);
    window.__backupDisk.files.set(name, content);
    window.__backupDisk.files.set(
      MANIFEST_NAME,
      JSON.stringify({
        format: 'luck-directory-backup',
        version: 1,
        entries: { [original.id]: { file: name, fingerprint, revision: 1 } },
      }),
    );
    useWorkspace
      .getState()
      .add({ ...original, profile: { ...original.profile, name: 'Local draft' } });
    return name;
  });
  await backupPage.getByRole('button', { name: '更多导入导出', exact: true }).click();
  const panel = backupPage.getByRole('region', { name: '目录自动备份', exact: true });
  await panel.getByRole('button', { name: '选择备份目录', exact: true }).click();
  await panel.getByRole('combobox', { name: '选择要查看的备份', exact: true }).waitFor();
  assert.equal(
    await backupPage.evaluate(
      (name) => JSON.parse(window.__backupDisk.files.get(name)).resume.profile.name,
      originalFile,
    ),
    'Backed up name',
  );
  await panel
    .getByRole('combobox', { name: '选择要查看的备份', exact: true })
    .selectOption(originalFile);
  await panel.getByRole('button', { name: '恢复为新简历', exact: true }).click();
  const restoredId = await backupPage.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const { activeId, documents } = useWorkspace.getState();
    if (
      activeId === 'backup-original' ||
      documents[activeId].profile.name !== 'Backed up name' ||
      documents['backup-original'].profile.name !== 'Local draft'
    )
      throw new Error('Backup restoration replaced a local draft.');
    return activeId;
  });
  await backupPage.waitForFunction(async (id) => {
    const { backupFileName } = await import('/src/storage/directoryBackup.ts');
    const content = window.__backupDisk.files.get(await backupFileName(id));
    return content && JSON.parse(content).resume.id === id;
  }, restoredId);
  const restoredFile = await backupPage.evaluate(async (id) => {
    const { backupFileName } = await import('/src/storage/directoryBackup.ts');
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    const name = await backupFileName(id);
    window.__backupDisk.files.set(name, 'External change');
    useWorkspace.getState().update((doc) => {
      doc.profile.name = 'Changed local draft';
    });
    return name;
  }, restoredId);
  await backupPage.waitForTimeout(1200);
  assert.equal(
    await backupPage.evaluate((name) => window.__backupDisk.files.get(name), restoredFile),
    'External change',
  );
  await backupPage.evaluate(async (id) => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    await useWorkspace.getState().remove(id);
  }, restoredId);
  assert.equal(
    await backupPage.evaluate((name) => window.__backupDisk.files.get(name), restoredFile),
    'External change',
  );
  await panel.getByRole('button', { name: '断开目录', exact: true }).click();
  await panel.getByText('尚未选择备份目录', { exact: true }).waitFor();
  const writeCount = await backupPage.evaluate(() => window.__backupDisk.writes.length);
  await backupPage.evaluate(async () => {
    const { useWorkspace } = await import('/src/stores/useWorkspace.ts');
    useWorkspace.getState().update((doc) => {
      doc.title = 'Disconnected draft';
    });
  });
  await backupPage.waitForTimeout(1000);
  assert.equal(await backupPage.evaluate(() => window.__backupDisk.writes.length), writeCount);
  console.log(
    'PASS: directory hook scanning, independent restoration, automatic writes, external changes, deletion and disconnect',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
} finally {
  await browser?.close();
  server?.kill();
}
