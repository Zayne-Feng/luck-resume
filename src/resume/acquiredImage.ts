import type { ResumeDocument } from './model.ts';
type ImageTarget =
  | { kind: 'photo' }
  | { kind: 'image' | 'logo'; sectionId: string; entryId: string };
export function replaceAcquiredImage(
  document: ResumeDocument,
  target: ImageTarget,
  previous: string | undefined,
  value: string,
): boolean {
  if (target.kind === 'photo') {
    if (document.profile.photo !== (previous ?? '')) return false;
    document.profile.photo = value;
  } else {
    const entry = document.sections
      .find((section) => section.id === target.sectionId)
      ?.items.find((item) => item.id === target.entryId);
    if (!entry || (entry[target.kind] ?? '') !== (previous ?? '')) return false;
    entry[target.kind] = value;
  }
  return true;
}
