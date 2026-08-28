import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
  type INumberingOptions,
  type ParagraphChild,
} from 'docx';
import {
  hasEntryContent,
  safeLink,
  type ResumeDocument,
  type ResumeEntry,
  type ResumeField,
  type RichTextNode,
} from './model.ts';
import { fieldDisplayValue, fieldLink, profileContacts } from './fields.ts';
import { formatResumeDate } from './dates.ts';
import { authorSegments, publicationCitationLabel, publicationStatusName } from './publications.ts';
import {
  highlightCssColor,
  normalizeFontSize,
  normalizeParagraphIndent,
  normalizeParagraphLineHeight,
  normalizeTextAlign,
  normalizeTextColor,
} from './textFormatting.ts';

type Block = Paragraph | Table;
type ListContext = { reference: string; level: number; first: boolean };
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FONT_NAMES = {
  sans: 'Noto Sans SC',
  serif: 'Noto Serif SC',
  wenkai: 'LXGW WenKai TC',
  xiaowei: 'ZCOOL XiaoWei',
};
const TEMPLATE_SIZES = {
  linen: [34, 13],
  column: [38, 14],
  graduate: [32, 14],
  ledger: [36, 14],
  campus: [36, 14],
  folio: [40, 15],
  research: [30, 14],
  executive: [42, 12],
  mono: [30, 12],
} as const;
const pxTwips = (value: number) => Math.round(value * 15);
const pxSize = (value: number) => Math.round(value * 1.5);
const color = (value: string | undefined) => normalizeTextColor(value)?.slice(1);
const align = (value: unknown) => {
  const normalized = normalizeTextAlign(value);
  return normalized === 'justify' ? AlignmentType.JUSTIFIED : normalized;
};
const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' } as const;
const cleanText = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd');

function textRuns(text: string, options: IRunOptions = {}): TextRun[] {
  return cleanText(text)
    .split(/\r?\n/)
    .flatMap((line, index) => [
      ...(index ? [new TextRun({ break: 1 })] : []),
      new TextRun({ ...options, text: line }),
    ]);
}

function linkRuns(text: string, href?: string, options: IRunOptions = {}): ParagraphChild[] {
  const children = textRuns(text, options);
  return href ? [new ExternalHyperlink({ link: href, children })] : children;
}

function inline(node: RichTextNode, defaults: IRunOptions = {}): ParagraphChild[] {
  if (node.type === 'hardBreak') return [new TextRun({ break: 1 })];
  if (node.type !== 'text') return (node.content ?? []).flatMap((child) => inline(child, defaults));
  const options: { -readonly [Key in keyof IRunOptions]: IRunOptions[Key] } = { ...defaults };
  let href: string | undefined;
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') options.bold = true;
    if (mark.type === 'italic') options.italics = true;
    if (mark.type === 'underline') options.underline = { type: UnderlineType.SINGLE };
    if (mark.type === 'strike') options.strike = true;
    if (mark.type === 'superscript') options.superScript = true;
    if (mark.type === 'subscript') options.subScript = true;
    if (mark.type === 'code') options.font = 'Consolas';
    if (mark.type === 'link') href = safeLink(mark.attrs?.href ?? '');
    if (mark.type === 'textStyle') {
      const size = normalizeFontSize(mark.attrs?.fontSize);
      if (size) options.size = pxSize(Number.parseFloat(size));
      if (color(mark.attrs?.color)) options.color = color(mark.attrs?.color);
    }
    if (mark.type === 'highlight') {
      const fill = highlightCssColor(mark.attrs?.color)?.slice(1);
      if (fill) options.shading = { type: ShadingType.CLEAR, fill };
    }
  }
  return linkRuns(node.text ?? '', href, options);
}

function tableColumns(node: RichTextNode): number[] {
  const widths: number[] = [];
  const occupied: number[] = [];
  for (const row of node.content ?? []) {
    let column = 0;
    for (const cell of row.content ?? []) {
      while (occupied[column] > 0) column++;
      const span = cell.attrs?.colspan ?? 1;
      for (let offset = 0; offset < span; offset++) {
        widths[column + offset] = cell.attrs?.colwidth?.[offset] ?? widths[column + offset] ?? 120;
        if ((cell.attrs?.rowspan ?? 1) > 1) occupied[column + offset] = cell.attrs!.rowspan!;
      }
      column += span;
    }
    for (let index = 0; index < occupied.length; index++)
      occupied[index] = Math.max(0, occupied[index] - 1);
  }
  return widths.length ? widths : [120];
}

class WordContent {
  private readonly document: ResumeDocument;
  readonly numbering: INumberingOptions['config'][number][] = [];
  readonly width: number;

  constructor(document: ResumeDocument) {
    this.document = document;
    this.width = Math.round(((210 - document.appearance.pageMargin * 2) * 1440) / 25.4);
  }

  paragraph(children: ParagraphChild[], options: IParagraphOptions = {}): Paragraph {
    const appearance = this.document.appearance;
    return new Paragraph({
      children,
      spacing: {
        after: pxTwips(appearance.paragraphGap ?? 4),
        line: pxTwips(appearance.fontSize * appearance.lineHeight),
        lineRule: LineRuleType.AT_LEAST,
      },
      widowControl: true,
      ...options,
    });
  }

  rich(
    node: RichTextNode,
    list?: ListContext,
    quote = false,
    width = this.width,
    run: IRunOptions = {},
  ): Block[] {
    if (node.type === 'table') {
      const columns = tableColumns(node);
      const total = columns.reduce((sum, item) => sum + item, 0);
      return [
        new Table({
          width: { size: width, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          columnWidths: columns.map((item) => Math.round((width * item) / total)),
          borders: {
            top: border,
            left: border,
            bottom: border,
            right: border,
            insideHorizontal: border,
            insideVertical: border,
          },
          rows: (node.content ?? []).map(
            (row) =>
              new TableRow({
                tableHeader: row.content?.every((cell) => cell.type === 'tableHeader'),
                children: (row.content ?? []).map((cell) => {
                  const children = (cell.content ?? []).flatMap((child) =>
                    this.rich(child, undefined, false, width, {
                      ...run,
                      ...(cell.type === 'tableHeader' ? { bold: true } : {}),
                    }),
                  );
                  if (!(children.at(-1) instanceof Paragraph)) children.push(this.paragraph([]));
                  return new TableCell({
                    children,
                    columnSpan: cell.attrs?.colspan ?? 1,
                    rowSpan: cell.attrs?.rowspan ?? 1,
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 80, bottom: 80, left: 100, right: 100 },
                    shading: {
                      type: ShadingType.CLEAR,
                      fill:
                        color(cell.attrs?.backgroundColor) ??
                        (cell.type === 'tableHeader' ? 'E8EEF0' : 'FFFFFF'),
                    },
                    borders: { top: border, left: border, bottom: border, right: border },
                  });
                }),
              }),
          ),
        }),
        this.paragraph([]),
      ];
    }
    if (node.type === 'orderedList' || node.type === 'bulletList') {
      const reference = `list-${this.numbering.length}`;
      const ordered = node.type === 'orderedList';
      this.numbering.push({
        reference,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
          text: ordered ? `%${level + 1}.` : '•',
          start: node.attrs?.start ?? 1,
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 240 } } },
        })),
      });
      const level = Math.min(8, list ? list.level + 1 : 0);
      return (node.content ?? []).flatMap((item) =>
        this.rich(item, { reference, level, first: true }, quote, width, run),
      );
    }
    if (node.type === 'blockquote')
      return (node.content ?? []).flatMap((child) => this.rich(child, list, true, width, run));
    if (
      node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'codeBlock' ||
      node.type === 'horizontalRule'
    ) {
      const heading = node.type === 'heading';
      const code = node.type === 'codeBlock';
      const numbered = list?.first;
      if (list) list.first = false;
      const indentation = normalizeParagraphIndent(node.attrs?.paragraphIndent) ?? 0;
      const lineHeight =
        normalizeParagraphLineHeight(node.attrs?.lineHeight) ?? this.document.appearance.lineHeight;
      const headingSize =
        this.document.appearance.fontSize *
        [1.6, 1.4, 1.2, 1.05][Math.min(3, Math.max(0, (node.attrs?.level ?? 2) - 1))];
      const maxSize = (child: RichTextNode): number =>
        Math.max(
          this.document.appearance.fontSize,
          ...(child.marks ?? []).map((mark) =>
            Number.parseFloat(normalizeFontSize(mark.attrs?.fontSize) ?? '0'),
          ),
          ...(child.content ?? []).map(maxSize),
        );
      return [
        this.paragraph(
          inline(node, {
            ...run,
            ...(heading ? { size: pxSize(headingSize), bold: true } : {}),
            ...(code
              ? { font: 'Consolas', size: pxSize(this.document.appearance.fontSize * 0.9) }
              : {}),
          }),
          {
            alignment: align(node.attrs?.textAlign),
            ...(heading
              ? {
                  heading: [
                    HeadingLevel.HEADING_1,
                    HeadingLevel.HEADING_2,
                    HeadingLevel.HEADING_3,
                    HeadingLevel.HEADING_4,
                  ][Math.min(3, Math.max(0, (node.attrs?.level ?? 2) - 1))],
                  keepNext: true,
                  run: { size: pxSize(headingSize), bold: true },
                }
              : {}),
            ...(code
              ? { run: { font: 'Consolas' }, shading: { fill: 'F2F3F4', type: ShadingType.CLEAR } }
              : {}),
            ...(numbered && list
              ? { numbering: { reference: list.reference, level: list.level } }
              : {}),
            ...(!numbered && (quote || indentation || list)
              ? {
                  indent: {
                    left:
                      (quote ? 360 : 0) +
                      pxTwips(indentation * this.document.appearance.fontSize) +
                      (list ? 360 * (list.level + 1) : 0),
                  },
                }
              : {}),
            spacing: {
              after: pxTwips(this.document.appearance.paragraphGap ?? 4),
              line: pxTwips(
                Math.max(maxSize(node), heading ? headingSize : 0) * (heading ? 1.35 : lineHeight),
              ),
              lineRule: LineRuleType.AT_LEAST,
            },
            ...(quote || node.type === 'horizontalRule'
              ? {
                  border: quote
                    ? {
                        left: {
                          ...border,
                          color: color(this.document.appearance.accent) ?? 'D9D9D9',
                          size: 12,
                          space: 6,
                        },
                      }
                    : { bottom: border },
                }
              : {}),
          },
        ),
      ];
    }
    return (node.content ?? []).flatMap((child) => this.rich(child, list, quote, width, run));
  }

  fields(
    fields: ResumeField[],
    alignment?: IParagraphOptions['alignment'],
    size?: number,
  ): Paragraph[] {
    return fields
      .filter((field) => field.visible && fieldDisplayValue(field).trim())
      .map((field) =>
        this.paragraph(
          [
            ...(field.showLabel && field.label
              ? textRuns(`${field.label}： `, {
                  bold: true,
                  ...(size ? { size: pxSize(size) } : {}),
                })
              : []),
            ...linkRuns(
              fieldDisplayValue(field),
              fieldLink(field),
              field.id === 'email' && this.document.profile.emailUnderline
                ? {
                    underline: { type: UnderlineType.SINGLE },
                    ...(size ? { size: pxSize(size) } : {}),
                  }
                : size
                  ? { size: pxSize(size) }
                  : {},
            ),
          ],
          {
            alignment,
            ...(size
              ? {
                  run: { size: pxSize(size) },
                  spacing: {
                    after: 60,
                    line: pxTwips(size * this.document.appearance.lineHeight),
                    lineRule: LineRuleType.AT_LEAST,
                  },
                }
              : {}),
          },
        ),
      );
  }

  async image(
    source: string,
    width: number,
    height?: number,
    alignment?: IParagraphOptions['alignment'],
    label = 'Image',
    geometry?: { fit: 'cover' | 'contain'; radius: number; x?: number; y?: number },
  ): Promise<Paragraph> {
    const match = /^data:image\/(png|jpe?g|gif|bmp|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(
      source,
    );
    if (!match) throw new Error('The image must be embedded as a supported data URL.');
    let type = match[1].toLowerCase() as 'png' | 'jpeg' | 'jpg' | 'gif' | 'bmp' | 'webp';
    let data = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
    let naturalWidth = 1,
      naturalHeight = 1;
    if (typeof window !== 'undefined') {
      const image = new Image();
      image.src = source;
      await image.decode();
      naturalWidth = image.naturalWidth;
      naturalHeight = image.naturalHeight;
      if (type === 'webp' || geometry) {
        const canvas = window.document.createElement('canvas');
        canvas.width = geometry ? Math.round(width * 2) : naturalWidth;
        canvas.height = geometry
          ? Math.round((height ?? (width * naturalHeight) / naturalWidth) * 2)
          : naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('The image conversion context is unavailable.');
        if (geometry) {
          const radius = Math.min(canvas.width / 2, canvas.height / 2, geometry.radius * 2);
          context.beginPath();
          context.roundRect(0, 0, canvas.width, canvas.height, radius);
          context.clip();
          const scale =
            geometry.fit === 'cover'
              ? Math.max(canvas.width / naturalWidth, canvas.height / naturalHeight)
              : Math.min(canvas.width / naturalWidth, canvas.height / naturalHeight);
          const targetWidth = naturalWidth * scale,
            targetHeight = naturalHeight * scale;
          context.drawImage(
            image,
            ((canvas.width - targetWidth) * (geometry.x ?? 50)) / 100,
            ((canvas.height - targetHeight) * (geometry.y ?? 50)) / 100,
            targetWidth,
            targetHeight,
          );
        } else context.drawImage(image, 0, 0);
        data = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (character) =>
          character.charCodeAt(0),
        );
        type = 'png';
      }
    } else if (type === 'png' && data.length >= 24) {
      const view = new DataView(data.buffer);
      naturalWidth = view.getUint32(16);
      naturalHeight = view.getUint32(20);
    } else {
      throw new Error('Image measurement requires a browser for this image format.');
    }
    const maxWidth = this.width / 15;
    const maxHeight = (((297 - this.document.appearance.pageMargin * 2) * 96) / 25.4) * 0.9;
    const requestedHeight = height ?? (width * naturalHeight) / naturalWidth;
    const scale = Math.min(1, maxWidth / width, maxHeight / requestedHeight);
    return this.paragraph(
      [
        new ImageRun({
          type: type === 'jpeg' ? 'jpg' : type,
          data,
          transformation: {
            width: Math.max(1, width * scale),
            height: Math.max(1, requestedHeight * scale),
          },
          altText: { name: label, title: label, description: label },
        }),
      ],
      { alignment },
    );
  }

  async entry(entry: ResumeEntry, index: number): Promise<Block[]> {
    const a = this.document.appearance;
    const hidden = entry.hiddenFields ?? [];
    const visible = (field: string, value?: string) =>
      hidden.includes(field) ? '' : (value ?? '');
    const labeled = (field: string, value: string) =>
      value && entry.fieldLabels?.[field] ? `${entry.fieldLabels[field]}： ${value}` : value;
    const title = visible('title', entry.title),
      subtitle = visible('subtitle', entry.subtitle);
    const publication = hidden.includes('publication') ? undefined : entry.publication;
    const citation = publication
      ? publicationCitationLabel(publication, index, visible('dates', entry.startDate))
      : '';
    const blocks: Block[] = [];
    if (!hidden.includes('logo') && entry.logoVisible !== false && entry.logo)
      blocks.push(
        await this.image(
          entry.logo,
          entry.logoWidth ?? entry.logoSize ?? 40,
          entry.logoHeight ?? entry.logoSize ?? 40,
          entry.logoPosition ?? 'left',
          'Organization logo',
          { fit: entry.logoFit ?? 'contain', radius: entry.logoRadius ?? 6 },
        ),
      );
    if (title || subtitle)
      blocks.push(
        this.paragraph(
          textRuns(
            `${citation ? `${citation} ` : ''}${labeled(title ? 'title' : 'subtitle', title || subtitle)}`,
            { bold: true, size: pxSize(a.entryHeadingSize ?? a.fontSize) },
          ),
          {
            keepNext: true,
            spacing: {
              before: index ? pxTwips(a.entryGap ?? 16) : 0,
              after: pxTwips(a.entryHeadingGap ?? 4),
            },
          },
        ),
      );
    if (title && subtitle)
      blocks.push(
        this.paragraph(textRuns(labeled('subtitle', subtitle)), {
          alignment: a.centerSubtitle ? 'center' : a.subtitleAlign,
          keepNext: true,
        }),
      );
    const dates = hidden.includes('dates')
      ? ''
      : [
          formatResumeDate(entry.startDate, a.dateFormat, a.language),
          formatResumeDate(entry.current ? '至今' : entry.endDate, a.dateFormat, a.language),
        ]
          .filter(Boolean)
          .join(' — ');
    const degree = visible('degree', entry.degree?.trim());
    const degreeLabel = entry.fieldLabels?.degree?.trim();
    const gpa = visible('gpa', entry.gpa?.trim());
    const meta = [
      degree && degree !== subtitle.trim()
        ? `${degreeLabel ? degreeLabel + ': ' : ''}${degree}`
        : '',
      gpa ? `${entry.fieldLabels?.gpa?.trim() || 'GPA'}: ${gpa}` : '',
      dates,
      visible('location', entry.location),
    ].filter(Boolean);
    if (meta.length) blocks.push(this.paragraph(textRuns(meta.join(' · ')), { keepNext: true }));
    if (visible('link', entry.link))
      blocks.push(
        this.paragraph(linkRuns(entry.linkLabel?.trim() || entry.link, safeLink(entry.link))),
      );
    if (publication) {
      if (publication.authors.trim())
        blocks.push(
          this.paragraph(
            authorSegments(publication.authors, publication.highlightedAuthor).flatMap((part) =>
              textRuns(part.text, { bold: part.highlighted }),
            ),
          ),
        );
      const venue = [publication.venue, publicationStatusName(publication.status, a.language)]
        .filter(Boolean)
        .join(' · ');
      if (venue) blocks.push(this.paragraph(textRuns(venue)));
    }
    blocks.push(...this.fields(entry.customFields ?? []));
    if (!hidden.includes('description')) blocks.push(...this.rich(entry.description));
    if (!hidden.includes('image') && entry.image)
      blocks.push(
        await this.image(
          entry.image,
          ((this.width / 15) * (entry.imageWidth ?? 100)) / 100,
          undefined,
          entry.imageAlign,
          'Entry image',
        ),
      );
    return blocks;
  }
}

export async function createDocxBlob(resume: ResumeDocument): Promise<Blob> {
  const content = new WordContent(resume);
  const { profile, appearance: a } = resume;
  const hidden = profile.hiddenFields ?? [];
  const children: Block[] = [];
  if (!hidden.includes('name'))
    children.push(
      content.paragraph(
        textRuns(
          `${profile.fieldLabels?.name ? `${profile.fieldLabels.name} ` : ''}${profile.name || (a.language === 'en' ? 'Your name' : '你的姓名')}`,
          { bold: true, size: pxSize(a.nameSize ?? TEMPLATE_SIZES[a.template][0]) },
        ),
        { heading: HeadingLevel.TITLE, alignment: a.headerAlign, keepNext: true },
      ),
    );
  if (!hidden.includes('headline'))
    children.push(
      content.paragraph(
        textRuns(
          `${profile.fieldLabels?.headline ? `${profile.fieldLabels.headline}： ` : ''}${profile.headline || (a.language === 'en' ? 'Your professional headline' : '填写你的求职意向')}`,
        ),
        { alignment: a.headerAlign, keepNext: true },
      ),
    );
  children.push(...content.fields(profileContacts(profile), a.headerAlign, 10.5));
  if (profile.photo && a.showPhoto)
    children.push(
      await content.image(
        profile.photo,
        a.photoWidth ?? a.photoSize,
        a.photoHeight ??
          (a.photoShape === 'circle' ? (a.photoWidth ?? a.photoSize) : a.photoSize * 1.28),
        a.photoSide ?? 'right',
        'Profile photo',
        {
          fit: a.photoFit ?? 'cover',
          radius:
            a.photoRadius ??
            (a.photoShape === 'circle'
              ? Math.max(a.photoWidth ?? a.photoSize, a.photoHeight ?? a.photoSize)
              : a.photoShape === 'rounded'
                ? 6
                : 0),
          x: a.photoPositionX,
          y: a.photoPositionY,
        },
      ),
    );
  const calendar = profile.contributions;
  if (calendar?.visible) {
    children.push(
      content.paragraph(
        textRuns(
          `${calendar.title || (a.language === 'en' ? 'Contributions' : '贡献记录')} · ${calendar.year} · ${calendar.days.reduce((sum, day) => sum + day.count, 0)} ${a.language === 'en' ? 'contributions' : '次贡献'}`,
        ),
      ),
    );
    children.push(
      content.paragraph(
        textRuns(calendar.days.map((day) => `${day.date}: ${day.count}`).join(' · ')),
      ),
    );
  }
  for (const section of resume.sections.filter(
    (section) => section.visible && section.items.some(hasEntryContent),
  )) {
    if (section.showTitle !== false)
      children.push(
        content.paragraph(
          textRuns(section.title, {
            bold: true,
            size: pxSize(a.headingSize ?? TEMPLATE_SIZES[a.template][1]),
          }),
          {
            heading: HeadingLevel.HEADING_1,
            keepNext: true,
            pageBreakBefore: section.breakBefore,
            spacing: { before: pxTwips(a.sectionGap), after: 120 },
            ...(a.headingStyle === 'highlight'
              ? { shading: { type: ShadingType.CLEAR, fill: color(a.accent) ?? 'D9E5DD' } }
              : {}),
            ...(['underline', 'timeline'].includes(a.headingStyle)
              ? { border: { bottom: { ...border, color: color(a.accent) ?? 'D9E5DD', size: 8 } } }
              : {}),
          },
        ),
      );
    else if (section.breakBefore)
      children.push(content.paragraph([], { pageBreakBefore: true, spacing: { after: 0 } }));
    for (const [index, entry] of section.items.filter(hasEntryContent).entries())
      children.push(...(await content.entry(entry, index)));
  }
  const margin = Math.round((a.pageMargin * 1440) / 25.4);
  const document = new Document({
    title: cleanText(resume.title),
    creator: 'Luck',
    styles: {
      default: {
        document: {
          run: {
            font: FONT_NAMES[a.font],
            size: pxSize(a.fontSize),
            color: '17201C',
            snapToGrid: false,
          },
          paragraph: {
            spacing: { line: pxTwips(a.fontSize * a.lineHeight), lineRule: LineRuleType.AT_LEAST },
          },
        },
        title: { run: { color: '17201C', font: FONT_NAMES[a.font] } },
        heading1: { run: { color: '17201C', font: FONT_NAMES[a.font] } },
        heading2: { run: { color: '17201C', font: FONT_NAMES[a.font] } },
        heading3: { run: { color: '17201C', font: FONT_NAMES[a.font] } },
        heading4: { run: { color: '17201C', font: FONT_NAMES[a.font] } },
      },
    },
    numbering: { config: content.numbering },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: margin, bottom: margin, left: margin, right: margin },
          },
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  return new Blob([blob], { type: DOCX_TYPE });
}

export async function downloadDocx(resume: ResumeDocument): Promise<void> {
  const blob = await createDocxBlob(resume);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `${(resume.title || 'resume').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180)}.docx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
