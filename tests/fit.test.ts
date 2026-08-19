import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from '../src/resume/model.ts';
import { fitCandidates } from '../src/resume/fit.ts';

test('one-page candidates preserve content-independent styling and readable lower bounds', () => {
  const appearance = createDocument().appearance;
  const original = structuredClone(appearance);
  const candidates = fitCandidates(appearance);
  assert.deepEqual(candidates[0], appearance);
  assert.ok(candidates.length > 5);
  assert.ok(
    candidates.every(
      (candidate) =>
        candidate.fontSize >= 11 && candidate.pageMargin >= 10 && candidate.lineHeight >= 1.25,
    ),
  );
  assert.ok(
    candidates.every(
      (candidate) =>
        candidate.accent === appearance.accent && candidate.template === appearance.template,
    ),
  );
  assert.deepEqual(appearance, original);
});
