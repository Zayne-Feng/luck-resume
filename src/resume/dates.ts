import type { DateFormat } from './model.ts';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function normalizeBirthDate(value: string): string | undefined {
  const clean = value.trim();
  if (!clean) return '';
  const match = /^(\d{4})([-/.])(\d{2})(?:\2(\d{2}))?$/.exec(clean);
  if (!match || Number(match[1]) < 1 || Number(match[3]) < 1 || Number(match[3]) > 12)
    return undefined;
  const month = `${match[1]}-${match[3]}`;
  if (!match[4]) return month;
  const date = `${month}-${match[4]}`;
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date
    ? date
    : undefined;
}

export function toMonthValue(value: string): string {
  const match = /^(\d{4})[./-](\d{1,2})$/.exec(value.trim());
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}`;
}
export function formatResumeDate(
  value: string,
  format: DateFormat = 'original',
  language: 'zh' | 'en' = 'zh',
): string {
  if (value === '至今' || value.toLowerCase() === 'present')
    return language === 'en' ? 'Present' : '至今';
  const month = toMonthValue(value);
  if (!month || format === 'original') return value;
  const [year, number] = month.split('-');
  if (format === 'MMM YYYY') return `${months[Number(number) - 1]} ${year}`;
  if (format === 'MM/YYYY') return `${number}/${year}`;
  return month.replace('-', format === 'YYYY.MM' ? '.' : format === 'YYYY/MM' ? '/' : '-');
}
export function dateRangeError(start: string, end: string, current: boolean): string {
  const a = toMonthValue(start),
    b = toMonthValue(end);
  return !current && a && b && a > b ? '结束时间早于开始时间，请检查日期。' : '';
}
