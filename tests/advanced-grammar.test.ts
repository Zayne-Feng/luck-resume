import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument, createEntry, createSection, textContent } from '../src/resume/model.ts';
import { grammarFields, applyGrammar } from '../src/ai/grammar.ts';

test('grammar replacements retain advanced blocks and locate text after structural line breaks', () => {
  const document = createDocument();
  const section = createSection('experience');
  const entry = createEntry();
  entry.description = {
    type: 'doc',
    content: [
      {
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First sentence.' }] },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'We was ready.', marks: [{ type: 'bold' }] }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Line one' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Another error.' },
        ],
      },
    ],
  };
  section.items = [entry];
  document.sections = [section];
  const field = grammarFields(document).find((field) => field.field === 'description')!;
  const local = field.text.indexOf('was');
  assert.ok(local > 0);
  assert.equal(
    applyGrammar(document, field, {
      original: 'was',
      replacement: 'were',
      start: field.start + local,
      reason: 'Agreement',
    }),
    true,
  );
  assert.equal(textContent(entry.description), field.text.replace('was', 'were'));
  assert.equal(entry.description.content![0].type, 'blockquote');
  assert.deepEqual(entry.description.content![0].content![1].content![0].marks, [{ type: 'bold' }]);
  const next = grammarFields(document).find((field) => field.field === 'description')!;
  const other = next.text.indexOf('error');
  assert.equal(
    applyGrammar(document, next, {
      original: 'error',
      replacement: 'result',
      start: next.start + other,
      reason: 'Synthetic',
    }),
    true,
  );
  assert.equal(textContent(entry.description), next.text.replace('error', 'result'));
});
