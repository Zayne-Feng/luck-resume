import type { ContributionCalendar } from './model.ts';

export function calendarWeeks(
  calendar: ContributionCalendar,
): ({ date: string; count: number } | null)[][] {
  const counts = new Map(calendar.days.map((day) => [day.date, day.count]));
  const first = new Date(Date.UTC(calendar.year, 0, 1));
  const last = Date.UTC(calendar.year + 1, 0, 1);
  const cells: ({ date: string; count: number } | null)[] = Array(first.getUTCDay()).fill(null);
  for (let time = first.getTime(); time < last; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    cells.push({ date, count: counts.get(date) ?? 0 });
  }
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
}
