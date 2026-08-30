import {
  hasEntryContent,
  richTextSeparator,
  safeLink,
  textContent,
  type ResumeDocument,
  type ResumeField,
  type RichTextNode,
} from '../resume/model.ts';
import { profileFieldNames } from '../resume/fields.ts';
import { formatResumeDate, normalizeBirthDate } from '../resume/dates.ts';
import { validateRichText } from '../resume/files.ts';
import { applySuggestion, type GrammarSuggestion } from './results.ts';

export interface GrammarField {
  sectionId: string;
  entryId?: string;
  field: string;
  customId?: string;
  labelKey?: string;
  label: string;
  text: string;
  start: number;
}

interface EditableGrammarField extends GrammarField {
  limit: number;
  write: (text: string, suggestion: GrammarSuggestion) => boolean;
}

export function sameGrammarField(left: GrammarField, right: GrammarField): boolean {
  return (
    left.sectionId === right.sectionId &&
    left.entryId === right.entryId &&
    left.field === right.field &&
    left.customId === right.customId &&
    left.labelKey === right.labelKey
  );
}

function editableFields(
  document: ResumeDocument,
  translate = (message: string) => message,
): EditableGrammarField[] {
  const fields: EditableGrammarField[] = [];
  const add = (
    identity: Omit<GrammarField, 'start' | 'text'>,
    text: string | undefined,
    limit: number,
    write: (text: string, suggestion: GrammarSuggestion) => boolean,
  ) => {
    if (text?.trim()) fields.push({ ...identity, text, start: 0, limit, write });
  };
  const addText = (
    identity: Omit<GrammarField, 'start' | 'text'>,
    text: string | undefined,
    limit: number,
    write: (text: string) => void,
  ) =>
    add(identity, text, limit, (next) => {
      write(next);
      return true;
    });
  const customFields = (
    items: ResumeField[] | undefined,
    sectionId: string,
    label: string,
    entryId?: string,
  ) => {
    for (const item of items ?? []) {
      if (
        !item.visible ||
        !(item.kind === 'link' ? item.linkLabel?.trim() || item.value.trim() : item.value.trim())
      )
        continue;
      const identity = { sectionId, entryId, customId: item.id, label: `${label} · ${item.label}` };
      if (item.showLabel)
        addText(
          {
            ...identity,
            field: 'customLabel',
            label: `${identity.label} · ${translate('字段名称')}`,
          },
          item.label,
          100,
          (next) => {
            item.label = next;
          },
        );
      if (item.kind === 'link') {
        if (item.linkLabel?.trim())
          addText(
            {
              ...identity,
              field: 'customLinkLabel',
              label: `${identity.label} · ${translate('链接显示文字')}`,
            },
            item.linkLabel,
            300,
            (next) => {
              item.linkLabel = next;
            },
          );
      } else
        addText(
          { ...identity, field: 'custom', label: `${identity.label} · ${translate('字段内容')}` },
          item.value,
          20000,
          (next) => {
            item.value = next;
          },
        );
    }
  };
  const profile = document.profile;
  const profileLimits = {
    name: 100,
    headline: 300,
    phone: 100,
    email: 200,
    location: 200,
    employmentStatus: 100,
  };
  for (const key of Object.keys(profileLimits) as (keyof typeof profileLimits)[]) {
    if (profile.hiddenFields?.includes(key) || profile.removedFields?.includes(key)) continue;
    const label = `${translate('基本信息')} · ${profile.fieldLabels?.[key] || translate(profileFieldNames[key])}`;
    addText(
      { sectionId: 'profile', field: key, label },
      profile[key],
      profileLimits[key],
      (next) => {
        profile[key] = next;
      },
    );
    if (profile[key]?.trim() || key === 'name' || key === 'headline')
      addText(
        {
          sectionId: 'profile',
          field: 'fieldLabel',
          labelKey: key,
          label: `${label} · ${translate('字段名称')}`,
        },
        profile.fieldLabels?.[key],
        100,
        (next) => {
          profile.fieldLabels![key] = next;
        },
      );
  }
  if (
    profile.website.trim() &&
    !profile.hiddenFields?.includes('website') &&
    !profile.removedFields?.includes('website')
  )
    addText(
      {
        sectionId: 'profile',
        field: 'fieldLabel',
        labelKey: 'website',
        label: `${translate(profileFieldNames.website)} · ${translate('字段名称')}`,
      },
      profile.fieldLabels?.website,
      100,
      (next) => {
        profile.fieldLabels!.website = next;
      },
    );
  if (
    profile.birthday?.trim() &&
    !profile.hiddenFields?.includes('birthday') &&
    !profile.removedFields?.includes('birthday')
  ) {
    add(
      { sectionId: 'profile', field: 'birthday', label: translate(profileFieldNames.birthday) },
      profile.birthday,
      10,
      (next) => {
        const valid = normalizeBirthDate(next);
        if (valid === undefined) return false;
        profile.birthday = valid;
        return true;
      },
    );
    addText(
      {
        sectionId: 'profile',
        field: 'fieldLabel',
        labelKey: 'birthday',
        label: `${translate(profileFieldNames.birthday)} · ${translate('字段名称')}`,
      },
      profile.fieldLabels?.birthday,
      100,
      (next) => {
        profile.fieldLabels!.birthday = next;
      },
    );
  }
  if (profile.contributions?.visible)
    addText(
      { sectionId: 'profile', field: 'contributionsTitle', label: profile.contributions.title },
      profile.contributions.title,
      300,
      (next) => {
        profile.contributions!.title = next;
      },
    );
  customFields(profile.customFields, 'profile', translate('基本信息'));
  for (const section of document.sections) {
    if (!section.visible || !section.items.some(hasEntryContent)) continue;
    if (section.showTitle !== false)
      addText(
        {
          sectionId: section.id,
          field: 'sectionTitle',
          label: `${section.title} · ${translate('模块名称')}`,
        },
        section.title,
        100,
        (next) => {
          section.title = next;
        },
      );
    for (const entry of section.items) {
      if (!hasEntryContent(entry)) continue;
      const hidden = entry.hiddenFields ?? [];
      const label = `${section.title} · ${entry.title || '#'}`;
      const identity = { sectionId: section.id, entryId: entry.id, label };
      const limits = { title: 300, subtitle: 300, degree: 300, gpa: 100, location: 200 };
      const names = {
        title: '标题',
        subtitle: '副标题',
        degree: '学历 / 学位',
        gpa: 'GPA',
        location: '地点',
      };
      for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
        if (
          hidden.includes(key) ||
          (key === 'degree' &&
            entry.degree?.trim() === (hidden.includes('subtitle') ? '' : entry.subtitle.trim()))
        )
          continue;
        const fieldLabel = `${label} · ${entry.fieldLabels?.[key] || translate(names[key])}`;
        addText({ ...identity, field: key, label: fieldLabel }, entry[key], limits[key], (next) => {
          entry[key] = next;
        });
        if (entry[key]?.trim() && key !== 'location')
          addText(
            {
              ...identity,
              field: 'fieldLabel',
              labelKey: key,
              label: `${fieldLabel} · ${translate('字段名称')}`,
            },
            entry.fieldLabels?.[key],
            100,
            (next) => {
              entry.fieldLabels![key] = next;
            },
          );
      }
      if (!hidden.includes('dates'))
        for (const key of ['startDate', 'endDate'] as const) {
          if (key === 'endDate' && entry.current) continue;
          const display = formatResumeDate(
            entry[key],
            document.appearance.dateFormat,
            document.appearance.language,
          );
          addText(
            {
              ...identity,
              field: key,
              label: `${label} · ${translate(key === 'startDate' ? '开始时间' : '结束时间')}`,
            },
            display,
            30,
            (next) => {
              entry[key] = next;
            },
          );
        }
      if (!hidden.includes('link') && entry.link && safeLink(entry.link) && entry.linkLabel?.trim())
        addText(
          { ...identity, field: 'linkLabel', label: `${label} · ${translate('链接显示文字')}` },
          entry.linkLabel,
          300,
          (next) => {
            entry.linkLabel = next;
          },
        );
      if (!hidden.includes('publication') && entry.publication) {
        for (const key of ['authors', 'venue'] as const)
          addText(
            {
              ...identity,
              field: `publication.${key}`,
              label: `${label} · ${translate(key === 'authors' ? '作者列表' : '期刊 / 会议')}`,
            },
            entry.publication[key],
            key === 'authors' ? 20000 : 1000,
            (next) => {
              entry.publication![key] = next;
            },
          );
      }
      if (!hidden.includes('description'))
        add(
          { ...identity, field: 'description', label: `${label} · ${translate('描述')}` },
          textContent(entry.description),
          Infinity,
          (next, suggestion) => {
            const replacement = replaceRich(entry.description, suggestion);
            if (!replacement || textContent(replacement) !== next) return false;
            try {
              const valid = validateRichText(replacement);
              if (valid.type !== 'doc' || textContent(valid) !== next) return false;
              entry.description = valid;
              return true;
            } catch {
              return false;
            }
          },
        );
      customFields(entry.customFields, section.id, label, entry.id);
    }
  }
  let offset = 0;
  for (const field of fields) {
    field.start = offset;
    offset += field.text.length + 2;
  }
  return fields;
}

export function grammarFields(
  document: ResumeDocument,
  translate?: (message: string) => string,
): GrammarField[] {
  return editableFields(document, translate).map(
    ({ limit: _limit, write: _write, ...field }) => field,
  );
}

export function grammarSource(fields: GrammarField[]) {
  return fields.map((field) => field.text).join('\n\n');
}

export function suggestionField(fields: GrammarField[], suggestion: GrammarSuggestion) {
  return fields.find(
    (field) =>
      suggestion.start >= field.start &&
      suggestion.start + suggestion.original.length <= field.start + field.text.length,
  );
}

function replaceRich(node: RichTextNode, suggestion: GrammarSuggestion): RichTextNode | undefined {
  const start = suggestion.start;
  const end = start + suggestion.original.length;
  let position = 0;
  let inserted = false;
  let crossesCell = false;
  const visit = (input: RichTextNode): RichTextNode | undefined => {
    const left = position;
    if (input.type === 'text') {
      position += input.text?.length ?? 0;
      if (left >= end || position <= start) return input;
      const text =
        (input.text ?? '').slice(0, Math.max(0, start - left)) +
        (!inserted ? suggestion.replacement : '') +
        (input.text ?? '').slice(Math.max(0, end - left));
      inserted = true;
      return text ? { ...input, text } : undefined;
    }
    if (input.type === 'hardBreak') {
      position++;
      return input;
    }
    const content = input.content?.flatMap((child, index) => {
      if (index > 0) position += richTextSeparator(input).length;
      const result = visit(child);
      return result ? [result] : [];
    });
    if (
      (input.type === 'tableCell' || input.type === 'tableHeader') &&
      start < position &&
      end > left &&
      (start < left || end > position)
    )
      crossesCell = true;
    return content ? { ...input, content } : input;
  };
  const result = visit(node);
  return crossesCell || !inserted ? undefined : result;
}

export function applyGrammar(
  document: ResumeDocument,
  field: GrammarField,
  suggestion: GrammarSuggestion,
): boolean {
  const current = editableFields(document).find((item) => sameGrammarField(item, field));
  const local = { ...suggestion, start: suggestion.start - field.start };
  if (
    !current ||
    current.text !== field.text ||
    !Number.isInteger(local.start) ||
    local.start < 0 ||
    !local.original ||
    field.text.slice(local.start, local.start + local.original.length) !== local.original
  )
    return false;
  const next = applySuggestion(field.text, local);
  if (next.length > current.limit) return false;
  return current.write(next, local);
}
