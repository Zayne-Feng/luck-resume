import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as fonts from '../src/resume/fonts.ts';
import { createDocument } from '../src/resume/model.ts';
import { serializeResume, parseResumeFile } from '../src/resume/files.ts';

test('additional local font choices round trip and resolve to same-origin assets', () => {
  assert.equal(fonts.RESUME_FONT_FAMILIES.wenkai, 'Luck WenKai');
  assert.equal(fonts.RESUME_FONT_FAMILIES.xiaowei, 'Luck XiaoWei');
  for (const font of ['wenkai', 'xiaowei']) {
    const document = createDocument();
    document.appearance.font = font;
    assert.equal(parseResumeFile(serializeResume(document)).appearance.font, font);
    assert.equal(fonts.fontAssetPath(font), `/fonts/luck-${font}.woff2`);
  }
});

test('new font assets contain valid WOFF2 headers and complete redistribution licenses', async () => {
  for (const family of ['wenkai', 'xiaowei']) {
    const bytes = await readFile(new URL(`../public/fonts/luck-${family}.woff2`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'wOF2');
    assert.equal(bytes.readUInt32BE(8), bytes.length);
    assert.ok(bytes.length > 100000);
    assert.match(
      await readFile(new URL(`../public/fonts/${family}-OFL.txt`, import.meta.url), 'utf8'),
      /SIL OPEN FONT LICENSE/,
    );
  }
});
