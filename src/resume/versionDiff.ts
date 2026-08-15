import { textContent, type ResumeDocument } from './model.ts';

export const versionFieldLabels: Record<string, string> = {
  title: '标题',
  name: '姓名',
  headline: '求职意向',
  email: '邮箱',
  phone: '电话',
  location: '地点',
  website: '网站',
  birthday: '生日',
  employmentStatus: '求职状态',
  photo: '照片',
  subtitle: '副标题',
  degree: '学历 / 学位',
  gpa: 'GPA',
  linkLabel: '链接显示文字',
  startDate: '开始日期',
  endDate: '结束日期',
  current: '至今',
  link: '链接',
  visible: '显示状态',
  columns: '分栏',
  description: '正文',
  customFields: '自定义字段',
  hiddenFields: '隐藏字段',
  removedFields: '已移除字段',
  fieldLabels: '字段名称',
  fieldIcons: '字段图标',
  contactOrder: '联系方式顺序',
  contributions: '贡献日历',
  publication: '论文信息',
  certificate: '证书',
  image: '图片',
  logo: '标志',
  template: '模板',
  accent: '主题色',
  font: '字体',
  fontSize: '字号',
  lineHeight: '行距',
  pageMargin: '页边距',
  sectionGap: '章节间距',
  automaticOnePage: '自动适配一页',
  automaticOnePageMinScale: '最小缩放比例',
  headerAlign: '页眉对齐',
  headingStyle: '标题样式',
  photoSize: '照片大小',
  photoShape: '照片形状',
  showPhoto: '显示照片',
  dateFormat: '日期格式',
  language: '语言',
  photoWidth: '照片宽度',
  photoHeight: '照片高度',
  photoAspectRatio: '照片比例',
  photoRadius: '照片圆角',
  photoFit: '照片裁切',
  photoSide: '照片位置',
  contactIcons: '联系图标',
  headerLayout: '页眉布局',
  entryHeadingLayout: '条目标题布局',
  subtitleAlign: '副标题对齐',
};
export interface VersionDifference {
  label: string;
  context: string;
  before: string;
  after: string;
}
function readable(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? '显示' : '隐藏';
  if (typeof value === 'string') return value.startsWith('data:image/') ? '图片' : value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join(' · ');
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (row.type === 'doc') return textContent(value as Parameters<typeof textContent>[0]);
    return Object.entries(row)
      .filter(([key]) => !['id', 'type'].includes(key))
      .map(([, item]) => readable(item))
      .filter(Boolean)
      .join(' · ');
  }
  return '';
}
export function compareVersions(
  current: ResumeDocument,
  snapshot: ResumeDocument,
): VersionDifference[] {
  const rows: VersionDifference[] = [];
  const add = (label: string, before: unknown, after: unknown, context = '') => {
    if (JSON.stringify(before) !== JSON.stringify(after))
      rows.push({
        label,
        context,
        before: readable(before).slice(0, 240),
        after: readable(after).slice(0, 240),
      });
  };
  const fields = (before: object, after: object, context = '') => {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (!['id', 'type', 'items'].includes(key))
        add(versionFieldLabels[key] ?? '其他设置', left[key], right[key], context);
    }
  };
  add('简历名称', current.title, snapshot.title);
  fields(current.profile, snapshot.profile, '个人信息');
  fields(current.appearance, snapshot.appearance, '外观');
  if (
    current.sections.map((section) => section.id).join() !==
    snapshot.sections.map((section) => section.id).join()
  )
    add(
      '章节顺序',
      current.sections.map((section) => section.title),
      snapshot.sections.map((section) => section.title),
    );
  for (const section of current.sections)
    if (!snapshot.sections.some((other) => other.id === section.id))
      add('删除章节', section.title, '');
  for (const section of snapshot.sections) {
    const old = current.sections.find((other) => other.id === section.id);
    if (!old) {
      add('新增章节', '', section.title);
      continue;
    }
    fields(old, section, section.title);
    if (old.items.map((item) => item.id).join() !== section.items.map((item) => item.id).join())
      add(
        '条目顺序',
        old.items.map((item) => item.title),
        section.items.map((item) => item.title),
        section.title,
      );
    for (const item of old.items)
      if (!section.items.some((other) => other.id === item.id))
        add('删除条目', item.title || textContent(item.description), '', section.title);
    for (const item of section.items) {
      const previous = old.items.find((other) => other.id === item.id);
      if (!previous)
        add('新增条目', '', item.title || textContent(item.description), section.title);
      else fields(previous, item, `${section.title} · ${item.title}`);
    }
  }
  return rows.slice(0, 120);
}
export function snapshotText(
  document: ResumeDocument,
  translate: (message: string) => string = (value) => value,
): { title: string; hidden: boolean; lines: string[] }[] {
  const values = (value: object) =>
    Object.entries(value)
      .filter(
        ([key, item]) => !['id', 'type', 'items', 'description'].includes(key) && readable(item),
      )
      .map(
        ([key, item]) =>
          `${translate(versionFieldLabels[key] ?? '其他内容')}：${typeof item === 'boolean' ? translate(readable(item)) : readable(item)}`,
      );
  return [
    { title: document.title, hidden: false, lines: values(document.profile) },
    ...document.sections.flatMap((section) => [
      { title: section.title, hidden: !section.visible, lines: [] },
      ...section.items.map((item) => ({
        title: item.title || section.title,
        hidden: !section.visible || item.visible === false,
        lines: [...values(item), textContent(item.description)],
      })),
    ]),
  ];
}
