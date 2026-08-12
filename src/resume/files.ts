import {
  templateIds,
  sectionTypes,
  dateFormats,
  type ResumeDocument,
  type ResumeEntry,
  type ResumeSection,
  type RichTextNode,
  type SectionType,
  type TemplateId,
  type ResumeField,
} from './model.ts';
import {
  normalizeFontSize,
  normalizeTextAlign,
  normalizeParagraphIndent,
  normalizeParagraphLineHeight,
  normalizeHighlightColor,
  normalizeTextColor,
  normalizeCodeLanguage,
} from './textFormatting.ts';
import { isResumeIcon } from './icons.ts';
import { validateContributionCalendar } from './contributions.ts';
import { fontIds } from './fonts.ts';
import { normalizeBirthDate } from './dates.ts';

export const MAX_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_IMPORT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_RECOVERY_RECORDS = 1000;
const fail = (message = '文件内容不完整或格式不正确，请选择幸运简历导出的 JSON 文件。'): never => {
  throw new Error(message);
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail();
const string = (value: unknown, limit = 10000): string =>
  typeof value === 'string' && value.length <= limit ? value : fail();
const boolean = (value: unknown): boolean => (typeof value === 'boolean' ? value : fail());
const array = (value: unknown, limit: number): unknown[] =>
  Array.isArray(value) && value.length <= limit ? value : fail();
const numeric = (value: unknown, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fail();
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T =>
  typeof value === 'string' && values.includes(value as T) ? (value as T) : fail();
const raster = (value: unknown): string => {
  const image = string(value, 4 * 1024 * 1024);
  if (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))
    return fail('图片必须是文件中内嵌的 PNG、JPEG 或 WebP 图片。');
  return image;
};
const icon = (value: unknown): string =>
  isResumeIcon(value) ? String(value) : fail('文件包含不支持的图标。');
const link = (value: unknown): string => {
  const text = string(value, 2048);
  const normalized = text.replace(/[\u0000-\u0020\u007f]/g, '');
  const protocol = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1].toLowerCase();
  return !protocol || ['http', 'https', 'mailto', 'tel'].includes(protocol)
    ? text
    : fail('文件含有不支持的链接，请使用 http、https、mailto 或 tel 地址。');
};

export function validateRichText(value: unknown, depth = 0, budget = { nodes: 0 }): RichTextNode {
  if (depth > 40 || ++budget.nodes > 100000) return fail('文本结构过于复杂，请简化内容后重试。');
  const node = record(value);
  const type = oneOf(node.type, [
    'doc',
    'paragraph',
    'text',
    'bulletList',
    'orderedList',
    'listItem',
    'hardBreak',
    'heading',
    'blockquote',
    'codeBlock',
    'horizontalRule',
    'table',
    'tableRow',
    'tableCell',
    'tableHeader',
  ] as const);
  if (depth === 0 && type !== 'doc') return fail();
  if (depth > 0 && type === 'doc') return fail();
  const result: RichTextNode = { type };
  if ((type === 'tableCell' || type === 'tableHeader') && node.attrs !== undefined) {
    const attrs = record(node.attrs);
    result.attrs = {};
    for (const key of ['colspan', 'rowspan'] as const) {
      if (attrs[key] == null) continue;
      const value = numeric(attrs[key], 1, key === 'colspan' ? 100 : 500);
      if (!Number.isInteger(value)) return fail();
      result.attrs[key] = value;
    }
    if (attrs.colwidth != null) {
      const widths = array(attrs.colwidth, 100).map((width) => numeric(width, 0, 2000));
      if (widths.length !== (result.attrs.colspan ?? 1)) return fail();
      result.attrs.colwidth = widths;
    }
    if (attrs.backgroundColor != null && attrs.backgroundColor !== '')
      result.attrs.backgroundColor = normalizeTextColor(attrs.backgroundColor) ?? fail();
    if (!Object.keys(result.attrs).length) delete result.attrs;
  }
  if (type === 'heading') {
    const level = record(node.attrs).level;
    if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 4)
      return fail();
    result.attrs = { level };
  }
  if (type === 'codeBlock' && node.attrs !== undefined) {
    const language = record(node.attrs).language;
    if (language !== undefined && language !== null && language !== '')
      result.attrs = { language: normalizeCodeLanguage(language) ?? fail() };
  }
  if (type === 'orderedList' && node.attrs !== undefined) {
    const start = record(node.attrs).start;
    if (start !== undefined) {
      if (typeof start !== 'number' || !Number.isSafeInteger(start)) return fail();
      result.attrs = { start };
    }
  }
  if ((type === 'paragraph' || type === 'heading') && node.attrs !== undefined) {
    const attrs = record(node.attrs);
    const textAlign = attrs.textAlign;
    const paragraphIndent = type === 'paragraph' ? attrs.paragraphIndent : undefined;
    const lineHeight = type === 'paragraph' ? attrs.lineHeight : undefined;
    const validated = {
      ...(textAlign === undefined || textAlign === null
        ? {}
        : { textAlign: normalizeTextAlign(textAlign) ?? fail() }),
      ...(paragraphIndent === undefined || paragraphIndent === null
        ? {}
        : { paragraphIndent: normalizeParagraphIndent(paragraphIndent) ?? fail() }),
      ...(lineHeight === undefined || lineHeight === null
        ? {}
        : { lineHeight: normalizeParagraphLineHeight(lineHeight) ?? fail() }),
    };
    if (Object.keys(validated).length) result.attrs = { ...result.attrs, ...validated };
  }
  if (type === 'text') result.text = string(node.text, MAX_FILE_BYTES);
  if (node.content !== undefined) {
    if (type === 'text' || type === 'hardBreak' || type === 'horizontalRule') return fail();
    result.content = array(node.content, 20000)
      .map((child) => validateRichText(child, depth + 1, budget))
      .filter((child) => child.type !== 'text' || child.text !== '');
    const allowed =
      type === 'doc' || type === 'blockquote'
        ? [
            'paragraph',
            'heading',
            'bulletList',
            'orderedList',
            'blockquote',
            'codeBlock',
            'horizontalRule',
            'table',
          ]
        : type === 'paragraph' || type === 'heading'
          ? ['text', 'hardBreak']
          : type === 'codeBlock'
            ? ['text']
            : type === 'listItem'
              ? [
                  'paragraph',
                  'heading',
                  'bulletList',
                  'orderedList',
                  'blockquote',
                  'codeBlock',
                  'horizontalRule',
                  'table',
                ]
              : type === 'table'
                ? ['tableRow']
                : type === 'tableRow'
                  ? ['tableCell', 'tableHeader']
                  : type === 'tableCell' || type === 'tableHeader'
                    ? [
                        'paragraph',
                        'heading',
                        'bulletList',
                        'orderedList',
                        'blockquote',
                        'codeBlock',
                        'horizontalRule',
                        'table',
                      ]
                    : ['listItem'];
    if (result.content.some((child) => !allowed.includes(child.type))) return fail();
    if (type === 'codeBlock' && result.content.some((child) => child.marks?.length)) return fail();
  }
  if (type === 'listItem' && result.content?.[0]?.type !== 'paragraph')
    result.content = [{ type: 'paragraph' }, ...(result.content ?? [])];
  if ((type === 'doc' || type === 'blockquote') && !result.content?.length)
    result.content = [{ type: 'paragraph' }];
  if ((type === 'bulletList' || type === 'orderedList') && !result.content?.length) return fail();
  if (type === 'tableCell' || type === 'tableHeader') {
    if (!result.content?.length) return fail('表格单元格需要包含段落。');
  }
  if (type === 'table') {
    const rows = result.content ?? [];
    if (!rows.length || rows.length > 500) return fail('表格行数必须在 1 到 500 之间。');
    const grid: boolean[][] = rows.map(() => []);
    let width = 0;
    rows.forEach((row, rowIndex) => {
      let column = 0;
      for (const cell of row.content ?? []) {
        while (grid[rowIndex][column]) column++;
        const colspan = cell.attrs?.colspan ?? 1;
        const rowspan = cell.attrs?.rowspan ?? 1;
        if (column + colspan > 100 || rowIndex + rowspan > rows.length)
          return fail('表格合并范围无效。');
        for (let y = rowIndex; y < rowIndex + rowspan; y++)
          for (let x = column; x < column + colspan; x++) {
            if (grid[y][x]) return fail('表格合并范围重叠。');
            grid[y][x] = true;
          }
        column += colspan;
      }
      width = Math.max(width, grid[rowIndex].length);
    });
    if (
      !width ||
      grid.some(
        (row) =>
          row.length !== width ||
          Array.from({ length: width }, (_, index) => row[index]).some((value) => !value),
      )
    )
      return fail('表格各行的列数不一致。');
  }
  if (node.marks !== undefined) {
    if (type !== 'text') return fail();
    result.marks = array(node.marks, 10).map((value) => {
      const mark = record(value);
      const type = oneOf(mark.type, [
        'bold',
        'italic',
        'underline',
        'strike',
        'link',
        'textStyle',
        'highlight',
        'code',
        'superscript',
        'subscript',
      ] as const);
      if (type === 'link') return { type, attrs: { href: link(record(mark.attrs).href) } };
      if (type === 'textStyle') {
        const attrs = record(mark.attrs);
        const fontSize =
          attrs.fontSize == null ? undefined : (normalizeFontSize(attrs.fontSize) ?? fail());
        const color = attrs.color == null ? undefined : (normalizeTextColor(attrs.color) ?? fail());
        if (!fontSize && !color) return fail();
        return { type, attrs: { ...(fontSize ? { fontSize } : {}), ...(color ? { color } : {}) } };
      }
      if (type === 'highlight') {
        const color = normalizeHighlightColor(record(mark.attrs).color) ?? fail();
        return { type, attrs: { color } };
      }
      return { type };
    });
    result.marks = result.marks.reduce<NonNullable<RichTextNode['marks']>>((marks, mark) => {
      const previous = marks.find((value) => value.type === mark.type);
      const next =
        mark.type === 'textStyle' && previous
          ? { ...mark, attrs: { ...previous.attrs, ...mark.attrs } }
          : mark;
      return [...marks.filter((value) => value.type !== mark.type), next];
    }, []);
  }
  return result;
}

export function validateDocument(value: unknown): ResumeDocument {
  const input = record(value);
  const p = record(input.profile);
  const a = record(input.appearance);
  const seen = new Set<string>();
  const id = (value: unknown) => {
    const result = string(value, 100);
    if (!result || seen.has(result)) return fail('文件中的条目标识重复或缺失。');
    seen.add(result);
    return result;
  };
  const photo = string(p.photo, 4 * 1024 * 1024);
  if (photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))
    return fail('头像必须是文件中内嵌的 PNG、JPEG 或 WebP 图片。');
  const accent = string(a.accent, 7);
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return fail();
  const fields = (value: unknown): ResumeField[] =>
    array(value, 50).map((value) => {
      const field = record(value);
      if (
        [
          'name',
          'headline',
          'phone',
          'email',
          'location',
          'website',
          'birthday',
          'employmentStatus',
        ].includes(String(field.id))
      )
        return fail('自定义字段标识与内置字段重复。');
      return {
        id: id(field.id),
        label: string(field.label, 100),
        value: string(field.value, 20000),
        kind: oneOf(field.kind, ['text', 'link', 'multiline']),
        visible: boolean(field.visible),
        showLabel: boolean(field.showLabel),
        ...(field.icon === undefined ? {} : { icon: icon(field.icon) }),
        ...(field.linkLabel === undefined ? {} : { linkLabel: string(field.linkLabel, 300) }),
      };
    });
  const stringList = (value: unknown) => {
    const result = array(value, 100).map((value) => string(value, 100));
    if (new Set(result).size !== result.length) return fail();
    return result;
  };
  const labels = (value: unknown) => {
    const input = record(value);
    if (Object.keys(input).length > 30) return fail();
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [string(key, 100), string(value, 100)]),
    );
  };
  const editableFields = (value: Record<string, unknown>) => ({
    ...(value.customFields === undefined ? {} : { customFields: fields(value.customFields) }),
    ...(value.hiddenFields === undefined ? {} : { hiddenFields: stringList(value.hiddenFields) }),
    ...(value.fieldLabels === undefined ? {} : { fieldLabels: labels(value.fieldLabels) }),
  });
  const entry = (value: unknown): ResumeEntry => {
    const e = record(value);
    return {
      id: id(e.id),
      title: string(e.title, 300),
      subtitle: string(e.subtitle, 300),
      ...(e.degree === undefined ? {} : { degree: string(e.degree, 300) }),
      ...(e.gpa === undefined ? {} : { gpa: string(e.gpa, 300) }),
      startDate: string(e.startDate, 30),
      endDate: string(e.endDate, 30),
      current: boolean(e.current),
      location: string(e.location, 200),
      link: string(e.link, 2048),
      description: validateRichText(e.description),
      ...(e.linkLabel === undefined ? {} : { linkLabel: string(e.linkLabel, 300) }),
      ...(e.logo === undefined ? {} : { logo: raster(e.logo) }),
      ...(e.logoSize === undefined ? {} : { logoSize: numeric(e.logoSize, 20, 96) }),
      ...(e.logoWidth === undefined ? {} : { logoWidth: numeric(e.logoWidth, 8, 200) }),
      ...(e.logoHeight === undefined ? {} : { logoHeight: numeric(e.logoHeight, 8, 200) }),
      ...(e.logoRatio === undefined ? {} : { logoRatio: numeric(e.logoRatio, 8 / 200, 200 / 8) }),
      ...(e.logoRadius === undefined ? {} : { logoRadius: numeric(e.logoRadius, 0, 48) }),
      ...(e.logoVisible === undefined ? {} : { logoVisible: boolean(e.logoVisible) }),
      ...(e.logoPosition === undefined
        ? {}
        : { logoPosition: oneOf(e.logoPosition, ['left', 'right'] as const) }),
      ...(e.logoFit === undefined
        ? {}
        : { logoFit: oneOf(e.logoFit, ['contain', 'cover'] as const) }),
      ...(e.publication === undefined
        ? {}
        : {
            publication: (() => {
              const publication = record(e.publication);
              return {
                authors: string(publication.authors, 20000),
                highlightedAuthor: string(publication.highlightedAuthor, 300),
                venue: string(publication.venue, 1000),
                status: oneOf(publication.status, [
                  'none',
                  'published',
                  'accepted',
                  'preprint',
                  'submitted',
                ] as const),
                citationStyle: oneOf(publication.citationStyle, [
                  'plain',
                  'numbered',
                  'author-year',
                ] as const),
              };
            })(),
          }),
      ...editableFields(e),
      ...(e.visible === undefined ? {} : { visible: boolean(e.visible) }),
      ...(e.dateInput === undefined
        ? {}
        : { dateInput: oneOf(e.dateInput, ['text', 'month'] as const) }),
      ...(e.imageWidth === undefined ? {} : { imageWidth: numeric(e.imageWidth, 5, 100) }),
      ...(e.imageAlign === undefined
        ? {}
        : { imageAlign: oneOf(e.imageAlign, ['left', 'center', 'right'] as const) }),
      ...(e.image === undefined
        ? {}
        : {
            image: (() => {
              const image = string(e.image, 4 * 1024 * 1024);
              if (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))
                return fail();
              return image;
            })(),
          }),
    };
  };
  const sections = array(input.sections, 100).map((value): ResumeSection => {
    const s = record(value);
    return {
      id: id(s.id),
      type: oneOf<SectionType>(s.type, sectionTypes),
      title: string(s.title, 100),
      visible: boolean(s.visible),
      columns:
        s.columns === undefined ? 1 : s.columns === 1 || s.columns === 2 ? s.columns : fail(),
      items: array(s.items, 500).map(entry),
      ...(s.showTitle === undefined ? {} : { showTitle: boolean(s.showTitle) }),
      ...(s.breakBefore === undefined ? {} : { breakBefore: boolean(s.breakBefore) }),
      ...(s.placement === undefined
        ? {}
        : { placement: oneOf(s.placement, ['auto', 'full', 'left', 'right'] as const) }),
    };
  });
  const date = (value: unknown) => {
    const result = string(value, 40);
    return Number.isFinite(Date.parse(result)) ? result : fail();
  };
  return {
    id: id(input.id),
    title: string(input.title, 200),
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt),
    profile: {
      name: string(p.name, 100),
      headline: string(p.headline, 300),
      email: string(p.email, 200),
      phone: string(p.phone, 100),
      location: string(p.location, 200),
      website: string(p.website, 2048),
      photo,
      ...(p.birthday === undefined
        ? {}
        : {
            birthday: (() => {
              const value = string(p.birthday, 10);
              return normalizeBirthDate(value) ?? fail();
            })(),
          }),
      ...(p.employmentStatus === undefined
        ? {}
        : { employmentStatus: string(p.employmentStatus, 100) }),
      ...(p.emailUnderline === undefined ? {} : { emailUnderline: boolean(p.emailUnderline) }),
      ...(p.removedFields === undefined
        ? {}
        : {
            removedFields: stringList(p.removedFields).map((key) =>
              oneOf(key, ['phone', 'email', 'location', 'website', 'birthday', 'employmentStatus']),
            ),
          }),
      ...editableFields(p),
      ...(p.contactOrder === undefined ? {} : { contactOrder: stringList(p.contactOrder) }),
      ...(p.fieldIcons === undefined
        ? {}
        : {
            fieldIcons: (() => {
              const values = record(p.fieldIcons);
              if (Object.keys(values).length > 30) return fail();
              return Object.fromEntries(
                Object.entries(values).map(([key, value]) => [string(key, 100), icon(value)]),
              );
            })(),
          }),
      ...(p.contributions === undefined
        ? {}
        : { contributions: validateContributionCalendar(p.contributions) }),
    },
    sections,
    appearance: {
      template: oneOf<TemplateId>(a.template, templateIds),
      accent,
      font: oneOf(a.font, fontIds),
      fontSize: numeric(a.fontSize, 9, 24),
      lineHeight: numeric(a.lineHeight, 1, 2.5),
      pageMargin: numeric(a.pageMargin, 0, 40),
      sectionGap: numeric(a.sectionGap, 0, 100),
      ...(a.automaticOnePageMinScale === undefined
        ? {}
        : { automaticOnePageMinScale: numeric(a.automaticOnePageMinScale, 0.5, 1) }),
      ...(a.automaticOnePage === undefined
        ? {}
        : { automaticOnePage: boolean(a.automaticOnePage) }),
      headerAlign:
        a.headerAlign === undefined ? 'left' : oneOf(a.headerAlign, ['left', 'center', 'right']),
      headingStyle:
        a.headingStyle === undefined
          ? 'plain'
          : oneOf(a.headingStyle, ['plain', 'highlight', 'underline', 'timeline']),
      photoSize: a.photoSize === undefined ? 78 : numeric(a.photoSize, 20, 180),
      photoShape:
        a.photoShape === undefined
          ? 'rounded'
          : oneOf(a.photoShape, ['square', 'rounded', 'circle']),
      showPhoto: a.showPhoto === undefined ? true : boolean(a.showPhoto),
      ...(a.dateFormat === undefined ? {} : { dateFormat: oneOf(a.dateFormat, dateFormats) }),
      ...(a.language === undefined ? {} : { language: oneOf(a.language, ['zh', 'en'] as const) }),
      ...(a.contactIcons === undefined ? {} : { contactIcons: boolean(a.contactIcons) }),
      ...(a.centerSubtitle === undefined ? {} : { centerSubtitle: boolean(a.centerSubtitle) }),
      ...(a.flexibleHeaderLayout === undefined
        ? {}
        : { flexibleHeaderLayout: boolean(a.flexibleHeaderLayout) }),
      ...(a.headerLayout === undefined
        ? {}
        : { headerLayout: oneOf(a.headerLayout, ['standard', 'stacked'] as const) }),
      ...(a.entryHeadingLayout === undefined
        ? {}
        : {
            entryHeadingLayout: oneOf(a.entryHeadingLayout, [
              'split',
              'stacked',
              'inline',
            ] as const),
          }),
      ...(a.subtitleAlign === undefined
        ? {}
        : { subtitleAlign: oneOf(a.subtitleAlign, ['left', 'center', 'right'] as const) }),
      ...(a.photoFit === undefined
        ? {}
        : { photoFit: oneOf(a.photoFit, ['cover', 'contain'] as const) }),
      ...(a.photoSide === undefined
        ? {}
        : { photoSide: oneOf(a.photoSide, ['left', 'right'] as const) }),
      ...Object.fromEntries(
        (
          [
            ['nameSize', 20, 52],
            ['headingSize', 11, 24],
            ['entryHeadingSize', 9, 32],
            ['entryHeadingGap', 0, 64],
            ['entryGap', 0, 100],
            ['paragraphGap', 0, 50],
            ['photoPositionX', 0, 100],
            ['photoPositionY', 0, 100],
            ['columnRatio', 20, 80],
            ['columnGap', 0, 64],
            ['photoWidth', 20, 200],
            ['photoHeight', 20, 220],
            ['photoAspectRatio', 20 / 220, 200 / 20],
            ['photoRadius', 0, 110],
          ] as const
        )
          .filter(([key]) => a[key] !== undefined)
          .map(([key, min, max]) => [key, numeric(a[key], min, max)]),
      ),
    },
  };
}

export function serializeResume(document: ResumeDocument): string {
  return JSON.stringify({ format: 'luck-resume', version: 1, resume: document }, null, 2);
}

export function serializePortableResume(document: ResumeDocument): string {
  const text = serializeResume(validateDocument(document));
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error('当前原稿超过 64 MB，请压缩配图或将内容拆分为多份简历后保存。');
  return text;
}

function readEnvelope(text: string, limit = MAX_IMPORT_FILE_BYTES): Record<string, unknown> {
  if (new TextEncoder().encode(text).length > limit)
    return fail(`文件超过 ${limit / 1024 / 1024} MB，请选择较小的文件。`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('无法读取 JSON，请检查文件是否完整。');
  }
  return record(parsed);
}

function importedDocument(value: unknown): ResumeDocument {
  const doc = validateDocument(value);
  const now = new Date().toISOString();
  return { ...doc, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}

export function parseResumeFile(text: string): ResumeDocument {
  const envelope = readEnvelope(text, MAX_FILE_BYTES);
  if (envelope.format !== 'luck-resume') return fail('请选择幸运简历导出的 JSON 备份文件。');
  if (envelope.version !== 1) return fail('暂不支持此文件版本，请使用相应版本的幸运简历打开。');
  return importedDocument(envelope.resume);
}

export interface RecoveryResult {
  documents: ResumeDocument[];
  failures: { index: number; record: unknown; reason: string }[];
}

export function parseRecoveryFile(text: string): RecoveryResult {
  const envelope = readEnvelope(text);
  if (envelope.format !== 'luck-resume-recovery') return fail('请选择幸运简历导出的恢复文件。');
  if (envelope.version !== 1) return fail('暂不支持此恢复文件版本。');
  const drafts = array(envelope.drafts, MAX_RECOVERY_RECORDS);
  const result: RecoveryResult = { documents: [], failures: [] };
  drafts.forEach((draft, index) => {
    try {
      const data = record(record(draft).data);
      result.documents.push(importedDocument(data.document));
    } catch (error) {
      result.failures.push({
        index,
        record: draft,
        reason: error instanceof Error ? error.message : '草稿内容不完整。',
      });
    }
  });
  return result;
}

export function parseImportFile(text: string): RecoveryResult & { recovery: boolean } {
  if (readEnvelope(text).format === 'luck-resume-recovery')
    return { ...parseRecoveryFile(text), recovery: true };
  return { documents: [parseResumeFile(text)], failures: [], recovery: false };
}

export function downloadResume(document: ResumeDocument): void {
  const blob = new Blob([serializePortableResume(document)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `${(document.title.trim() || 'resume').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface RecoveryFile {
  name: string;
  blob: Blob;
  canImport: boolean;
}

export function createRecoveryFiles(
  drafts: unknown[],
  maxBytes = MAX_IMPORT_FILE_BYTES,
): RecoveryFile[] {
  const prefix = '{"format":"luck-resume-recovery","version":1,"drafts":[';
  const suffix = ']}';
  const encoder = new TextEncoder();
  const overhead = encoder.encode(prefix + suffix).length;
  const files: RecoveryFile[] = [];
  let parts: string[] = [];
  let bytes = overhead;
  const finish = () => {
    if (!parts.length) return;
    const blob = new Blob([prefix, parts.join(','), suffix], {
      type: 'application/json;charset=utf-8',
    });
    files.push({ name: '', blob, canImport: blob.size <= maxBytes });
    parts = [];
    bytes = overhead;
  };
  for (const draft of drafts) {
    const json = JSON.stringify(draft) ?? 'null';
    const size = encoder.encode(json).length;
    if (parts.length && (bytes + size + 1 > maxBytes || parts.length >= MAX_RECOVERY_RECORDS))
      finish();
    parts.push(json);
    bytes += size + (parts.length > 1 ? 1 : 0);
    if (bytes > maxBytes) finish();
  }
  finish();
  files.forEach((file, index) => {
    file.name =
      files.length === 1 ? 'luck-resume-recovery.json' : `luck-resume-recovery-${index + 1}.json`;
  });
  return files;
}

export function downloadRecoveryFile({ blob, name }: RecoveryFile): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
