import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/resume/model.ts';
import {
  validateAppearancePreset,
  parseAppearancePresets,
  serializeAppearancePresets,
  applyAppearancePreset,
  MAX_PRESET_FILE_BYTES,
} from '../src/storage/appearancePresets.ts';

const preset = () => ({
  id: 'style-one',
  name: 'My style',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  appearance: createDocument().appearance,
});

test('presets strip unrelated content and appearance fields on export', () => {
  const value = {
    ...preset(),
    profile: { name: 'PRIVATE' },
    appearance: { ...preset().appearance, photo: 'PRIVATE', sections: ['PRIVATE'] },
  };
  const text = serializeAppearancePresets([value]);
  assert.equal(text.includes('PRIVATE'), false);
  assert.equal(parseAppearancePresets(text)[0].name, 'My style');
});

test('damaged and oversized preset archives are rejected', () => {
  for (const appearance of [
    null,
    {},
    { ...preset().appearance, fontSize: NaN },
    { ...preset().appearance, fontSize: 500 },
  ]) {
    assert.throws(() => validateAppearancePreset({ ...preset(), appearance }));
  }
  assert.throws(() => parseAppearancePresets('{'));
  assert.throws(() =>
    parseAppearancePresets(JSON.stringify({ format: 'other', version: 1, presets: [preset()] })),
  );
  assert.throws(() => parseAppearancePresets(' '.repeat(MAX_PRESET_FILE_BYTES + 1)));
  assert.throws(() => serializeAppearancePresets(Array.from({ length: 51 }, preset)));
});

test('applying a preset preserves content and document identity without mutating inputs', () => {
  const doc = createDocument('linen', true);
  const before = structuredClone(doc);
  const style = preset();
  style.appearance.accent = '#123456';
  const result = applyAppearancePreset(doc, style);
  assert.deepEqual(doc, before);
  assert.deepEqual({ ...result, appearance: before.appearance }, before);
  assert.equal(result.appearance.accent, '#123456');
  result.appearance.accent = '#654321';
  assert.equal(style.appearance.accent, '#123456');
});

test('preset metadata is bounded and style options survive native validation', () => {
  for (const name of ['', '   ', 'x'.repeat(81), null]) {
    assert.throws(() => validateAppearancePreset({ ...preset(), name }));
  }
  for (const createdAt of ['', 'broken', null]) {
    assert.throws(() => validateAppearancePreset({ ...preset(), createdAt }));
  }
  const row = preset();
  Object.assign(row.appearance, {
    automaticOnePage: true,
    dateFormat: 'YYYY-MM',
    headingSize: 17,
    showPhoto: false,
  });
  const restored = parseAppearancePresets(serializeAppearancePresets([row]))[0];
  assert.equal(restored.appearance.automaticOnePage, true);
  assert.equal(restored.appearance.dateFormat, 'YYYY-MM');
  assert.equal(restored.appearance.headingSize, 17);
  assert.equal(restored.appearance.showPhoto, false);
});
