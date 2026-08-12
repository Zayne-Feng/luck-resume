import { dateRangeError } from './dates.ts';
import { profileContacts } from './fields.ts';
import { hasEntryContent, safeLink, type ResumeDocument, type RichTextNode } from './model.ts';

export interface ReviewTarget {
  sectionId: string;
  entryId?: string;
}
export interface ReviewIssue extends ReviewTarget {
  label: string;
  detail: string;
}
export interface ReviewCheck {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  issues: ReviewIssue[];
}

function richLinks(node: RichTextNode): string[] {
  return [
    ...(node.marks ?? [])
      .filter((mark) => mark.type === 'link')
      .map((mark) => mark.attrs?.href ?? ''),
    ...(node.content ?? []).flatMap(richLinks),
  ];
}

export function reviewDocument(document: ResumeDocument): ReviewCheck[] {
  const { profile, sections } = document;
  const visible = sections.filter((section) => section.visible);
  const populated = visible.filter((section) => section.items.some(hasEntryContent));
  const contacts = profileContacts(profile).filter((field) => field.visible && field.value.trim());
  const links: ReviewIssue[] = [];
  const dates: ReviewIssue[] = [];
  const email: ReviewIssue[] = [];
  const checkLink = (value: string, target: ReviewTarget, label: string) => {
    if (value.trim() && !safeLink(value))
      links.push({ ...target, label, detail: '请输入有效的网址、邮箱、电话链接或 DOI。' });
  };
  for (const field of contacts) {
    if (field.kind === 'link')
      checkLink(field.value, { sectionId: 'profile' }, field.label || '联系信息');
    if (field.id === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim()))
      email.push({
        sectionId: 'profile',
        label: field.label || '电子邮箱',
        detail: '检查邮箱中的 @、域名和空格。',
      });
  }
  for (const section of populated) {
    for (const [index, entry] of section.items.entries()) {
      if (!hasEntryContent(entry)) continue;
      const target = { sectionId: section.id, entryId: entry.id };
      const label = `${section.title || '未命名模块'} · ${(!entry.hiddenFields?.includes('title') && entry.title) || `条目 ${index + 1}`}`;
      const hidden = entry.hiddenFields ?? [];
      if (!hidden.includes('link')) checkLink(entry.link, target, `${label} · 相关链接`);
      for (const field of entry.customFields ?? [])
        if (field.visible && field.kind === 'link')
          checkLink(field.value, target, `${label} · ${field.label || '自定义链接'}`);
      if (!hidden.includes('description'))
        for (const href of new Set(richLinks(entry.description)))
          checkLink(href, target, `${label} · 描述中的链接`);
      const error = hidden.includes('dates')
        ? ''
        : dateRangeError(entry.startDate, entry.endDate, entry.current);
      if (error) dates.push({ ...target, label, detail: error });
    }
  }
  const profileIssue = (label: string, detail: string): ReviewIssue => ({
    sectionId: 'profile',
    label,
    detail,
  });
  const name = !profile.hiddenFields?.includes('name') && Boolean(profile.name.trim());
  const headline = !profile.hiddenFields?.includes('headline') && Boolean(profile.headline.trim());
  const contact = contacts.some(
    (field) =>
      ['email', 'phone'].includes(field.id) ||
      /^(mailto|tel):/i.test(field.value) ||
      /email|e-mail|phone|mobile|wechat|邮箱|电话|手机|微信|联系/i.test(field.label),
  );
  const empty = visible.filter((section) => !section.items.some(hasEntryContent));
  return [
    {
      id: 'name',
      title: '写下可见姓名',
      detail: '姓名会显示在投递版本中。',
      done: name,
      issues: name ? [] : [profileIssue('基本信息', '姓名尚未填写或已隐藏。')],
    },
    {
      id: 'headline',
      title: '明确求职意向',
      detail: '用一句可见的标题说明你想做什么。',
      done: headline,
      issues: headline ? [] : [profileIssue('基本信息', '求职意向尚未填写或已隐藏。')],
    },
    {
      id: 'contact',
      title: '留下可见联系方式',
      detail: '支持电话、邮箱，以及自定义的微信等联系信息。',
      done: contact,
      issues: contact ? [] : [profileIssue('基本信息', '至少保留一种可见的联系方式。')],
    },
    {
      id: 'content',
      title: '展示你的经历',
      detail: '任意可见模块都可以展示经历、作品或能力。',
      done: populated.length > 0,
      issues: populated.length
        ? []
        : [
            {
              sectionId: sections[0]?.id ?? 'profile',
              label: '简历内容',
              detail: '当前还没有可见的经历内容。',
            },
          ],
    },
    {
      id: 'links',
      title: '检查可见链接',
      detail: '检查基本信息、自定义字段和描述中的链接。',
      done: links.length === 0,
      issues: links,
    },
    {
      id: 'dates',
      title: '检查日期顺序',
      detail: '对可识别的年月进行比较，自由输入的文字保持原样。',
      done: dates.length === 0,
      issues: dates,
    },
    {
      id: 'email',
      title: '检查邮箱格式',
      detail: '检查可见电子邮箱的基本格式。',
      done: email.length === 0,
      issues: email,
    },
    {
      id: 'empty',
      title: '收起空白模块',
      detail: '空模块不会打印，可隐藏它们，让编辑区更清楚。',
      done: empty.length === 0,
      issues: empty.map((section) => ({
        sectionId: section.id,
        label: section.title || '未命名模块',
        detail: '此模块没有可见内容。',
      })),
    },
  ];
}
