import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from '../src/resume/model.ts';
import { newHistory, recordChange, travelHistory } from '../src/resume/history.ts';

test('groups continuous edits and preserves the first snapshot', () => {
  const first = createDocument();
  const second = { ...first, title: 'A' };
  const h1 = recordChange(newHistory(), first, 'title', 1000);
  const h2 = recordChange(h1, second, 'title', 1200);
  assert.equal(h2.past.length, 1);
  assert.equal(h2.past[0].title, '未命名简历');
  assert.equal(recordChange(h2, second, 'color', 1300).past.length, 2);
});

test('undo and redo restore documents and a new edit clears redo', () => {
  const first = createDocument();
  const second = { ...first, title: 'New title' };
  const history = recordChange(newHistory(), first, 'title', 1000);
  const undone = travelHistory(history, second, 'undo')!;
  assert.equal(undone.document.title, first.title);
  const redone = travelHistory(undone.history, undone.document, 'redo')!;
  assert.equal(redone.document.title, second.title);
  assert.equal(recordChange(undone.history, undone.document, 'title', 3000).future.length, 0);
  assert.equal(travelHistory(newHistory(), first, 'undo'), null);
});
