import test from 'node:test';
import assert from 'node:assert/strict';
import { iconIds, isResumeIcon } from '../src/resume/icons.ts';
import * as iconModule from '../src/resume/icons.ts';
import { createDocument, createField } from '../src/resume/model.ts';
import { parseResumeFile, serializeResume } from '../src/resume/files.ts';

test('accepts safe icon names and rejects markup or inherited property names', () => {
  for (const value of ['none', 'mail', 'github', 'graduation', 'message'])
    assert.equal(isResumeIcon(value), true);
  for (const value of [
    '',
    'constructor',
    '__proto__',
    '<svg/>',
    'https://example.com/icon.svg',
    null,
    undefined,
    1,
  ]) {
    assert.equal(isResumeIcon(value), false);
  }
});

test('offers a broad semantic catalog while retaining every portable legacy identity', () => {
  assert.ok(iconIds.length >= 61);
  for (const value of [
    'none',
    'mail',
    'phone',
    'pin',
    'globe',
    'github',
    'linkedin',
    'user',
    'calendar',
    'award',
    'book',
    'briefcase',
    'graduation',
    'code',
    'link',
    'message',
    'database',
    'microscope',
    'languages',
    'heart',
    'building',
    'presentation',
  ])
    assert.equal(isResumeIcon(value), true, value);
  assert.equal(new Set(iconIds).size, iconIds.length);
  for (const value of [
    'toString',
    'hasOwnProperty',
    'MAIL',
    'mail ',
    'javascript:alert(1)',
    '<img src=x>',
  ]) {
    assert.equal(isResumeIcon(value), false, value);
  }
});

test('discovers icons in Chinese and English and combines query with category', () => {
  assert.ok('filterResumeIcons' in iconModule);
  const search = iconModule.filterResumeIcons as (
    query: string,
    category?: string,
  ) => { id: string }[];
  assert.ok(search('数据库').some((icon) => icon.id === 'database'));
  assert.ok(search(' SQL ').some((icon) => icon.id === 'database'));
  assert.ok(search('education').some((icon) => icon.id === 'graduation'));
  assert.ok(search('研究', 'education').some((icon) => icon.id === 'microscope'));
  assert.deepEqual(search('database', 'personal'), []);
  assert.deepEqual(search('<script>'), []);
  assert.deepEqual(search('', '__proto__'), []);
});

test('every selectable icon survives native backups and hostile identities are rejected', () => {
  const document = createDocument();
  document.profile.customFields = [createField('Research')];
  for (const icon of iconIds) {
    document.profile.fieldIcons = { email: icon };
    document.profile.customFields[0].icon = icon;
    const restored = parseResumeFile(serializeResume(document));
    assert.equal(restored.profile.fieldIcons?.email, icon);
    assert.equal(restored.profile.customFields?.[0].icon, icon);
  }
  for (const icon of ['constructor', '__proto__', '<svg onload=alert(1)>']) {
    Object.assign(document.profile.customFields[0], { icon });
    assert.throws(() => parseResumeFile(serializeResume(document)));
  }
});
