import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { type TestContext } from 'node:test';

function setDocument(t: TestContext, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  });
}

test('ships readable local WOFF2 files with their redistribution licenses', async () => {
  for (const family of ['sans', 'serif']) {
    const bytes = await readFile(new URL(`../public/fonts/luck-${family}.woff2`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'wOF2');
    assert.equal(bytes.readUInt32BE(8), bytes.length);
    assert.ok(bytes.readUInt16BE(12) > 0);
    const license = await readFile(
      new URL(`../public/fonts/${family}-OFL.txt`, import.meta.url),
      'utf8',
    );
    assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
    assert.match(license, /Copyright/);
  }
});

test('waits for both resume font weights and font layout readiness', async (t) => {
  const { ensureResumeFont } = await import('../src/resume/fonts.ts');
  const requests: string[] = [];
  let finishLoading: () => void = () => {};
  let finishLayout: () => void = () => {};
  const loaded = new Promise<void>((resolve) => (finishLoading = resolve));
  const ready = new Promise<void>((resolve) => (finishLayout = resolve));
  setDocument(t, {
    fonts: {
      load: async (font: string, text: string) => {
        requests.push(font);
        assert.match(text, /[\u4e00-\u9fff]/);
        await loaded;
        return [{ status: 'loaded' }];
      },
      ready,
    },
  });
  let complete = false;
  const pending = ensureResumeFont('serif').then(() => (complete = true));
  assert.deepEqual(requests, ['400 16px "Luck Serif"', '600 16px "Luck Serif"']);
  await Promise.resolve();
  assert.equal(complete, false);
  finishLoading();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(complete, false);
  finishLayout();
  await pending;
  assert.equal(complete, true);
});

test('rejects unregistered resume fonts', async (t) => {
  const { ensureResumeFont } = await import('../src/resume/fonts.ts');
  setDocument(t, {
    fonts: { load: async () => [], ready: Promise.resolve() },
  });
  await assert.rejects(ensureResumeFont('sans'), /Luck Sans/);
});

test('rejects failed resume font loads', async (t) => {
  const { ensureResumeFont } = await import('../src/resume/fonts.ts');
  setDocument(t, {
    fonts: {
      load: async () => {
        throw new Error('Font download failed');
      },
      ready: Promise.resolve(),
    },
  });
  await assert.rejects(ensureResumeFont('sans'), /Font download failed/);
});
