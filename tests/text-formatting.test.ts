import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFontSize, normalizeTextAlign } from '../src/resume/textFormatting.ts';

test('pasted font sizes retain supported pixel sizes and discard unrelated CSS', () => {
  assert.equal(normalizeFontSize('14px'), '14px');
  assert.equal(normalizeFontSize('24px'), '24px');
  for (const value of ['9px', '49px', '14pt', '1em', '14px; color: red', '', 14, null]) {
    assert.equal(normalizeFontSize(value), undefined);
  }
});

test('paragraph alignment only accepts the supported text alignment values', () => {
  assert.equal(normalizeTextAlign('left'), 'left');
  assert.equal(normalizeTextAlign('center'), 'center');
  assert.equal(normalizeTextAlign('right'), 'right');
  assert.equal(normalizeTextAlign('justify'), 'justify');
  for (const value of ['start', 'inherit', 'center; color: red', '', null, {}]) {
    assert.equal(normalizeTextAlign(value), undefined);
  }
});
