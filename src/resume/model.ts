import { sampleProfile, sampleSections } from './sample.ts';
import type { ResumeFont } from './fonts.ts';
import { normalizeResumeLink } from './links.ts';

export const templateIds = [
  'linen',
  'column',
  'graduate',
  'ledger',
  'campus',
  'folio',
  'research',
  'executive',
  'mono',
] as const;
export type TemplateId = (typeof templateIds)[number];
export const sectionTypes = [
  'summary',
  'education',
  'experience',
  'projects',
  'skills',
  'custom',
  'publications',
  'certifications',
  'awards',
  'languages',
  'volunteering',
  'freeform',
] as const;
export type SectionType = (typeof sectionTypes)[number];
export const dateFormats = [
  'original',
  'YYYY.MM',
  'YYYY-MM',
  'YYYY/MM',
  'MM/YYYY',
  'MMM YYYY',
] as const;
export type DateFormat = (typeof dateFormats)[number];
export interface ResumeField {
  id: string;
  label: string;
  value: string;
  kind: 'text' | 'link' | 'multiline';
  visible: boolean;
  showLabel: boolean;
  icon?: string;
  linkLabel?: string;
}

export interface RichTextNode {
  type: string;
  attrs?: {
    start?: number;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    paragraphIndent?: number;
    lineHeight?: number;
    level?: number;
    language?: string;
    colspan?: number;
    rowspan?: number;
    colwidth?: number[] | null;
    backgroundColor?: string;
  };
  text?: string;
  content?: RichTextNode[];
  marks?: { type: string; attrs?: { href?: string; fontSize?: string; color?: string } }[];
}

export interface Profile {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  photo: string;
  birthday?: string;
  employmentStatus?: string;
  removedFields?: string[];
  emailUnderline?: boolean;
  customFields?: ResumeField[];
  contactOrder?: string[];
  hiddenFields?: string[];
  fieldLabels?: Record<string, string>;
  fieldIcons?: Record<string, string>;
  contributions?: ContributionCalendar;
}

export interface ContributionCalendar {
  title: string;
  visible: boolean;
  year: number;
  days: { date: string; count: number }[];
}

export interface Publication {
  authors: string;
  highlightedAuthor: string;
  venue: string;
  status: 'none' | 'published' | 'accepted' | 'preprint' | 'submitted';
  citationStyle: 'plain' | 'numbered' | 'author-year';
}

export interface ResumeEntry {
  id: string;
  title: string;
  subtitle: string;
  degree?: string;
  gpa?: string;
  startDate: string;
  endDate: string;
  current: boolean;
  location: string;
  link: string;
  description: RichTextNode;
  visible?: boolean;
  customFields?: ResumeField[];
  hiddenFields?: string[];
  fieldLabels?: Record<string, string>;
  dateInput?: 'text' | 'month';
  image?: string;
  imageWidth?: number;
  imageAlign?: 'left' | 'center' | 'right';
  linkLabel?: string;
  logo?: string;
  logoSize?: number;
  logoWidth?: number;
  logoHeight?: number;
  logoRatio?: number;
  logoRadius?: number;
  logoVisible?: boolean;
  logoPosition?: 'left' | 'right';
  logoFit?: 'contain' | 'cover';
  publication?: Publication;
}

export interface ResumeSection {
  id: string;
  type: SectionType;
  title: string;
  visible: boolean;
  columns: 1 | 2;
  items: ResumeEntry[];
  showTitle?: boolean;
  breakBefore?: boolean;
  placement?: 'auto' | 'full' | 'left' | 'right';
}

export interface Appearance {
  template: TemplateId;
  accent: string;
  font: ResumeFont;
  fontSize: number;
  lineHeight: number;
  pageMargin: number;
  sectionGap: number;
  automaticOnePage?: boolean;
  automaticOnePageMinScale?: number;
  headerAlign: 'left' | 'center' | 'right';
  headingStyle: 'plain' | 'highlight' | 'underline' | 'timeline';
  photoSize: number;
  photoShape: 'square' | 'rounded' | 'circle';
  showPhoto: boolean;
  dateFormat?: DateFormat;
  language?: 'zh' | 'en';
  nameSize?: number;
  headingSize?: number;
  entryHeadingSize?: number;
  centerSubtitle?: boolean;
  flexibleHeaderLayout?: boolean;
  entryHeadingGap?: number;
  entryGap?: number;
  paragraphGap?: number;
  photoPositionX?: number;
  photoPositionY?: number;
  columnRatio?: number;
  columnGap?: number;
  photoWidth?: number;
  photoHeight?: number;
  photoAspectRatio?: number;
  photoRadius?: number;
  photoFit?: 'cover' | 'contain';
  photoSide?: 'left' | 'right';
  contactIcons?: boolean;
  headerLayout?: 'standard' | 'stacked';
  entryHeadingLayout?: 'split' | 'stacked' | 'inline';
  subtitleAlign?: 'left' | 'center' | 'right';
}

export interface ResumeDocument {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  profile: Profile;
  sections: ResumeSection[];
  appearance: Appearance;
}

export const templates: { id: TemplateId; name: string; description: string }[] = [
  { id: 'linen', name: '书签', description: '侧签式章节，像一本值得细读的履历' },
  { id: 'column', name: '拼色', description: '拼接式分区，让不同专长各就其位' },
  { id: 'graduate', name: '来信', description: '信笺式抬头，沿时间展开你的经历' },
  { id: 'ledger', name: '履章', description: '编号索引与右侧时间轴，清楚呈现职业进阶' },
  { id: 'campus', name: '启程', description: '教育侧栏与开放式经历，适合校招与实习' },
  { id: 'folio', name: '展陈', description: '宽幅名片与项目卡片，为作品和成果留白' },
  { id: 'research', name: '研序', description: '学术题头与文献式章节，适合研究与发表' },
  { id: 'executive', name: '领航', description: '居左名片与横向章节，突出职责和成就' },
  { id: 'mono', name: '素描', description: '克制的纯文本结构，适合英文与简洁投递' },
];

export const sectionNames: Record<SectionType, string> = {
  summary: '个人简介',
  education: '教育经历',
  experience: '工作经历',
  projects: '项目经历',
  skills: '专业技能',
  custom: '自定义模块',
  publications: '论文发表',
  certifications: '证书资质',
  awards: '荣誉奖项',
  languages: '语言能力',
  volunteering: '志愿活动',
  freeform: '自由文本',
};
export const englishSectionNames: Record<SectionType, string> = {
  summary: 'Summary',
  education: 'Education',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  custom: 'Additional Information',
  publications: 'Publications',
  certifications: 'Certifications',
  awards: 'Awards',
  languages: 'Languages',
  volunteering: 'Volunteering',
  freeform: 'Personal Statement',
};

export const accents = ['#c4d9ce', '#cbd9ed', '#e8ced8', '#d9d1eb', '#efdbc4', '#d5e3e4'];

export const emptyRichText = (): RichTextNode => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

export function richText(...paragraphs: string[]): RichTextNode {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : [],
    })),
  };
}

export function createField(label = '', kind: ResumeField['kind'] = 'text'): ResumeField {
  return { id: crypto.randomUUID(), label, value: '', kind, visible: true, showLabel: true };
}

const fieldPresets: Partial<Record<SectionType, string[]>> = {
  publications: ['作者', '期刊 / 会议', '发表状态', 'DOI'],
  certifications: ['颁发机构', '证书编号', '有效期'],
  awards: ['授予机构', '奖项级别'],
  languages: ['熟练程度', '考试 / 分数'],
  volunteering: ['组织', '服务时长'],
};

export function createEntry(type?: SectionType): ResumeEntry {
  return {
    id: crypto.randomUUID(),
    title: '',
    subtitle: '',
    startDate: '',
    endDate: '',
    current: false,
    location: '',
    link: '',
    description: emptyRichText(),
    ...(type && fieldPresets[type]
      ? { customFields: fieldPresets[type]!.map((label) => createField(label)) }
      : {}),
  };
}

export function createSection(type: SectionType, language: 'zh' | 'en' = 'zh'): ResumeSection {
  return {
    id: crypto.randomUUID(),
    type,
    title: language === 'en' ? englishSectionNames[type] : sectionNames[type],
    visible: true,
    columns: 1,
    items: ['summary', 'skills', 'custom', 'freeform'].includes(type) ? [createEntry(type)] : [],
  };
}

export function createDocument(template: TemplateId = 'linen', sample = false): ResumeDocument {
  const timestamp = new Date().toISOString();
  const doc: ResumeDocument = {
    id: crypto.randomUUID(),
    title: sample ? '林知夏的求职简历' : '未命名简历',
    createdAt: timestamp,
    updatedAt: timestamp,
    profile: sample
      ? { ...sampleProfile }
      : { name: '', headline: '', email: '', phone: '', location: '', website: '', photo: '' },
    sections: sample
      ? sampleSections()
      : (
          (template === 'research'
            ? ['summary', 'education', 'publications', 'projects', 'skills']
            : template === 'folio'
              ? ['summary', 'projects', 'experience', 'skills']
              : ['summary', 'education', 'experience', 'projects', 'skills']) as SectionType[]
        ).map((type) => createSection(type, template === 'mono' ? 'en' : 'zh')),
    appearance: {
      template,
      accent: accents[0],
      font: 'sans',
      fontSize: 13,
      lineHeight: 1.65,
      pageMargin: 18,
      sectionGap: 20,
      headerAlign: 'left',
      headingStyle: 'plain',
      photoSize: 78,
      photoShape: 'rounded',
      showPhoto: true,
      ...(template === 'mono' ? ({ language: 'en', dateFormat: 'MMM YYYY' } as const) : {}),
      ...(template === 'research' ? ({ font: 'serif' } as const) : {}),
    },
  };
  if (template === 'mono' && sample)
    doc.sections.forEach((section) => {
      section.title = englishSectionNames[section.type];
    });
  return doc;
}

export function cloneDocument(document: ResumeDocument): ResumeDocument {
  const copy = structuredClone(document);
  const timestamp = new Date().toISOString();
  return {
    ...copy,
    id: crypto.randomUUID(),
    title: `${copy.title.slice(0, 196)}（副本）`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function cloneEntry(entry: ResumeEntry): ResumeEntry {
  const copy = structuredClone(entry);
  copy.id = crypto.randomUUID();
  if (copy.customFields)
    copy.customFields = copy.customFields.map((field) => ({ ...field, id: crypto.randomUUID() }));
  return copy;
}

export function hasEntryContent(entry: ResumeEntry): boolean {
  const hidden = entry.hiddenFields ?? [];
  return (
    entry.visible !== false &&
    Boolean(
      (!hidden.includes('title') && entry.title.trim()) ||
        (!hidden.includes('subtitle') && entry.subtitle.trim()) ||
        (!hidden.includes('degree') && entry.degree?.trim()) ||
        (!hidden.includes('gpa') && entry.gpa?.trim()) ||
        (!hidden.includes('location') && entry.location.trim()) ||
        (!hidden.includes('link') && entry.link.trim()) ||
        (!hidden.includes('dates') && (entry.startDate || entry.endDate || entry.current)) ||
        (!hidden.includes('description') && hasRichTextContent(entry.description)) ||
        (!hidden.includes('image') && entry.image) ||
        (!hidden.includes('logo') && entry.logoVisible !== false && entry.logo) ||
        (!hidden.includes('publication') &&
          entry.publication &&
          (entry.publication.authors.trim() ||
            entry.publication.venue.trim() ||
            entry.publication.status !== 'none')) ||
        entry.customFields?.some(
          (f) => f.visible && (f.value.trim() || (f.kind === 'link' && f.linkLabel?.trim())),
        ),
    )
  );
}

export function textContent(node: RichTextNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(textContent).join(richTextSeparator(node));
}

export function richTextSeparator(node: RichTextNode): string {
  if (node.type === 'tableRow') return '\t';
  return [
    'doc',
    'bulletList',
    'orderedList',
    'listItem',
    'blockquote',
    'table',
    'tableCell',
    'tableHeader',
  ].includes(node.type)
    ? '\n'
    : '';
}

export function hasRichTextContent(node: RichTextNode): boolean {
  return (
    node.type === 'horizontalRule' ||
    Boolean(textContent(node).trim()) ||
    Boolean(node.content?.some(hasRichTextContent))
  );
}

export function safeLink(value: string): string | undefined {
  return normalizeResumeLink(value);
}
