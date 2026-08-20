import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampEditorRatio,
  parseInterfacePreferences,
  readInterfacePreferences,
  toggleWorkspacePanel,
  writeInterfacePreferences,
} from '../src/storage/interfacePrefs.ts';

test('validates stored preferences without accepting resume data or hiding both panels', () => {
  assert.deepEqual(
    parseInterfacePreferences({
      theme: 'dark',
      editorRatio: 0.65,
      editorHidden: true,
      previewHidden: true,
      documents: { private: 'resume' },
    }),
    { theme: 'dark', editorRatio: 0.65, editorHidden: true, previewHidden: false },
  );
  assert.deepEqual(
    parseInterfacePreferences({
      theme: 'sepia',
      editorRatio: Number.NaN,
      editorHidden: 'true',
      previewHidden: false,
    }),
    { theme: 'system', editorRatio: 0.4, editorHidden: false, previewHidden: false },
  );
  for (const invalid of [null, [], 'dark', 42]) {
    assert.deepEqual(parseInterfacePreferences(invalid), {
      theme: 'system',
      editorRatio: 0.4,
      editorHidden: false,
      previewHidden: false,
    });
  }
});

test('bounds panel ratios while keeping each desktop panel at least 320 pixels wide', () => {
  assert.equal(clampEditorRatio(0), 0.2);
  assert.equal(clampEditorRatio(1), 0.8);
  assert.equal(clampEditorRatio(0.2, 1000), 0.32);
  assert.ok(Math.abs(clampEditorRatio(0.8, 1000) - 0.68) < 1e-12);
  assert.equal(clampEditorRatio(0.2, 600), 0.5);
  assert.equal(clampEditorRatio(Number.POSITIVE_INFINITY), 0.4);
  assert.equal(clampEditorRatio(0.65, 0), 0.65);
});

test('hiding the remaining panel restores the opposite panel', () => {
  const current = {
    theme: 'system' as const,
    editorRatio: 0.55,
    editorHidden: false,
    previewHidden: false,
  };
  const editorHidden = toggleWorkspacePanel(current, 'editor');
  assert.deepEqual(editorHidden, { ...current, editorHidden: true });
  assert.deepEqual(toggleWorkspacePanel(editorHidden, 'preview'), {
    ...current,
    previewHidden: true,
  });
  assert.deepEqual(toggleWorkspacePanel(editorHidden, 'editor'), current);
});

test('loads and saves interface preferences without propagating unavailable storage errors', () => {
  assert.equal(readInterfacePreferences({ getItem: () => '{broken' }).theme, 'system');
  assert.equal(
    readInterfacePreferences({
      getItem: () => {
        throw new Error('unavailable');
      },
    }).theme,
    'system',
  );
  assert.equal(
    readInterfacePreferences({ getItem: () => '{"theme":"light","editorRatio":0.6}' }).editorRatio,
    0.6,
  );
  let saved = '';
  writeInterfacePreferences(
    { theme: 'dark', editorRatio: 0.7, editorHidden: false, previewHidden: true },
    {
      setItem: (_key, value) => {
        saved = value;
      },
    },
  );
  assert.deepEqual(JSON.parse(saved), {
    theme: 'dark',
    editorRatio: 0.7,
    editorHidden: false,
    previewHidden: true,
  });
  assert.doesNotThrow(() =>
    writeInterfacePreferences(
      { theme: 'system', editorRatio: 0.4, editorHidden: false, previewHidden: false },
      {
        setItem: () => {
          throw new Error('unavailable');
        },
      },
    ),
  );
});
