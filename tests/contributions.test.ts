import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContributions, validateContributionCalendar } from '../src/resume/contributions.ts';

test('imports JSON and CSV as sorted local calendar data', () => {
  const expected = {
    year: 2024,
    title: 'Activity',
    visible: true,
    days: [
      { date: '2024-02-29', count: 2 },
      { date: '2024-03-01', count: 0 },
    ],
  };
  assert.deepEqual(
    parseContributions('date,count\n2024-03-01,0\n2024-02-29,2', 2024, 'Activity'),
    expected,
  );
  assert.deepEqual(
    parseContributions(JSON.stringify({ ...expected, days: [...expected.days].reverse() }), 2024),
    expected,
  );
});

test('preserves valid visibility and returns a detached calendar', () => {
  const value = {
    year: 2024,
    title: 'Work',
    visible: false,
    days: [{ date: '2024-01-01', count: 1 }],
  };
  const result = validateContributionCalendar(value);
  assert.deepEqual(result, value);
  result.days[0].count = 20;
  assert.equal(value.days[0].count, 1);
});

test('rejects impossible dates, wrong years and duplicate days', () => {
  for (const text of [
    'date,count\n2023-02-29,1',
    'date,count\n2024-04-31,1',
    'date,count\n2024-2-01,1',
    'date,count\n2024-00-01,1',
    'date,count\n2025-01-01,1',
    'date,count\n2024-01-01,1\n2024-01-01,2',
  ])
    assert.throws(() => parseContributions(text, 2024));
});

test('rejects fractional, negative, nonnumeric and excessive counts', () => {
  for (const count of ['-1', '1.5', 'NaN', 'Infinity', '1000001', '', '1e3', '0x10']) {
    assert.throws(() => parseContributions(`date,count\n2024-01-01,${count}`, 2024));
  }
  assert.equal(parseContributions('date,count\n2024-01-01,1000000', 2024).days[0].count, 1000000);
});

test('rejects malformed structures, extra CSV cells and invalid metadata', () => {
  for (const value of [
    null,
    {},
    { year: 2024, title: 2, visible: true, days: [] },
    { year: 2024, title: '', visible: 'yes', days: [] },
    { year: 2024, title: '', visible: true, days: [{ date: '2024-01-01', count: '1' }] },
    {
      year: 2024,
      title: '',
      visible: true,
      days: Array(367).fill({ date: '2024-01-01', count: 1 }),
    },
  ])
    assert.throws(() => validateContributionCalendar(value));
  for (const text of ['', '{', 'date,count\n2024-01-01,1,extra', 'date,total\n2024-01-01,1']) {
    assert.throws(() => parseContributions(text, 2024));
  }
  assert.throws(() => parseContributions('date,count\n2024-01-01,1', 2024.5));
  assert.throws(() => parseContributions('date,count\n2024-01-01,1', 1959));
  assert.throws(() => parseContributions('date,count\n2024-01-01,1', 2101));
  assert.throws(() => parseContributions(JSON.stringify({ year: 2025, days: [] }), 2024));
});

test('enforces UTF-8 file size and title length before import', () => {
  assert.throws(() => parseContributions('中'.repeat(700000), 2024));
  assert.throws(() => parseContributions('date,count\n2024-01-01,1', 2024, 'a'.repeat(301)));
});

test('rejects explicitly invalid JSON metadata rather than defaulting it', () => {
  assert.throws(() => parseContributions('{"year":2024,"title":null,"days":[]}', 2024));
  assert.throws(() => parseContributions('{"year":2024,"visible":null,"days":[]}', 2024));
});

test('accepts leap days and year boundaries within the supported range', () => {
  assert.deepEqual(parseContributions('\uFEFFdate,count\r\n1960-02-29,0\r\n', 1960).days, [
    { date: '1960-02-29', count: 0 },
  ]);
  assert.deepEqual(parseContributions('date,count\n2100-12-31,1', 2100).days, [
    { date: '2100-12-31', count: 1 },
  ]);
  assert.throws(() => parseContributions('date,count\n2100-02-29,1', 2100));
});
