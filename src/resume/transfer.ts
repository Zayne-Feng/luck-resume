import { MAX_IMPORT_FILE_BYTES, validateDocument } from './files.ts';
import { profileContacts } from './fields.ts';
import {
  escapeMarkdown,
  richTextToMarkdown,
  markdownToRichText,
  markdownInlineToText,
} from './richTextMarkdown.ts';
import {
  createDocument,
  createEntry,
  createSection,
  richText,
  hasEntryContent,
  safeLink,
  type ResumeDocument,
  type ResumeEntry,
  type ResumeSection,
  type SectionType,
  type Appearance,
  type ResumeField,
} from './model.ts';
import { formatResumeDate } from './dates.ts';
import { authorSegments, publicationStatusName, publicationCitationLabel } from './publications.ts';

export interface TextImportResult {
  document: ResumeDocument;
  warnings: string[];
  embeddedDocument?: ResumeDocument;
}

const headingTypes: Record<string, SectionType> = {
  个人简介: 'summary',
  自我介绍: 'summary',
  个人总结: 'summary',
  summary: 'summary',
  profile: 'summary',
  'professional summary': 'summary',
  教育经历: 'education',
  教育背景: 'education',
  education: 'education',
  工作经历: 'experience',
  工作经验: 'experience',
  实习经历: 'experience',
  experience: 'experience',
  'work experience': 'experience',
  'professional experience': 'experience',
  项目经历: 'projects',
  项目经验: 'projects',
  projects: 'projects',
  专业技能: 'skills',
  技能: 'skills',
  skills: 'skills',
  'technical skills': 'skills',
  论文发表: 'publications',
  学术发表: 'publications',
  publications: 'publications',
  证书资质: 'certifications',
  证书: 'certifications',
  certifications: 'certifications',
  certificates: 'certifications',
  荣誉奖项: 'awards',
  获奖经历: 'awards',
  awards: 'awards',
  honors: 'awards',
  语言能力: 'languages',
  languages: 'languages',
  志愿活动: 'volunteering',
  volunteering: 'volunteering',
  'volunteer experience': 'volunteering',
};

function bodyHash(body: string): string {
  let hash = 2166136261;
  for (let index = 0; index < body.length; index++)
    hash = Math.imul(hash ^ body.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function encodePayload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 8192)));
  return btoa(chunks.join(''));
}

function decodePayload(value: string): unknown {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function freshDocument(value: unknown): ResumeDocument {
  const result = validateDocument(value);
  const ids = new Map<string, string>();
  const freshId = (id: string) => {
    if (!ids.has(id)) ids.set(id, crypto.randomUUID());
    return ids.get(id)!;
  };
  result.id = freshId(result.id);
  result.profile.customFields?.forEach((field) => {
    field.id = freshId(field.id);
  });
  result.profile.contactOrder = result.profile.contactOrder?.map((id) => ids.get(id) ?? id);
  for (const section of result.sections) {
    section.id = freshId(section.id);
    for (const item of section.items) {
      item.id = freshId(item.id);
      item.customFields?.forEach((field) => {
        field.id = freshId(field.id);
      });
    }
  }
  result.createdAt = result.updatedAt = new Date().toISOString();
  return result;
}

function fieldMarkdown(field: ResumeField): string {
  const value =
    field.kind === 'link' && safeLink(field.value)
      ? `[${escapeMarkdown(field.linkLabel?.trim() || field.value)}](${safeLink(field.value)!.replace(/\(/g, '%28').replace(/\)/g, '%29')})`
      : escapeMarkdown(
          field.kind === 'link' ? field.linkLabel?.trim() || field.value : field.value,
        );
  return field.showLabel && field.label ? `${escapeMarkdown(field.label)}：${value}` : value;
}

function entryMarkdown(entry: ResumeEntry, appearance: Appearance, index: number): string {
  const hidden = new Set(entry.hiddenFields ?? []);
  const parts: string[] = [];
  const citation =
    entry.publication && !hidden.has('publication')
      ? publicationCitationLabel(
          entry.publication,
          index,
          hidden.has('dates') ? '' : entry.startDate,
        )
      : '';
  const title = hidden.has('title') ? '' : entry.title;
  const subtitle = hidden.has('subtitle') ? '' : entry.subtitle;
  const heading = title || (citation ? subtitle : '');
  const headingLabel = title ? entry.fieldLabels?.title : entry.fieldLabels?.subtitle;
  if (heading)
    parts.push(
      `### ${escapeMarkdown((citation ? citation + ' ' : '') + (headingLabel ? headingLabel + '： ' : '') + heading)}`,
    );
  for (const key of ['subtitle', 'location'] as const)
    if (entry[key] && !hidden.has(key) && !(key === 'subtitle' && !title && heading))
      parts.push(
        escapeMarkdown(
          (key === 'subtitle' && entry.fieldLabels?.subtitle
            ? entry.fieldLabels.subtitle + '： '
            : '') + entry[key],
        ),
      );
  if (entry.degree?.trim() && !hidden.has('degree') && entry.degree.trim() !== subtitle.trim())
    parts.push(
      escapeMarkdown(
        `${entry.fieldLabels?.degree?.trim() ? entry.fieldLabels.degree.trim() + ': ' : ''}${entry.degree.trim()}`,
      ),
    );
  if (entry.gpa?.trim() && !hidden.has('gpa'))
    parts.push(escapeMarkdown(`${entry.fieldLabels?.gpa?.trim() || 'GPA'}: ${entry.gpa.trim()}`));
  if (entry.link && !hidden.has('link')) {
    const href = safeLink(entry.link);
    parts.push(
      entry.linkLabel?.trim() && href
        ? `[${escapeMarkdown(entry.linkLabel.trim())}](${href.replace(/\(/g, '%28').replace(/\)/g, '%29')})`
        : escapeMarkdown(entry.link),
    );
  }
  if (entry.publication && !hidden.has('publication')) {
    const publication = entry.publication;
    const authors = authorSegments(publication.authors, publication.highlightedAuthor)
      .map((segment) =>
        segment.highlighted ? `**${escapeMarkdown(segment.text)}**` : escapeMarkdown(segment.text),
      )
      .join('');
    if (authors) parts.push(authors);
    const venue = [
      publication.venue,
      publicationStatusName(publication.status, appearance.language),
    ]
      .filter(Boolean)
      .join(' · ');
    if (venue) parts.push(escapeMarkdown(venue));
  }
  if (!hidden.has('dates')) {
    const dates = [
      formatResumeDate(entry.startDate, appearance.dateFormat, appearance.language),
      formatResumeDate(
        entry.current ? '至今' : entry.endDate,
        appearance.dateFormat,
        appearance.language,
      ),
    ]
      .filter(Boolean)
      .join(' – ');
    if (dates) parts.push(escapeMarkdown(dates));
  }
  for (const field of entry.customFields ?? [])
    if (field.visible && (field.value || field.linkLabel?.trim())) parts.push(fieldMarkdown(field));
  if (!hidden.has('description')) {
    const body = richTextToMarkdown(entry.description);
    if (body) {
      const token = bodyHash(body);
      parts.push(`<!-- luck:body:${token} -->\n${body}\n<!-- /luck:body:${token} -->`);
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

export function serializeMarkdown(document: ResumeDocument, includeOriginal = true): string {
  const doc = validateDocument(document);
  const name = doc.profile.hiddenFields?.includes('name') ? '' : doc.profile.name || doc.title;
  const parts = name
    ? [
        `# ${escapeMarkdown((doc.profile.fieldLabels?.name ? doc.profile.fieldLabels.name + '： ' : '') + name)}`,
      ]
    : [];
  if (doc.profile.headline && !doc.profile.hiddenFields?.includes('headline'))
    parts.push(
      escapeMarkdown(
        (doc.profile.fieldLabels?.headline ? doc.profile.fieldLabels.headline + '： ' : '') +
          doc.profile.headline,
      ),
    );
  for (const field of profileContacts(doc.profile))
    if (field.visible && (field.value || field.linkLabel?.trim())) parts.push(fieldMarkdown(field));
  const calendar = doc.profile.contributions;
  if (calendar?.visible)
    parts.push(
      escapeMarkdown(
        `${calendar.title || (doc.appearance.language === 'en' ? 'Contributions' : '贡献记录')} · ${calendar.year} · ${calendar.days.reduce((sum, day) => sum + day.count, 0)}`,
      ),
    );
  for (const section of doc.sections) {
    if (!section.visible) continue;
    const content = section.items
      .filter(hasEntryContent)
      .map((entry, index) => entryMarkdown(entry, doc.appearance, index))
      .filter(Boolean)
      .join('\n\n');
    if (!content) continue;
    if (section.showTitle !== false) parts.push(`## ${escapeMarkdown(section.title)}`);
    parts.push(content);
  }
  const body = parts.join('\n\n').trimEnd() + '\n';
  const payload = encodePayload({
    format: 'luck-resume-markdown',
    version: 1,
    bodyHash: bodyHash(body),
    resume: doc,
  });
  const output = includeOriginal ? `${body}\n<!-- luck-resume:v1:${payload} -->\n` : body;
  if (new TextEncoder().encode(output).length > MAX_IMPORT_FILE_BYTES)
    throw new Error('Markdown 文件超过 64 MB。');
  return output;
}

function parseReadable(text: string, title?: string): ResumeDocument {
  if (!text.trim()) throw new Error('请粘贴或选择需要导入的文字。');
  const doc = createDocument();
  doc.title = (title?.trim() || '导入的简历').slice(0, 200);
  doc.sections = [];
  let section: ResumeSection | undefined;
  let entry: ResumeEntry | undefined;
  let lines: string[] = [];
  const ensureEntry = () => {
    if (!section) {
      section = createSection('freeform');
      section.title = '导入内容';
      section.items = [];
      doc.sections.push(section);
    }
    if (!entry) {
      entry = createEntry();
      section.items.push(entry);
    }
    return entry;
  };
  const flush = () => {
    if (lines.length && (section || lines.some((line) => line.trim())))
      ensureEntry().description = markdownToRichText(lines.join('\n'));
    lines = [];
  };
  const hasHeadings = /^#{1,3} /m.test(text);
  const hasSafeLinks = [...text.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)].some((match) =>
    Boolean(safeLink(match[1])),
  );
  if (
    !hasHeadings &&
    !hasSafeLinks &&
    !/^<!-- luck:body:[a-f0-9]{8} -->$/m.test(text) &&
    !/^\s*<table(?:\s|>)/m.test(text) &&
    !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(text) &&
    !/^[-+*] |^\d{1,16}[.)] |^>|^`{3,}|^~{3,}|^#{4} |^-{3,}$|`|\*\*|__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|\^[^\^\n]+\^|~[^~\n]+~/m.test(
      text,
    )
  ) {
    ensureEntry().description = richText(...text.split('\n'));
    return validateDocument(doc);
  }
  let bodyToken = '';
  let fence: { character: string; length: number } | undefined;
  for (const line of text.split('\n')) {
    if (bodyToken) {
      if (line === `<!-- /luck:body:${bodyToken} -->`) bodyToken = '';
      else lines.push(line);
      continue;
    }
    const bodyMarker = /^<!-- luck:body:([a-f0-9]{8}) -->$/.exec(line);
    if (!fence && bodyMarker && text.includes(`<!-- /luck:body:${bodyMarker[1]} -->`)) {
      bodyToken = bodyMarker[1];
      continue;
    }
    if (fence) {
      lines.push(line);
      if (new RegExp(`^ {0,3}${fence.character}{${fence.length},}\\s*$`).test(line))
        fence = undefined;
      continue;
    }
    const openingFence = /^ {0,3}(`{3,}|~{3,})[^\s]*\s*$/.exec(line);
    if (openingFence) {
      fence = { character: openingFence[1][0], length: openingFence[1].length };
      lines.push(line);
      continue;
    }
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    const headingText = heading ? markdownInlineToText(heading[2]) : '';
    if (heading?.[1] === '#' && !section && !doc.profile.name) {
      doc.profile.name = headingText.slice(0, 100);
      if (!title) doc.title = headingText.slice(0, 200);
      if (headingText.length > 100) lines.push(line);
    } else if (heading?.[1] === '##') {
      flush();
      const headingTitle = headingText;
      section = createSection(headingTypes[headingTitle.trim().toLowerCase()] ?? 'freeform');
      section.title = headingTitle.slice(0, 100);
      section.items = [];
      doc.sections.push(section);
      entry = undefined;
      if (headingTitle.length > 100) lines.push(line);
    } else if (heading?.[1] === '###') {
      flush();
      ensureEntry();
      if (
        entry &&
        (entry.title || entry.description.content?.some((node) => node.content?.length))
      ) {
        entry = createEntry();
        section!.items.push(entry);
      }
      entry!.title = headingText.slice(0, 300);
      if (headingText.length > 300) lines.push(line);
    } else lines.push(line);
  }
  flush();
  return validateDocument(doc);
}

export function parseTextImport(text: string, title?: string): TextImportResult {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_FILE_BYTES)
    throw new Error('文件超过 64 MB，请选择较小的文件。');
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const marker = /\n<!-- luck-resume:v1:([A-Za-z0-9+/=]+) -->\s*$/.exec(normalized);
  const body = marker ? normalized.slice(0, marker.index) : normalized;
  const warnings: string[] = [];
  if (marker) {
    try {
      const payload = decodePayload(marker[1]) as Record<string, unknown>;
      if (!payload || payload.format !== 'luck-resume-markdown' || payload.version !== 1)
        throw new Error();
      const embeddedDocument = freshDocument(payload.resume);
      if (payload.bodyHash === bodyHash(body)) return { document: embeddedDocument, warnings };
      warnings.push(
        'Markdown 正文已修改，预览将采用修改后的正文；也可以选择文件内保存的完整原稿。',
      );
      const document = body.trim() ? parseReadable(body, title) : createDocument();
      if (!body.trim()) {
        document.title = (title?.trim() || '导入的简历').slice(0, 200);
        document.sections = [];
      }
      return { document, embeddedDocument, warnings };
    } catch {
      warnings.push('文件内的完整原稿无法读取，已保留可读正文供导入。');
    }
  }
  return { document: parseReadable(body, title), warnings };
}

export function downloadMarkdown(document: ResumeDocument, includeOriginal = true): void {
  const url = URL.createObjectURL(
    new Blob([serializeMarkdown(document, includeOriginal)], {
      type: 'text/markdown;charset=utf-8',
    }),
  );
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `${(document.title.trim() || 'resume').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}.md`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
