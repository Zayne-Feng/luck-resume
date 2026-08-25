import {
  createDocument,
  createEntry,
  createField,
  createSection,
  emptyRichText,
  richText,
  type ResumeDocument,
  type ResumeEntry,
  type ResumeSection,
  type RichTextNode,
  type SectionType,
} from './model.ts';
import { MAX_IMPORT_FILE_BYTES, validateDocument, validateRichText } from './files.ts';
import { parseTableHtml } from './tableInterchange.ts';
import { normalizeResumeLink } from './links.ts';
import { normalizeBirthDate } from './dates.ts';
import { isResumeIcon } from './icons.ts';
import {
  normalizeFontSize,
  normalizeTextAlign,
  normalizeTextColor,
  normalizeParagraphLineHeight,
} from './textFormatting.ts';

type RecordValue = Record<string, unknown>;
export type ReferenceNoteCode =
  | 'unknown'
  | 'style'
  | 'template'
  | 'font'
  | 'identity'
  | 'runtime'
  | 'link'
  | 'media'
  | 'html'
  | 'table'
  | 'date'
  | 'dimension'
  | 'github'
  | 'visibility';
export interface ReferenceImportNote {
  path: string;
  code: ReferenceNoteCode;
  value?: unknown;
}
export interface ReferenceImportCandidate {
  sourceId: string;
  title: string;
  document?: ResumeDocument;
  notes: ReferenceImportNote[];
  error?: string;
}
export interface ReferenceImportResult {
  format: 'raw' | 'batch' | 'legacy' | 'split';
  candidates: ReferenceImportCandidate[];
  notes: ReferenceImportNote[];
}

function record(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path}: expected an object`);
  return value as RecordValue;
}
function string(value: unknown, path: string, limit = 20000): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > limit)
    throw new Error(`${path}: expected a string up to ${limit} characters`);
  return value;
}
function boolean(value: unknown, path: string, fallback = true): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${path}: expected a boolean`);
  return value;
}
function array(value: unknown, path: string, limit = 500): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > limit)
    throw new Error(`${path}: expected an array up to ${limit} items`);
  return value;
}
function decoded(value: unknown, path: string): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${path}: invalid JSON`);
  }
}
function note(
  notes: ReferenceImportNote[],
  path: string,
  code: ReferenceNoteCode,
  value?: unknown,
) {
  const redact = (value: unknown, depth = 0): unknown => {
    if (depth > 50) return '[nested value omitted]';
    if (typeof value === 'string' && /^\s*[\[{]/.test(value) && /"githubKey"\s*:/.test(value)) {
      try {
        return JSON.stringify(redact(JSON.parse(value), depth + 1));
      } catch {
        return value;
      }
    }
    if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          key === 'githubKey' && item ? '[credential omitted]' : redact(item, depth + 1),
        ]),
      );
    return value;
  };
  notes.push({ path, code, ...(value === undefined ? {} : { value: redact(value) }) });
}
function unknownKeys(
  input: RecordValue,
  keys: string[],
  path: string,
  notes: ReferenceImportNote[],
) {
  for (const [key, value] of Object.entries(input)) {
    if (!keys.includes(key)) note(notes, `${path}.${key}`, 'unknown', value);
  }
}
function safeRaster(value: unknown, path: string, notes: ReferenceImportNote[]): string {
  const source = string(value, path, 4 * 1024 * 1024);
  if (!source || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(source))
    return source;
  note(notes, path, 'media', source);
  return '';
}
function safeLink(value: unknown, path: string, notes: ReferenceImportNote[]): string {
  const source = string(value, path, 2048);
  if (!source) return '';
  const safe = normalizeResumeLink(source);
  if (safe) return safe;
  note(notes, path, 'link', source);
  return '';
}

type Mark = NonNullable<RichTextNode['marks']>[number];
interface HtmlResult {
  content: RichTextNode;
  images: string[];
}

function htmlContent(value: unknown, path: string, notes: ReferenceImportNote[]): HtmlResult {
  const source = string(value, path, 16 * 1024 * 1024);
  if (!/<\/?[a-z][^>]*>|&#?\w+;/i.test(source))
    return { content: richText(...source.split(/\r?\n/)), images: [] };
  if (typeof DOMParser === 'undefined')
    throw new Error(`${path}: HTML conversion requires a browser`);
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  for (const element of [...parsed.head.children])
    note(notes, `${path}.head`, 'html', element.outerHTML);
  const body = parsed.body;
  for (const container of [parsed.documentElement, body])
    for (const attr of [...container.attributes])
      note(notes, `${path}.${container.tagName.toLowerCase()}.${attr.name}`, 'html', attr.value);
  const images: string[] = [];
  let count = 0;
  const color = (value: string): string | undefined => {
    if (normalizeTextColor(value)) return value;
    const match = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(value);
    return match && match.slice(1).every((part) => Number(part) <= 255)
      ? `#${match
          .slice(1)
          .map((part) => Number(part).toString(16).padStart(2, '0'))
          .join('')}`
      : undefined;
  };
  const walk = (node: Node, inherited: Mark[] = [], depth = 0): RichTextNode[] => {
    if (++count > 100000 || depth > 35) throw new Error(`${path}: HTML structure is too complex`);
    if (node.nodeType === 3)
      return node.textContent
        ? [
            {
              type: 'text',
              text: node.textContent,
              ...(inherited.length ? { marks: inherited } : {}),
            },
          ]
        : [];
    if (node.nodeType !== 1) return [];
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (
      [
        'script',
        'style',
        'iframe',
        'object',
        'embed',
        'svg',
        'math',
        'template',
        'link',
        'meta',
      ].includes(tag)
    ) {
      note(notes, path, 'html', element.outerHTML);
      return [];
    }
    if (tag === 'img') {
      const image = safeRaster(element.getAttribute('src') ?? '', `${path}.img.src`, notes);
      if (image) images.push(image);
      const alt = element.getAttribute('alt');
      note(notes, path, 'html', {
        tag,
        placement: 'separate-image-entry',
        attributes: Object.fromEntries(
          [...element.attributes]
            .filter((attr) => attr.name !== 'src')
            .map((attr) => [attr.name, attr.value]),
        ),
      });
      return alt
        ? [{ type: 'text', text: alt, ...(inherited.length ? { marks: inherited } : {}) }]
        : [];
    }
    const marks = [...inherited];
    const add = (mark: Mark) => {
      const found = marks.findIndex((item) => item.type === mark.type);
      if (found < 0) marks.push(mark);
      else marks[found] = mark;
    };
    const markTypes: Record<string, string> = {
      b: 'bold',
      strong: 'bold',
      i: 'italic',
      em: 'italic',
      u: 'underline',
      s: 'strike',
      del: 'strike',
      strike: 'strike',
      code: 'code',
      sub: 'subscript',
      sup: 'superscript',
    };
    if (markTypes[tag]) add({ type: markTypes[tag] });
    if (tag === 'a') {
      const href = safeLink(element.getAttribute('href') ?? '', `${path}.a.href`, notes);
      if (href) add({ type: 'link', attrs: { href } });
    }
    const css = element.style;
    const consumed = new Set<string>();
    if (css.fontWeight) {
      if (css.fontWeight === 'bold' || Number(css.fontWeight) >= 600) {
        add({ type: 'bold' });
        consumed.add('font-weight');
      }
    }
    if (css.fontStyle === 'italic') {
      add({ type: 'italic' });
      consumed.add('font-style');
    }
    if (/underline/.test(css.textDecoration || css.textDecorationLine)) {
      add({ type: 'underline' });
      consumed.add(css.textDecoration ? 'text-decoration' : 'text-decoration-line');
    }
    if (/line-through/.test(css.textDecoration || css.textDecorationLine)) {
      add({ type: 'strike' });
      consumed.add(css.textDecoration ? 'text-decoration' : 'text-decoration-line');
    }
    if (css.verticalAlign === 'sub' || css.verticalAlign === 'super') {
      add({ type: css.verticalAlign === 'sub' ? 'subscript' : 'superscript' });
      consumed.add('vertical-align');
    }
    const fontSize = normalizeFontSize(css.fontSize);
    const textColor = color(css.color);
    if (fontSize || textColor) {
      const previous = marks.find((mark) => mark.type === 'textStyle')?.attrs;
      add({
        type: 'textStyle',
        attrs: {
          ...previous,
          ...(fontSize ? { fontSize } : {}),
          ...(textColor ? { color: textColor } : {}),
        },
      });
      if (fontSize) consumed.add('font-size');
      if (textColor) consumed.add('color');
    }
    const background = color(css.backgroundColor);
    if (background || tag === 'mark') {
      add({ type: 'highlight', attrs: { color: background ?? '#ffff00' } });
      if (background) consumed.add('background-color');
    }
    const align = normalizeTextAlign(css.textAlign || element.getAttribute('align'));
    const lineHeight = normalizeParagraphLineHeight(Number(css.lineHeight));
    const isTextBlock = /^(p|div|td|th|h[1-6])$/.test(tag);
    if (isTextBlock && align) consumed.add('text-align');
    if (isTextBlock && tag[0] !== 'h' && lineHeight) consumed.add('line-height');
    const unhandledStyles = [...css]
      .filter((key) => !consumed.has(key))
      .map((key) => `${key}: ${css.getPropertyValue(key)}`);
    if (unhandledStyles.length) note(notes, path, 'style', unhandledStyles);
    const attrNames = [
      'style',
      ...(tag === 'a' ? ['href', 'target', 'rel'] : []),
      ...(isTextBlock && align ? ['align'] : []),
      ...(tag === 'ol' ? ['start'] : []),
      ...(['td', 'th'].includes(tag) ? ['colspan', 'rowspan', 'data-colwidth'] : []),
    ];
    for (const attr of [...element.attributes])
      if (!attrNames.includes(attr.name))
        note(notes, `${path}.${tag}.${attr.name}`, 'html', attr.value);
    if (tag === 'br') return [{ type: 'hardBreak' }];
    if (tag === 'hr') return [{ type: 'horizontalRule' }];
    if (tag === 'table') {
      const rows = [...element.querySelectorAll('tr')].filter(
        (row) => row.closest('table') === element,
      );
      const convertedRows = rows.map((row) =>
        [...row.children].map((cell) => blocks(walk(cell, marks, depth + 1))),
      );
      try {
        const table = parseTableHtml(element.outerHTML);
        if (
          table.content?.length !== convertedRows.length ||
          table.content.some((row, index) => row.content?.length !== convertedRows[index].length)
        )
          throw new Error('Table cell structure differs from the source');
        table.content.forEach((row, rowIndex) =>
          row.content!.forEach((cell, columnIndex) => {
            cell.content = convertedRows[rowIndex][columnIndex];
          }),
        );
        return validateRichText({ type: 'doc', content: [table] }).content!;
      } catch (error) {
        note(notes, path, 'table', {
          reason: error instanceof Error ? error.message : String(error),
          source: element.outerHTML,
        });
        return convertedRows.map((row) => ({
          type: 'paragraph',
          content: row.flatMap((cell, index) => [
            ...(index ? [{ type: 'text', text: ' | ' }] : []),
            ...inline(cell),
          ]),
        }));
      }
    }
    if (tag === 'pre')
      return [
        {
          type: 'codeBlock',
          content: element.textContent ? [{ type: 'text', text: element.textContent }] : [],
        },
      ];
    const children = [...element.childNodes].flatMap((child) => walk(child, marks, depth + 1));
    if (tag === 'ul' || tag === 'ol') {
      const start = element.getAttribute('start');
      const startNumber = start === null ? undefined : Number(start);
      if (start !== null && !Number.isSafeInteger(startNumber))
        note(notes, `${path}.ol.start`, 'html', start);
      return [
        {
          type: tag === 'ul' ? 'bulletList' : 'orderedList',
          ...(startNumber !== undefined && Number.isSafeInteger(startNumber)
            ? { attrs: { start: startNumber } }
            : {}),
          content: children
            .filter((child) => child.type !== 'text' || child.text?.trim())
            .map((child) =>
              child.type === 'listItem' ? child : { type: 'listItem', content: blocks([child]) },
            ),
        },
      ];
    }
    if (tag === 'li' || tag === 'blockquote')
      return [{ type: tag === 'li' ? 'listItem' : 'blockquote', content: blocks(children) }];
    if (/^h[1-6]$/.test(tag)) {
      const level = Math.min(Number(tag[1]), 4);
      if (Number(tag[1]) > 4)
        note(notes, path, 'style', { headingLevel: Number(tag[1]), convertedLevel: level });
      return [
        {
          type: 'heading',
          attrs: { level, ...(align ? { textAlign: align } : {}) },
          content: inline(children),
        },
      ];
    }
    if (tag === 'p' || tag === 'div' || tag === 'td' || tag === 'th')
      return blocks(children).map((child) =>
        child.type === 'paragraph'
          ? {
              ...child,
              attrs: {
                ...(align ? { textAlign: align } : {}),
                ...(lineHeight ? { lineHeight } : {}),
                ...child.attrs,
              },
            }
          : child,
      );
    if (!markTypes[tag] && !['span', 'a', 'mark', 'td', 'th'].includes(tag))
      note(notes, path, 'html', { tag, conversion: 'children-retained' });
    return children;
  };
  const content = blocks([...body.childNodes].flatMap((node) => walk(node)));
  return {
    content: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] },
    images,
  };
}

function inline(nodes: RichTextNode[]): RichTextNode[] {
  return nodes.flatMap((node) =>
    node.type === 'text' || node.type === 'hardBreak'
      ? [node]
      : [...inline(node.content ?? []), { type: 'hardBreak' }],
  );
}
function blocks(nodes: RichTextNode[]): RichTextNode[] {
  const output: RichTextNode[] = [];
  let run: RichTextNode[] = [];
  const flush = () => {
    if (run.length) output.push({ type: 'paragraph', content: run });
    run = [];
  };
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'hardBreak') run.push(node);
    else {
      flush();
      output.push(node);
    }
  }
  flush();
  return output.length ? output : [{ type: 'paragraph' }];
}

function convertDocument(input: unknown, notes: ReferenceImportNote[]): ResumeDocument {
  const source = record(input, 'resume');
  const basic = record(source.basic, 'basic');
  const doc = createDocument();
  doc.sections = [];
  doc.title = string(source.title, 'title', 200) || 'Imported resume';
  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (source[key] !== undefined) {
      const date = string(source[key], key, 40);
      if (!Number.isFinite(Date.parse(date))) throw new Error(`${key}: invalid timestamp`);
      doc[key] = date;
    }
  }
  note(notes, 'id', 'identity', source.id);
  if (source.templateId !== undefined) note(notes, 'templateId', 'template', source.templateId);
  for (const key of ['activeSection', 'draggingProjectId'])
    if (source[key] !== undefined) note(notes, key, 'runtime', source[key]);
  unknownKeys(
    source,
    [
      'id',
      'title',
      'createdAt',
      'updatedAt',
      'templateId',
      'basic',
      'education',
      'experience',
      'projects',
      'publications',
      'certificates',
      'customData',
      'skillContent',
      'selfEvaluationContent',
      'menuSections',
      'globalSettings',
      'activeSection',
      'draggingProjectId',
    ],
    'resume',
    notes,
  );
  const profile = doc.profile;
  const profileMap = {
    name: 'name',
    title: 'headline',
    email: 'email',
    phone: 'phone',
    location: 'location',
    employementStatus: 'employmentStatus',
  } as const;
  const profileLimits = {
    name: 100,
    title: 300,
    email: 200,
    phone: 100,
    location: 200,
    employementStatus: 100,
  };
  for (const [from, to] of Object.entries(profileMap))
    profile[to] = string(
      basic[from],
      `basic.${from}`,
      profileLimits[from as keyof typeof profileLimits],
    );
  profile.photo = safeRaster(basic.photo, 'basic.photo', notes);
  if (basic.emailUnderline !== undefined)
    profile.emailUnderline = boolean(basic.emailUnderline, 'basic.emailUnderline');
  const birthday = string(basic.birthDate, 'basic.birthDate', 100);
  if (birthday) {
    const normalized = normalizeBirthDate(birthday);
    if (normalized !== undefined) profile.birthday = normalized;
    else {
      profile.customFields = [{ ...createField('Birth date'), value: birthday }];
      note(notes, 'basic.birthDate', 'date', birthday);
    }
  }
  const fieldIdMap = new Map<string, string>(Object.entries(profileMap));
  fieldIdMap.set(
    'birthDate',
    birthday && profile.birthday === undefined ? profile.customFields![0].id : 'birthday',
  );
  for (const [index, raw] of array(basic.customFields, 'basic.customFields', 50).entries()) {
    const path = `basic.customFields[${index}]`;
    const value = record(raw, path);
    const displayLabel = boolean(value.displayLabel, `${path}.displayLabel`, false);
    const field = {
      ...createField(string(value.label, `${path}.label`, 100)),
      value: string(value.value, `${path}.value`),
      visible: boolean(value.visible, `${path}.visible`),
      showLabel: !displayLabel,
    };
    if (displayLabel) {
      const href = safeLink(field.value, `${path}.value`, notes);
      if (href) {
        field.kind = 'link';
        if (field.label) field.linkLabel = field.label;
      } else note(notes, `${path}.displayLabel`, 'style', value.displayLabel);
    }
    if (value.icon !== undefined) {
      if (isResumeIcon(value.icon)) field.icon = String(value.icon);
      else note(notes, `${path}.icon`, 'style', value.icon);
    }
    if (typeof value.id === 'string') fieldIdMap.set(value.id, field.id);
    profile.customFields = [...(profile.customFields ?? []), field];
    unknownKeys(
      value,
      ['id', 'label', 'value', 'icon', 'visible', 'custom', 'displayLabel'],
      path,
      notes,
    );
    if (value.custom !== undefined) note(notes, `${path}.custom`, 'runtime', value.custom);
  }
  profile.hiddenFields = [];
  profile.contactOrder = [];
  profile.fieldLabels = {};
  for (const [index, raw] of array(basic.fieldOrder, 'basic.fieldOrder', 100).entries()) {
    const path = `basic.fieldOrder[${index}]`;
    const value = record(raw, path);
    const key = string(value.key, `${path}.key`, 100);
    const mapped =
      fieldIdMap.get(key) ?? (typeof value.id === 'string' ? fieldIdMap.get(value.id) : undefined);
    if (mapped) {
      if (!profile.contactOrder.includes(mapped)) profile.contactOrder.push(mapped);
      if (!boolean(value.visible, `${path}.visible`)) profile.hiddenFields.push(mapped);
      if (value.label !== undefined)
        profile.fieldLabels[mapped] = string(value.label, `${path}.label`, 100);
    } else note(notes, path, 'unknown', value);
    if (value.type !== undefined) note(notes, `${path}.type`, 'runtime', value.type);
    if (value.custom !== undefined) note(notes, `${path}.custom`, 'runtime', value.custom);
    unknownKeys(value, ['id', 'key', 'label', 'visible', 'type', 'custom'], path, notes);
  }
  profile.hiddenFields = [...new Set(profile.hiddenFields)];
  const sourceContacts =
    basic.fieldOrder === undefined
      ? ['email']
      : array(basic.fieldOrder, 'basic.fieldOrder', 100).map((value) =>
          String(record(value, 'basic.fieldOrder').key),
        );
  for (const sourceKey of ['email', 'phone', 'location', 'birthDate', 'employementStatus']) {
    const mapped = fieldIdMap.get(sourceKey)!;
    if (!sourceContacts.includes(sourceKey) && !profile.hiddenFields.includes(mapped))
      profile.hiddenFields.push(mapped);
  }
  for (const field of profile.customFields ?? []) {
    if (profile.hiddenFields.includes(field.id)) field.visible = false;
    if (profile.fieldLabels[field.id] !== undefined) field.label = profile.fieldLabels[field.id];
  }
  if (basic.icons !== undefined) {
    profile.fieldIcons = {};
    for (const [key, value] of Object.entries(record(basic.icons, 'basic.icons'))) {
      const mapped = fieldIdMap.get(key);
      if (mapped && isResumeIcon(value)) profile.fieldIcons[mapped] = String(value);
      else note(notes, `basic.icons.${key}`, 'style', value);
    }
  }
  if (basic.layout !== undefined) {
    if (!['left', 'center', 'right'].includes(String(basic.layout)))
      throw new Error('basic.layout: invalid alignment');
    doc.appearance.headerAlign = basic.layout as 'left' | 'center' | 'right';
  }
  const username = string(basic.githubUseName, 'basic.githubUseName', 200);
  if (basic.githubContributionsVisible !== undefined)
    boolean(basic.githubContributionsVisible, 'basic.githubContributionsVisible');
  if (basic.githubKey !== undefined) string(basic.githubKey, 'basic.githubKey');
  if (username) {
    profile.customFields = [
      ...(profile.customFields ?? []),
      {
        ...createField('GitHub', 'link'),
        value: safeLink(
          `https://github.com/${encodeURIComponent(username)}`,
          'basic.githubUseName',
          notes,
        ),
        visible: boolean(
          basic.githubContributionsVisible,
          'basic.githubContributionsVisible',
          false,
        ),
      },
    ];
  }
  for (const key of ['githubKey', 'githubContributionsVisible'])
    if (basic[key] !== undefined)
      note(
        notes,
        `basic.${key}`,
        'github',
        key === 'githubKey' && basic[key] ? '[credential omitted]' : basic[key],
      );
  unknownKeys(
    basic,
    [
      'name',
      'title',
      'email',
      'phone',
      'location',
      'employementStatus',
      'photo',
      'birthDate',
      'emailUnderline',
      'customFields',
      'fieldOrder',
      'icons',
      'photoConfig',
      'githubKey',
      'githubUseName',
      'githubContributionsVisible',
      'layout',
    ],
    'basic',
    notes,
  );
  const dimensions = (
    raw: unknown,
    path: string,
    target: ResumeEntry | ResumeDocument['appearance'],
    photo: boolean,
  ) => {
    if (raw === undefined) return;
    const config = record(raw, path);
    const prefix = photo ? 'photo' : 'logo';
    const values = target as unknown as RecordValue;
    for (const [key, min, max] of [
      ['width', photo ? 20 : 8, 200],
      ['height', photo ? 20 : 8, photo ? 220 : 200],
    ] as const) {
      if (config[key] === undefined) continue;
      const value = config[key];
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error(`${path}.${key}: invalid number`);
      if (value < min || value > max) note(notes, `${path}.${key}`, 'dimension', value);
      values[`${prefix}${key[0].toUpperCase()}${key.slice(1)}`] = Math.max(
        min,
        Math.min(max, value),
      );
    }
    if (config.visible !== undefined)
      values[photo ? 'showPhoto' : 'logoVisible'] = boolean(config.visible, `${path}.visible`);
    if (config.borderRadius !== undefined) {
      const radius = config.borderRadius;
      const custom = config.customBorderRadius;
      if (radius === 'custom' && (typeof custom !== 'number' || !Number.isFinite(custom)))
        throw new Error(`${path}.customBorderRadius: invalid number`);
      const maximum = photo ? 110 : 48;
      if (radius === 'none' || radius === 'medium' || radius === 'full' || radius === 'custom') {
        values[`${prefix}Radius`] =
          radius === 'none'
            ? 0
            : radius === 'medium'
              ? 8
              : radius === 'full'
                ? maximum
                : Math.max(0, Math.min(maximum, custom as number));
        if (radius === 'custom' && ((custom as number) < 0 || (custom as number) > maximum))
          note(notes, `${path}.customBorderRadius`, 'dimension', custom);
      } else note(notes, `${path}.borderRadius`, 'style', radius);
    }
    if (config.aspectRatio !== undefined)
      note(notes, `${path}.aspectRatio`, 'style', config.aspectRatio);
    if (config.customBorderRadius !== undefined && config.borderRadius !== 'custom')
      note(notes, `${path}.customBorderRadius`, 'runtime', config.customBorderRadius);
    unknownKeys(
      config,
      ['width', 'height', 'visible', 'borderRadius', 'customBorderRadius', 'aspectRatio'],
      path,
      notes,
    );
  };
  dimensions(basic.photoConfig, 'basic.photoConfig', doc.appearance, true);
  const menu = array(source.menuSections, 'menuSections', 100)
    .map((raw, index) => {
      const path = `menuSections[${index}]`;
      const value = record(raw, path);
      const id = string(value.id, `${path}.id`, 100);
      if (!id) throw new Error(`${path}.id: missing section ID`);
      const order = value.order === undefined ? index : value.order;
      if (typeof order !== 'number' || !Number.isFinite(order))
        throw new Error(`${path}.order: invalid number`);
      if (value.icon !== undefined) note(notes, `${path}.icon`, 'style', value.icon);
      unknownKeys(value, ['id', 'title', 'enabled', 'order', 'icon'], path, notes);
      return {
        id,
        title: string(value.title, `${path}.title`, 100),
        visible: boolean(value.enabled, `${path}.enabled`),
        order,
      };
    })
    .sort((a, b) => a.order - b.order);
  if (new Set(menu.map((item) => item.id)).size !== menu.length)
    throw new Error('menuSections: duplicate section IDs');
  if (menu.find((item) => item.id === 'basic')?.visible === false) {
    profile.hiddenFields = [
      ...new Set([
        ...profile.hiddenFields,
        'name',
        'headline',
        'email',
        'phone',
        'location',
        'birthday',
        'employmentStatus',
        ...(profile.customFields ?? []).map((field) => field.id),
      ]),
    ];
    doc.appearance.showPhoto = false;
    for (const field of profile.customFields ?? []) field.visible = false;
    note(notes, 'menuSections.basic', 'visibility');
  }
  const sections = new Map<string, ResumeSection>();
  const getSection = (key: string, type: SectionType) => {
    const existing = sections.get(key);
    if (existing) return existing;
    const section = createSection(type);
    section.items = [];
    const info = menu.find((item) => item.id === key);
    if (info) {
      section.title = info.title;
      section.visible = info.visible;
    } else if (
      ![
        'education',
        'experience',
        'projects',
        'publications',
        'certificates',
        'skills',
        'selfEvaluation',
      ].includes(key)
    )
      section.title = key;
    sections.set(key, section);
    return section;
  };
  const addHtml = (entry: ResumeEntry, raw: unknown, path: string, section: ResumeSection) => {
    const html = htmlContent(raw, path, notes);
    entry.description = html.content;
    section.items.push(entry);
    for (const image of html.images)
      section.items.push({
        ...createEntry(),
        image,
        description: emptyRichText(),
        visible: entry.visible,
      });
  };
  const dateRange = (entry: ResumeEntry, raw: unknown, path: string) => {
    const value = string(raw, path, 1000);
    const match =
      /^(\d{4}(?:[./-]\d{1,2})?(?:[./-]\d{1,2})?)\s*(?:\s+-\s+|[~～—–至])\s*(\d{4}(?:[./-]\d{1,2})?(?:[./-]\d{1,2})?|至今|现在|present|current)$/i.exec(
        value.trim(),
      );
    if (match) {
      entry.startDate = match[1];
      entry.endDate = match[2];
      entry.current = /^(至今|现在|present|current)$/i.test(match[2]);
    } else if (value.length <= 30) entry.startDate = value;
    else {
      entry.customFields = [{ ...createField('Date'), value }];
      note(notes, path, 'date', value);
    }
  };
  const categories: [string, SectionType, Record<string, keyof ResumeEntry>, string, string[]][] = [
    [
      'education',
      'education',
      {
        school: 'title',
        major: 'subtitle',
        degree: 'degree',
        gpa: 'gpa',
        startDate: 'startDate',
        endDate: 'endDate',
      },
      'description',
      ['school', 'major', 'degree', 'gpa', 'startDate', 'endDate'],
    ],
    [
      'experience',
      'experience',
      { company: 'title', position: 'subtitle' },
      'details',
      ['company', 'position', 'date'],
    ],
    [
      'projects',
      'projects',
      { name: 'title', role: 'subtitle', linkLabel: 'linkLabel' },
      'description',
      ['name', 'role', 'date', 'link', 'linkLabel'],
    ],
    [
      'publications',
      'publications',
      { title: 'title' },
      'description',
      ['title', 'authors', 'highlightedAuthor', 'venue', 'date', 'status', 'link'],
    ],
  ];
  for (const [key, type, fields, description, allowed] of categories) {
    const values = array(source[key], key);
    if (!values.length && !menu.some((item) => item.id === key)) continue;
    const section = getSection(key, type);
    for (const [index, raw] of values.entries()) {
      const path = `${key}[${index}]`;
      const value = record(raw, path);
      const entry = createEntry();
      entry.visible = boolean(value.visible, `${path}.visible`);
      for (const [from, to] of Object.entries(fields))
        (entry as unknown as RecordValue)[to] = string(
          value[from],
          `${path}.${from}`,
          from.endsWith('Date') ? 30 : 300,
        );
      if (value.date !== undefined) dateRange(entry, value.date, `${path}.date`);
      if (value.link !== undefined) entry.link = safeLink(value.link, `${path}.link`, notes);
      if (value.logo !== undefined) entry.logo = safeRaster(value.logo, `${path}.logo`, notes);
      dimensions(value.logoConfig, `${path}.logoConfig`, entry, false);
      if (key === 'publications') {
        const status = string(value.status, `${path}.status`, 100);
        if (!['', 'published', 'accepted', 'preprint', 'submitted'].includes(status))
          throw new Error(`${path}.status: unsupported publication status`);
        entry.publication = {
          authors: string(value.authors, `${path}.authors`),
          highlightedAuthor: string(value.highlightedAuthor, `${path}.highlightedAuthor`, 300),
          venue: string(value.venue, `${path}.venue`, 1000),
          status: status ? (status as 'published' | 'accepted' | 'preprint' | 'submitted') : 'none',
          citationStyle: 'plain',
        };
      }
      addHtml(entry, value[description], `${path}.${description}`, section);
      unknownKeys(
        value,
        ['id', 'visible', 'logo', 'logoConfig', description, ...allowed],
        path,
        notes,
      );
    }
  }
  for (const [key, rawKey, type] of [
    ['skills', 'skillContent', 'skills'],
    ['selfEvaluation', 'selfEvaluationContent', 'summary'],
  ] as const) {
    if (source[rawKey] || menu.some((item) => item.id === key))
      addHtml(createEntry(), source[rawKey], rawKey, getSection(key, type));
    else if (source[rawKey] !== undefined) string(source[rawKey], rawKey);
  }
  const certificates = array(source.certificates, 'certificates');
  if (certificates.length || menu.some((item) => item.id === 'certificates')) {
    const section = getSection('certificates', 'certifications');
    for (const [index, raw] of certificates.entries()) {
      const path = `certificates[${index}]`;
      const value = record(raw, path);
      const entry = createEntry();
      entry.image = safeRaster(value.url, `${path}.url`, notes);
      if (value.width !== undefined) {
        if (typeof value.width !== 'number' || !Number.isFinite(value.width))
          throw new Error(`${path}.width: invalid number`);
        entry.imageWidth = Math.max(5, Math.min(100, value.width));
        if (entry.imageWidth !== value.width)
          note(notes, `${path}.width`, 'dimension', value.width);
      }
      section.items.push(entry);
      unknownKeys(value, ['id', 'url', 'width'], path, notes);
    }
  }
  if (source.customData !== undefined) {
    const custom = record(source.customData, 'customData');
    for (const [key, items] of Object.entries(custom)) {
      if (sections.has(key) || key === 'basic')
        throw new Error(`customData.${key}: section ID conflicts with a built-in section`);
      const section = getSection(key, 'custom');
      for (const [index, raw] of array(items, `customData.${key}`).entries()) {
        const path = `customData.${key}[${index}]`;
        const value = record(raw, path);
        const entry = {
          ...createEntry(),
          title: string(value.title, `${path}.title`, 300),
          subtitle: string(value.subtitle, `${path}.subtitle`, 300),
          visible: boolean(value.visible, `${path}.visible`),
        };
        dateRange(entry, value.dateRange, `${path}.dateRange`);
        addHtml(entry, value.description, `${path}.description`, section);
        unknownKeys(
          value,
          ['id', 'title', 'subtitle', 'visible', 'dateRange', 'description'],
          path,
          notes,
        );
      }
    }
  }
  for (const item of menu)
    if (item.id !== 'basic' && !sections.has(item.id)) getSection(item.id, 'custom');
  doc.sections = [
    ...menu.flatMap((item) => (sections.has(item.id) ? [sections.get(item.id)!] : [])),
    ...[...sections]
      .filter(([key]) => !menu.some((item) => item.id === key))
      .map(([, section]) => section),
  ];
  if (source.globalSettings !== undefined) {
    const settings = record(source.globalSettings, 'globalSettings');
    const numericSettings = {
      baseFontSize: ['fontSize', 9, 24],
      pagePadding: ['pageMargin', 0, 40],
      paragraphSpacing: ['paragraphGap', 0, 50],
      lineHeight: ['lineHeight', 1, 2.5],
      sectionSpacing: ['sectionGap', 0, 100],
      headerSize: ['headingSize', 11, 24],
      subheaderSize: ['entryHeadingSize', 9, 32],
    } as const;
    for (const [from, [to, min, max]] of Object.entries(numericSettings)) {
      if (settings[from] === undefined) continue;
      const original = settings[from];
      const value =
        from === 'pagePadding' && typeof original === 'number' ? (original * 25.4) / 96 : original;
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error(`globalSettings.${from}: invalid number`);
      doc.appearance[to] = Math.max(min, Math.min(max, value));
      if (doc.appearance[to] !== value)
        note(notes, `globalSettings.${from}`, 'dimension', original);
    }
    for (const [from, to] of Object.entries({
      useIconMode: 'contactIcons',
      centerSubtitle: 'centerSubtitle',
      flexibleHeaderLayout: 'flexibleHeaderLayout',
      autoOnePage: 'automaticOnePage',
    } as const))
      if (settings[from] !== undefined)
        doc.appearance[to] = boolean(settings[from], `globalSettings.${from}`);
    if (settings.themeColor !== undefined) {
      const color = normalizeTextColor(settings.themeColor);
      if (color) doc.appearance.accent = color;
      else note(notes, 'globalSettings.themeColor', 'style', settings.themeColor);
    }
    if (settings.fontFamily !== undefined)
      note(notes, 'globalSettings.fontFamily', 'font', settings.fontFamily);
    if (settings.dateFormat !== undefined) {
      const format = settings.dateFormat === 'short-month' ? 'MMM YYYY' : settings.dateFormat;
      if (['YYYY/MM', 'YYYY.MM', 'YYYY-MM', 'MM/YYYY', 'MMM YYYY'].includes(String(format)))
        doc.appearance.dateFormat = format as ResumeDocument['appearance']['dateFormat'];
      else note(notes, 'globalSettings.dateFormat', 'style', settings.dateFormat);
    }
    unknownKeys(
      settings,
      [
        ...Object.keys(numericSettings),
        'themeColor',
        'fontFamily',
        'dateFormat',
        'useIconMode',
        'centerSubtitle',
        'flexibleHeaderLayout',
        'autoOnePage',
      ],
      'globalSettings',
      notes,
    );
  }
  return validateDocument(doc);
}

export function parseReferenceImport(text: string): ReferenceImportResult {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_FILE_BYTES)
    throw new Error('文件超过 64 MB，请选择较小的文件。');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('无法读取 JSON，请检查文件是否完整。');
  }
  const result: ReferenceImportResult = { format: 'raw', candidates: [], notes: [] };
  let sources: [string, unknown][];
  if (Array.isArray(input)) {
    result.format = 'batch';
    sources = input.map((item, index) => [String(index), item]);
  } else {
    let root = record(input, 'input');
    if (root['resume-storage'] !== undefined) {
      const legacy = decoded(root['resume-storage'], 'resume-storage');
      for (const key of Object.keys(root))
        if (key !== 'resume-storage') note(result.notes, key, 'unknown', root[key]);
      root = record(legacy, 'resume-storage');
    }
    if (root.basic !== undefined)
      sources = [[typeof root.id === 'string' ? root.id : 'resume', root]];
    else if (root.state !== undefined || root.resumes !== undefined) {
      result.format = 'legacy';
      const state = root.state === undefined ? root : record(root.state, 'state');
      const resumes = state.resumes;
      if (resumes === undefined) throw new Error('state.resumes: missing documents');
      sources = Array.isArray(resumes)
        ? resumes.map((item, index) => [String(index), item])
        : Object.entries(record(resumes, 'state.resumes'));
      unknownKeys(
        state,
        ['resumes', 'activeResumeId', 'currentResumeId', 'currentResume'],
        'state',
        result.notes,
      );
      for (const key of ['activeResumeId', 'currentResumeId', 'currentResume'])
        if (state[key] !== undefined) note(result.notes, `state.${key}`, 'runtime', state[key]);
      if (root.version !== undefined) note(result.notes, 'version', 'runtime', root.version);
      if (root.state !== undefined) unknownKeys(root, ['state', 'version'], 'input', result.notes);
    } else if (root['magic-resume-index'] !== undefined || root.index !== undefined) {
      result.format = 'split';
      const index = record(decoded(root['magic-resume-index'] ?? root.index, 'index'), 'index');
      const ids = array(index.ids, 'index.ids', 1000).map((id) => string(id, 'index.ids', 100));
      if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) => !id))
        throw new Error('index.ids: expected unique document IDs');
      const documents = root.documents === undefined ? root : record(root.documents, 'documents');
      const keys = Object.keys(documents).filter(
        (key) => root.documents !== undefined || key.startsWith('magic-resume-doc:'),
      );
      const allIds = [...ids];
      for (const key of keys) {
        const id = key.replace(/^magic-resume-doc:/, '');
        if (key === id && Object.hasOwn(documents, `magic-resume-doc:${id}`))
          note(result.notes, `documents.${key}`, 'unknown', documents[key]);
        if (!allIds.includes(id)) {
          allIds.push(id);
          note(
            result.notes,
            `documents.${key}`,
            'unknown',
            'Document not referenced by index; included for review',
          );
        }
      }
      sources = allIds.map((id) => [
        id,
        Object.hasOwn(documents, `magic-resume-doc:${id}`)
          ? documents[`magic-resume-doc:${id}`]
          : Object.hasOwn(documents, id)
            ? documents[id]
            : undefined,
      ]);
      unknownKeys(index, ['ids', 'activeResumeId', 'version'], 'index', result.notes);
      if (index.activeResumeId !== undefined)
        note(result.notes, 'index.activeResumeId', 'runtime', index.activeResumeId);
      if (index.version !== undefined)
        note(result.notes, 'index.version', 'runtime', index.version);
      unknownKeys(
        root,
        ['index', 'magic-resume-index', 'documents', ...keys],
        'input',
        result.notes,
      );
    } else throw new Error('请选择参考简历 JSON、state.resumes 草稿或带索引的分文档记录。');
  }
  if (!sources.length || sources.length > 1000)
    throw new Error('Document count must be between 1 and 1000');
  for (const [id, value] of sources) {
    const candidate: ReferenceImportCandidate = { sourceId: id, title: id, notes: [] };
    try {
      if (value === undefined) throw new Error('Document referenced by the index is missing');
      const raw = decoded(value, id);
      candidate.document = convertDocument(raw, candidate.notes);
      candidate.title = candidate.document.title;
      if (
        raw &&
        typeof raw === 'object' &&
        'id' in raw &&
        (raw as RecordValue).id !== id &&
        result.format === 'split'
      )
        note(candidate.notes, 'id', 'identity', { index: id, document: (raw as RecordValue).id });
    } catch (error) {
      candidate.error = error instanceof Error ? error.message : String(error);
    }
    result.candidates.push(candidate);
  }
  return result;
}
