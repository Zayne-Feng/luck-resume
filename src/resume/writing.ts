import { textContent, type ResumeDocument } from './model.ts';

export interface WritingIssue {
  kind: 'repeated' | 'punctuation' | 'vague' | 'long';
  sectionId: string;
  entryId?: string;
  sectionTitle: string;
  systemSection?: boolean;
  entryTitle?: string;
  field: string;
  customField?: boolean;
  excerpt: string;
  suggestion: string;
}

type WritingSource = Omit<WritingIssue, 'kind' | 'excerpt' | 'suggestion'> & { text: string };

function writingSources(document: ResumeDocument): WritingSource[] {
  const sources: WritingSource[] = [];
  const add = (source: WritingSource) => {
    if (source.text.trim()) sources.push(source);
  };
  for (const key of ['headline'] as const) {
    if (!document.profile.hiddenFields?.includes(key))
      add({
        sectionId: 'profile',
        sectionTitle: '基本信息',
        systemSection: true,
        field: '求职意向',
        text: document.profile[key],
      });
  }
  for (const field of document.profile.customFields ?? []) {
    if (field.visible && field.kind !== 'link')
      add({
        sectionId: 'profile',
        sectionTitle: '基本信息',
        systemSection: true,
        field: field.label || '自定义字段',
        customField: Boolean(field.label),
        text: field.value,
      });
  }
  for (const section of document.sections) {
    if (!section.visible) continue;
    for (const [index, entry] of section.items.entries()) {
      if (entry.visible === false) continue;
      const hidden = entry.hiddenFields ?? [];
      const location = {
        sectionId: section.id,
        entryId: entry.id,
        sectionTitle: section.title || '未命名模块',
        entryTitle: !hidden.includes('title') && entry.title.trim() ? entry.title : `#${index + 1}`,
      };
      for (const [key, field] of [
        ['title', '标题'],
        ['subtitle', '副标题'],
        ['description', '描述'],
      ] as const) {
        if (!hidden.includes(key))
          add({
            ...location,
            field,
            text: key === 'description' ? textContent(entry.description) : entry[key],
          });
      }
      for (const field of entry.customFields ?? []) {
        if (field.visible && field.kind !== 'link')
          add({
            ...location,
            field: field.label || '自定义字段',
            customField: Boolean(field.label),
            text: field.value,
          });
      }
    }
  }
  return sources;
}

export function checkWriting(document: ResumeDocument): WritingIssue[] {
  const issues: WritingIssue[] = [];
  for (const { text, ...location } of writingSources(document)) {
    const add = (kind: WritingIssue['kind'], excerpt: string, suggestion: string) => {
      issues.push({ ...location, kind, excerpt, suggestion });
    };
    for (const match of text.matchAll(/\b([a-z]+)(\s+\1)\b/gi))
      add('repeated', match[0], '检查相邻重复词，保留一次即可。');
    for (const match of text.matchAll(
      /(负责|参与|完成|进行|通过|以及|具有|能够|可以|非常|的|了)(?:\s*\1)+/g,
    ))
      add('repeated', match[0], '检查相邻重复词，保留一次即可。');
    for (const match of text.matchAll(/([，,。.;；、!?！？])\1+/g)) {
      if (/^\.{3,}$/.test(match[0])) continue;
      add('punctuation', match[0], '检查连续标点，按句意保留合适的一个。');
    }
    for (const match of text.matchAll(
      /较强|良好|一定|丰富|熟练掌握|\b(?:excellent|good|various|several)\b|\bresponsible for\b/gi,
    ))
      add('vague', match[0], '可用已发生的行动、使用的方法或真实成果，具体说明这处表述。');
    for (const sentence of text.split(/[。！？!?\n]|\.(?=\s|$)/)) {
      const trimmed = sentence.trim();
      const chinese = trimmed.match(/[\u3400-\u9fff]/g)?.length ?? 0;
      const words = trimmed.match(/\b[\p{L}\p{N}]+\b/gu)?.length ?? 0;
      if (chinese >= 80 || words >= 40)
        add('long', trimmed, '这句话较长，可按行动与结果拆分，让每句话表达一个重点。');
    }
  }
  return issues;
}
