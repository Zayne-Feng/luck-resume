import assert from 'node:assert/strict';
import test from 'node:test';
import { translate, translateError } from '../src/i18n/translate.ts';
import { english } from '../src/i18n/catalog.ts';

test('translates parameterized UI messages without changing inserted content', () => {
  assert.equal(
    translate('en', '发现 {count} 处可检查的表述', { count: 3 }),
    'Found 3 wording suggestions',
  );
  assert.equal(translate('zh', '第 {count} 页', { count: 2 }), '第 2 页');
  assert.equal(translate('en', '打开{name}', { name: '中文 {count}' }), 'Open 中文 {count}');
  assert.equal(translate('en', 'Unknown message'), 'Unknown message');
});

test('preserves actionable errors and their numeric values', () => {
  assert.equal(
    translateError('en', new Error('文件超过 32 MB，请选择较小的文件。')),
    'The file exceeds 32 MB. Choose a smaller file.',
  );
  assert.equal(
    translateError('en', 'Draft: 备份文件已被外部修改。'),
    'Draft: The backup file was changed externally.',
  );
  assert.equal(
    translateError('en', '无法测量简历尺寸，请重新打开简历后重试。'),
    english['无法测量简历尺寸，请重新打开简历后重试。'],
  );
  assert.equal(
    translateError(
      'zh',
      'The backup directory already contains 1000 documents. Choose another backup directory.',
    ),
    '备份目录已包含 1000 份文档，请选择其他备份目录。',
  );
  assert.equal(translateError('en', 'Unexpected failure'), 'Unexpected failure');
  assert.equal(translateError('en', '未收录的错误'), english['操作未能完成，请重试。']);
});

test('covers labels used in writing, appearance, review, backup and document transfer', () => {
  for (const key of [
    '文楷',
    '小薇',
    '照片比例',
    '本地写作检查',
    '长句',
    '重复用词',
    '目录自动备份',
    '查看和恢复备份',
    '长图与长页 PDF',
    '写下可见姓名',
    '检查可见链接',
    '结束时间早于开始时间，请检查日期。',
    '导入 PDF 或图片',
    'OCR 图片识别',
    '正在识别第 {page} 页…',
    '草稿，留在你的浏览器',
    '我的简历会上传到服务器吗？',
  ]) {
    assert.ok(english[key], `Missing English label: ${key}`);
    assert.notEqual(translate('en', key), key);
  }
});
