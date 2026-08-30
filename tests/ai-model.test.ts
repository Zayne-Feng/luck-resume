import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGrammar, applySuggestion, parseSemanticResume } from '../src/ai/results.ts';
import { saveSettings, readSettings, defaultSettings } from '../src/ai/settings.ts';

test('grammar anchors exact occurrences and guards changed source', () => {
  const source = 'We was ready. We was ready.';
  const suggestions = parseGrammar(
    '{"suggestions":[{"original":"was","replacement":"were","start":17,"reason":"agreement"}]}',
    source,
  );
  assert.equal(suggestions[0].start, 17);
  assert.equal(applySuggestion(source, suggestions[0]), 'We was ready. We were ready.');
  assert.throws(() => applySuggestion('Changed content', suggestions[0]));
  assert.deepEqual(
    parseGrammar('{"suggestions":[{"original":"missing","replacement":"x"}]}', source),
    [],
  );
});
test('semantic results become fresh validated documents with text descriptions', () => {
  const result = parseSemanticResume(
    '```json\n{"id":"external-id","title":"Imported","profile":{"name":"Ada","photo":"https://tracking.invalid"},"sections":[{"type":"experience","title":"Work","items":[{"title":"Engineer","description":"Built tools\\nReviewed work"}]}]}\n```',
  );
  assert.notEqual(result.id, 'external-id');
  assert.equal(result.profile.photo, '');
  assert.equal(result.sections[0].type, 'experience');
  assert.equal(result.sections[0].items[0].description.content?.length, 2);
  assert.throws(() => parseSemanticResume('{"sections":"bad"}'));
});
test('credentials default to session storage and remember is explicitly opt-in', () => {
  const memory = () => {
    const map = new Map();
    return {
      getItem: (k: string) => map.get(k) || null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
  };
  const local = memory(),
    session = memory();
  const settings = defaultSettings();
  settings.providers.openai.apiKey = 'secret';
  saveSettings(settings, local, session);
  assert.equal(local.getItem('luck-ai-settings')?.includes('secret'), false);
  assert.equal(readSettings(local, session).providers.openai.apiKey, 'secret');
  settings.providers.openai.remember = true;
  saveSettings(settings, local, session);
  assert.equal(local.getItem('luck-ai-settings')?.includes('secret'), true);
});
