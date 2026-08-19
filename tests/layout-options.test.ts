import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from '../src/resume/model.ts';
import { parseResumeFile, serializeResume } from '../src/resume/files.ts';

test('column proportions and aligned entry images survive JSON backups', () => {
  const doc = createDocument('linen', true);
  Object.assign(doc.appearance, { columnRatio: 35, columnGap: 18 });
  Object.assign(doc.sections[0].items[0], { imageAlign: 'right' });
  const restored = parseResumeFile(serializeResume(doc));
  assert.equal(restored.appearance.columnRatio, 35);
  assert.equal(restored.appearance.columnGap, 18);
  assert.equal(restored.sections[0].items[0].imageAlign, 'right');
});

test('layout controls reject invalid ratios, gaps and image positions', () => {
  for (const [key, value] of [
    ['columnRatio', 0],
    ['columnRatio', 81],
    ['columnGap', -1],
    ['columnGap', 65],
  ]) {
    const doc = createDocument('linen', true);
    Object.assign(doc.appearance, { [key]: value });
    assert.throws(() => parseResumeFile(serializeResume(doc)));
  }
  const doc = createDocument('linen', true);
  Object.assign(doc.sections[0].items[0], { imageAlign: 'absolute' });
  assert.throws(() => parseResumeFile(serializeResume(doc)));
});
