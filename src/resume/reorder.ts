import { moveById } from './fields.ts';
import type { ResumeDocument } from './model.ts';
export function reorderDocument(
  document: ResumeDocument,
  source: string,
  target: string,
  scope: string,
): void {
  if (source === target) return;
  if (scope === 'sections') document.sections = moveById(document.sections, source, target);
  else if (scope.startsWith('entries-')) {
    const section = document.sections.find((section) => section.id === scope.slice(8));
    if (section) section.items = moveById(section.items, source, target);
  }
}
