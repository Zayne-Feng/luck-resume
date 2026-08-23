import type { ContributionCalendar } from './model.ts';

export const contributionFileLimit = 2 * 1024 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validYear(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1960 && value <= 2100;
}

export function validateContributionCalendar(value: unknown): ContributionCalendar {
  if (!record(value) || !validYear(value.year)) throw new Error('年份应为 1960–2100 的整数。');
  if (typeof value.title !== 'string' || value.title.length > 300)
    throw new Error('标题最多 300 个字符。');
  if (typeof value.visible !== 'boolean') throw new Error('显示状态应为 true 或 false。');
  if (!Array.isArray(value.days) || value.days.length > 366)
    throw new Error('日期数据最多包含 366 天。');
  const seen = new Set<string>();
  const year = value.year;
  const days = value.days.map((day: unknown) => {
    if (!record(day) || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      throw new Error('日期应使用 YYYY-MM-DD 格式。');
    }
    const date = new Date(`${day.date}T00:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== day.date ||
      date.getUTCFullYear() !== year
    ) {
      throw new Error('所有日期必须真实有效，并属于所选年份。');
    }
    if (seen.has(day.date)) throw new Error(`日期重复：${day.date}`);
    seen.add(day.date);
    if (
      typeof day.count !== 'number' ||
      !Number.isInteger(day.count) ||
      day.count < 0 ||
      day.count > 1000000
    ) {
      throw new Error('每日次数应为 0–1000000 的整数。');
    }
    return { date: day.date, count: day.count };
  });
  return {
    title: value.title,
    visible: value.visible,
    year,
    days: days.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function parseContributions(
  text: string,
  year: number,
  title?: string,
): ContributionCalendar {
  if (new TextEncoder().encode(text).byteLength > contributionFileLimit)
    throw new Error('文件大小不能超过 2 MB。');
  if (!validYear(year)) throw new Error('年份应为 1960–2100 的整数。');
  const source = text.replace(/^\uFEFF/, '').trim();
  if (!source) throw new Error('请提供 JSON 或 CSV 日期数据。');
  if (source.startsWith('{') || source.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error('JSON 格式不正确。');
    }
    const data = Array.isArray(parsed) ? { days: parsed } : parsed;
    if (!record(data)) throw new Error('JSON 应包含 days 数组。');
    if (data.year !== undefined && data.year !== year)
      throw new Error('数据年份与所选年份不一致。');
    return validateContributionCalendar({
      ...data,
      year,
      title: title !== undefined ? title : data.title === undefined ? '贡献日历' : data.title,
      visible: data.visible === undefined ? true : data.visible,
    });
  }
  const lines = source.split(/\r?\n/).filter((line) => line.trim());
  if (lines.shift()?.trim() !== 'date,count') throw new Error('CSV 第一行应为 date,count。');
  const days = lines.map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    if (cells.length !== 2 || !/^\d+$/.test(cells[1]))
      throw new Error('CSV 每行应为 YYYY-MM-DD,非负整数。');
    return { date: cells[0], count: Number(cells[1]) };
  });
  return validateContributionCalendar({ year, title: title ?? '贡献日历', visible: true, days });
}
