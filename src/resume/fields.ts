import { safeLink, type Profile, type ResumeField } from './model.ts';
import { defaultFieldIcons } from './icons.ts';

export const profileFieldNames = {
  name: '姓名',
  headline: '求职意向',
  phone: '联系电话',
  email: '电子邮箱',
  location: '所在城市',
  website: '个人网站 / 作品集',
  birthday: '出生日期',
  employmentStatus: '求职状态',
} as const;
export type ProfileTextKey = keyof typeof profileFieldNames;
export const contactKeys = [
  'phone',
  'email',
  'location',
  'website',
  'birthday',
  'employmentStatus',
] as const;

export function profileContacts(profile: Profile): ResumeField[] {
  const builtin = contactKeys
    .filter((key) => !profile.removedFields?.includes(key))
    .map((key) => ({
      id: key,
      label: profile.fieldLabels?.[key] ?? profileFieldNames[key],
      value: profile[key] ?? '',
      kind: (key === 'website' ? 'link' : 'text') as ResumeField['kind'],
      visible: !profile.hiddenFields?.includes(key),
      showLabel: Boolean(profile.fieldLabels?.[key]),
      icon: profile.fieldIcons?.[key] ?? defaultFieldIcons[key],
    }));
  const fields: ResumeField[] = [...builtin, ...(profile.customFields ?? [])];
  const order = [...new Set([...(profile.contactOrder ?? []), ...fields.map((field) => field.id)])];
  return order
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is ResumeField => Boolean(field));
}

export function fieldLink(field: ResumeField): string | undefined {
  if (field.id === 'email') return safeLink(`mailto:${field.value}`);
  if (field.id === 'phone') return safeLink(`tel:${field.value}`);
  return field.kind === 'link' ? safeLink(field.value) : undefined;
}

export function fieldDisplayValue(field: ResumeField): string {
  return field.kind === 'link' && field.linkLabel?.trim() ? field.linkLabel : field.value;
}

export function moveById<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string,
): T[] {
  const from = items.findIndex((item) => item.id === sourceId),
    to = items.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return items;
  const result = [...items];
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
}
