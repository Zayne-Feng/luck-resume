export interface EditorTarget {
  sectionId: string;
  entryId?: string;
  fieldId?: string;
}

export function openParentDetails(element: HTMLElement): void {
  let parent: HTMLElement | null = element;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
}

export function focusEditorTarget(target: EditorTarget): void {
  const module = document.getElementById(`module-${target.sectionId}`);
  const element =
    (target.entryId ? document.getElementById(`entry-${target.entryId}`) : module) ?? module;
  if (!element) return;
  openParentDetails(element);
  const field = target.fieldId;
  const selector =
    field === 'description'
      ? '[contenteditable="true"]'
      : field
        ? `[name="${CSS.escape(`${target.sectionId === 'profile' ? 'profile' : 'entry'}-${field}`)}"],[name="${CSS.escape(`custom-field-value-${field}`)}"]`
        : target.sectionId === 'profile'
          ? '[name="profile-name"]'
          : 'input:not([type=hidden]):not([type=file]),textarea,[contenteditable=true]';
  const control =
    element.querySelector<HTMLElement>(selector) ??
    element.querySelector<HTMLElement>(
      'input:not([type=hidden]):not([type=file]),textarea,[contenteditable=true]',
    );
  if (control) openParentDetails(control);
  (control ?? element).scrollIntoView({ block: 'center', behavior: 'auto' });
  control?.focus({ preventScroll: true });
}

export function previewEditorTarget(element: Element): EditorTarget | null {
  const entry = element.closest<HTMLElement>('[data-entry-id]');
  const section = element.closest<HTMLElement>('[data-section-id]');
  if (section) {
    return {
      sectionId: section.dataset.sectionId!,
      ...(entry ? { entryId: entry.dataset.entryId! } : {}),
      ...(element.closest('.resume-rich')
        ? { fieldId: 'description' }
        : element.closest('.resume-subtitle')
          ? { fieldId: 'subtitle' }
          : element.closest('h3')
            ? { fieldId: 'title' }
            : {}),
    };
  }
  if (element.closest('.resume-header')) {
    const fieldId =
      element.closest<HTMLElement>('[data-field-id]')?.dataset.fieldId ??
      (element.closest('.resume-headline') ? 'headline' : 'name');
    return { sectionId: 'profile', fieldId };
  }
  return null;
}
