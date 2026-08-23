import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarWeeks } from '../src/resume/calendar.ts';

test('calendar includes leap day and preserves counts across year boundaries', () => {
  const weeks = calendarWeeks({
    title: '',
    visible: true,
    year: 2024,
    days: [{ date: '2024-02-29', count: 9 }],
  });
  const cells = weeks.flat().filter((cell) => cell !== null);
  assert.equal(cells.length, 366);
  assert.equal(cells[0].date, '2024-01-01');
  assert.equal(cells.at(-1)?.date, '2024-12-31');
  assert.equal(cells.find((cell) => cell.date === '2024-02-29')?.count, 9);
  assert.equal(cells.find((cell) => cell.date === '2024-03-01')?.count, 0);
  assert.equal(weeks[0][0], null);
});

test('calendar lays out a full leap year starting on Saturday without dropping the last day', () => {
  const weeks = calendarWeeks({ title: '', visible: true, year: 2000, days: [] });
  assert.equal(weeks.length, 54);
  assert.equal(weeks.flat().filter(Boolean).length, 366);
  assert.equal(weeks.at(-1)?.find(Boolean)?.date, '2000-12-31');
});
