import { useI18n } from '../i18n';
import { GripVertical } from 'lucide-react';
import type { DragEvent } from 'react';
import { useEffect, useRef } from 'react';
import { useWorkspace } from '../stores/useWorkspace.ts';
import { reorderDocument } from '../resume/reorder.ts';

const mime = 'application/x-luck-item';
export function draggedId(
  event: DragEvent,
  scope: string,
  documentId: string | null,
): string | null {
  if (!event.dataTransfer.types.includes(mime)) return null;
  try {
    const value = JSON.parse(event.dataTransfer.getData(mime));
    return value.scope === scope && value.documentId === documentId && typeof value.id === 'string'
      ? value.id
      : null;
  } catch {
    return null;
  }
}
export function acceptDrop(event: DragEvent) {
  if (event.dataTransfer.types.includes(mime)) event.preventDefault();
}
export default function DragHandle({
  id,
  scope,
  label,
}: {
  id: string;
  scope: string;
  label: string;
}) {
  useI18n();
  const pointer = useRef<{
    id: number;
    documentId: string | null;
    target: string;
    element: HTMLElement | null;
  } | null>(null);
  const clear = () => {
    pointer.current?.element?.removeAttribute('data-pointer-drop');
    pointer.current = null;
  };
  useEffect(() => clear, []);
  return (
    <button
      type="button"
      className="icon-button drag-handle"
      aria-label={label}
      title={label}
      data-luck-drag-id={id}
      data-luck-drag-scope={scope}
      style={{ touchAction: 'none' }}
      draggable
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' || !event.isPrimary) return;
        event.preventDefault();
        event.stopPropagation();
        clear();
        pointer.current = {
          id: event.pointerId,
          documentId: useWorkspace.getState().activeId,
          target: id,
          element: null,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = pointer.current;
        if (!current || current.id !== event.pointerId) return;
        event.preventDefault();
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const row = element?.closest<HTMLElement>(
          scope === 'sections' ? '.module-details' : '.entry-editor',
        );
        const handle =
          row &&
          Array.from(row.querySelectorAll<HTMLElement>('[data-luck-drag-id]')).find(
            (node) => node.dataset.luckDragScope === scope,
          );
        current.element?.removeAttribute('data-pointer-drop');
        current.target = handle?.dataset.luckDragId ?? id;
        current.element = handle ? (row ?? null) : null;
        current.element?.setAttribute('data-pointer-drop', 'true');
        const scroll = event.currentTarget.closest<HTMLElement>('.edit-panel-body');
        if (scroll) {
          const bounds = scroll.getBoundingClientRect();
          if (event.clientY < bounds.top + 45) scroll.scrollTop -= 18;
          else if (event.clientY > bounds.bottom - 45) scroll.scrollTop += 18;
        }
      }}
      onPointerUp={(event) => {
        const current = pointer.current;
        if (!current || current.id !== event.pointerId) return;
        event.preventDefault();
        if (
          current.documentId &&
          current.documentId === useWorkspace.getState().activeId &&
          current.target !== id
        )
          useWorkspace
            .getState()
            .update(
              (doc) => reorderDocument(doc, id, current.target, scope),
              undefined,
              current.documentId,
            );
        clear();
      }}
      onPointerCancel={clear}
      onLostPointerCapture={clear}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(
          mime,
          JSON.stringify({ id, scope, documentId: useWorkspace.getState().activeId }),
        );
      }}
    >
      <GripVertical size={14} />
    </button>
  );
}
