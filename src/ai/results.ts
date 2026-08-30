import {
  createDocument,
  createEntry,
  createField,
  createSection,
  richText,
  sectionTypes,
  type ResumeDocument,
  type SectionType,
  type ResumeField,
  type Publication,
} from '../resume/model.ts';
import { validateDocument } from '../resume/files.ts';
import { normalizeBirthDate } from '../resume/dates.ts';

function parseJson(text: string): unknown {
  const raw = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(raw);
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown, max = 20000) =>
  typeof value === 'string' ? value.slice(0, max) : '';
function boundedString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  if (value.length > max) throw new Error('模型返回的字段超过允许长度，请精简后重新生成。');
  return value;
}
function customFields(value: unknown): ResumeField[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((value) => {
    const item = record(value);
    const label = boundedString(item.label, 100);
    const text = boundedString(item.value, 20000);
    const kind = item.kind === 'link' ? 'link' : item.kind === 'multiline' ? 'multiline' : 'text';
    const linkLabel = kind === 'link' ? boundedString(item.linkLabel, 300) : '';
    if (!label || (!text && !linkLabel)) return [];
    return [{ ...createField(label, kind), value: text, ...(linkLabel ? { linkLabel } : {}) }];
  });
}
export interface GrammarSuggestion {
  id: string;
  original: string;
  replacement: string;
  reason: string;
  start: number;
}
export function parseGrammar(text: string, source: string): GrammarSuggestion[] {
  const data = record(parseJson(text));
  if (!Array.isArray(data.suggestions)) throw new Error('模型返回的语法建议格式无效。');
  const seen = new Set<string>();
  return data.suggestions.slice(0, 100).flatMap((value, index) => {
    const item = record(value);
    const original = string(item.original);
    const replacement = string(item.replacement);
    let start = Number.isInteger(item.start) ? Number(item.start) : -1;
    if (!original || original === replacement || original.length > source.length) return [];
    if (source.slice(start, start + original.length) !== original) {
      start = source.indexOf(original);
      if (start < 0 || source.indexOf(original, start + 1) >= 0) return [];
    }
    const key = `${start}:${original.length}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        id: `suggestion-${index}`,
        original,
        replacement,
        reason: string(item.reason, 2000),
        start,
      },
    ];
  });
}
export function applySuggestion(source: string, suggestion: GrammarSuggestion): string {
  if (
    source.slice(suggestion.start, suggestion.start + suggestion.original.length) !==
    suggestion.original
  )
    throw new Error('原文已变化，请重新检查。');
  return (
    source.slice(0, suggestion.start) +
    suggestion.replacement +
    source.slice(suggestion.start + suggestion.original.length)
  );
}
export function parseSemanticResume(text: string): ResumeDocument {
  const data = record(parseJson(text));
  if (!Array.isArray(data.sections)) throw new Error('模型返回的简历结构无效，请重新生成。');
  const document = createDocument();
  document.title = boundedString(data.title, 200) || 'AI 导入的简历';
  const profile = record(data.profile);
  const limits = { name: 100, headline: 300, email: 200, phone: 100, location: 200, website: 2048 };
  for (const key of ['name', 'headline', 'email', 'phone', 'location', 'website'] as const)
    document.profile[key] = boundedString(profile[key], limits[key]);
  const birthday = boundedString(profile.birthday || profile.birthDate, 200);
  document.profile.birthday = '';
  document.profile.employmentStatus = boundedString(profile.employmentStatus, 100);
  document.profile.customFields = customFields(profile.customFields);
  if (birthday) {
    const normalized = normalizeBirthDate(birthday);
    if (normalized !== undefined) document.profile.birthday = normalized;
    else document.profile.customFields.push({ ...createField('Birth date'), value: birthday });
  }
  document.sections = data.sections.slice(0, 40).map((value) => {
    const input = record(value);
    const type = sectionTypes.includes(input.type as SectionType)
      ? (input.type as SectionType)
      : 'custom';
    const section = createSection(type);
    section.title = boundedString(input.title, 100) || section.title;
    if (!Array.isArray(input.items)) throw new Error('模型返回的简历结构无效，请重新生成。');
    section.items = input.items.slice(0, 200).map((value) => {
      const input = record(value);
      const entry = createEntry(type);
      const limits = {
        title: 300,
        subtitle: 300,
        startDate: 30,
        endDate: 30,
        location: 200,
        link: 2048,
        linkLabel: 300,
        degree: 300,
        gpa: 100,
      };
      for (const key of [
        'title',
        'subtitle',
        'startDate',
        'endDate',
        'location',
        'link',
        'linkLabel',
        'degree',
        'gpa',
      ] as const)
        entry[key] = boundedString(input[key], limits[key]);
      entry.current = input.current === true;
      const description =
        typeof input.description === 'string'
          ? input.description
          : Array.isArray(input.description)
            ? input.description.filter((x) => typeof x === 'string').join('\n')
            : '';
      entry.description = richText(...description.slice(0, 50000).split(/\r?\n/));
      entry.customFields = customFields(input.customFields);
      if (type === 'publications') {
        const publication = record(input.publication);
        const statuses = ['none', 'published', 'accepted', 'preprint', 'submitted'];
        entry.publication = {
          authors: boundedString(publication.authors, 20000),
          highlightedAuthor: boundedString(publication.highlightedAuthor, 300),
          venue: boundedString(publication.venue, 1000),
          status: statuses.includes(String(publication.status))
            ? (publication.status as Publication['status'])
            : 'none',
          citationStyle: 'plain',
        };
      }
      return entry;
    });
    return section;
  });
  if (!document.profile.name && !document.sections.some((section) => section.items.length))
    throw new Error('未找到可导入的简历内容。');
  return validateDocument(document);
}
