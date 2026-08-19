import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/resume/model.ts';
import { parseResumeFile, serializeResume, validateDocument } from '../src/resume/files.ts';

test('automatic one-page preference round-trips without changing typography', () => {
  const doc = createDocument();
  Object.assign(doc.appearance, { automaticOnePage: true, fontSize: 18, lineHeight: 1.8 });
  const restored = parseResumeFile(serializeResume(doc));
  assert.equal((restored.appearance as Record<string, unknown>).automaticOnePage, true);
  assert.equal(restored.appearance.fontSize, 18);
  assert.equal(restored.appearance.lineHeight, 1.8);
});

test('automatic one-page option accepts old documents and rejects invalid values', () => {
  const doc = createDocument();
  assert.equal('automaticOnePage' in validateDocument(doc).appearance, false);
  Object.assign(doc.appearance, { automaticOnePage: 'true' });
  assert.throws(() => validateDocument(doc));
});
