import { english } from './catalog.ts';

export type Locale = 'zh' | 'en';
export type MessageValues = Record<string, string | number>;

const chineseErrors = new Map(
  Object.entries(english).map(([chinese, translated]) => [translated, chinese]),
);

export function translate(locale: Locale, message: string, values: MessageValues = {}): string {
  const template = locale === 'en' ? (english[message] ?? message) : message;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

export function translateError(locale: Locale, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (locale === 'zh') return chineseErrors.get(message) ?? message;
  if (english[message]) return english[message];
  const size = /^文件超过 (\d+(?:\.\d+)?) MB，请选择较小的文件。$/.exec(message);
  if (size) return translate(locale, '文件超过 {size} MB，请选择较小的文件。', { size: size[1] });
  for (const [original, translated] of Object.entries(english)) {
    if (!original.endsWith('。') || !message.endsWith(original)) continue;
    const prefix = message.slice(0, -original.length);
    if (/[:：]\s*$/.test(prefix)) return `${prefix}${translated}`;
  }
  if (!/[\u3400-\u9fff]/.test(message)) return message;
  return english['操作未能完成，请重试。'];
}
