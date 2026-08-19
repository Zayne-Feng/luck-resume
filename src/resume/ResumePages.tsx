import { useLayoutEffect, useRef } from 'react';
import { t, useI18n } from '../i18n';
import { previewEditorTarget, type EditorTarget } from '../components/editorNavigation';

export default function ResumePages({
  pages,
  selectable = false,
  onLocate,
}: {
  pages: HTMLElement[];
  selectable?: boolean;
  onLocate?: (target: EditorTarget, documentId: string) => void;
}) {
  const { locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.replaceChildren(...pages.map((page) => page.cloneNode(true)));
    if (!selectable || !ref.current) return;
    for (const element of ref.current.querySelectorAll<HTMLElement>(
      '.resume-header,.resume-section > h2,.resume-entry',
    )) {
      const label = element.querySelector('h1,h3')?.textContent || element.textContent || '';
      element.tabIndex = 0;
      element.setAttribute('role', 'button');
      element.setAttribute(
        'aria-label',
        t('编辑预览中的{name}', { name: label.trim().slice(0, 60) }),
      );
      element.dataset.previewEditTarget = 'true';
    }
    for (const link of ref.current.querySelectorAll('a')) {
      link.removeAttribute('href');
      link.tabIndex = -1;
    }
  }, [pages, selectable, locale]);
  const locate = (element: EventTarget | null) => {
    if (!selectable || !(element instanceof Element)) return;
    const target = previewEditorTarget(element);
    const documentId = element.closest<HTMLElement>('[data-document-id]')?.dataset.documentId;
    if (target && documentId) onLocate?.(target, documentId);
  };
  return (
    <div
      className={`resume-pages ${selectable ? 'preview-selecting' : ''}`}
      ref={ref}
      onClick={(event) => {
        if (!selectable) return;
        event.preventDefault();
        locate(event.target);
      }}
      onKeyDown={(event) => {
        if (selectable && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          locate(event.target);
        }
      }}
    />
  );
}
