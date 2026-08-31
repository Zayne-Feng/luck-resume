import { useI18n, t } from '../i18n';
import {
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type PointerEvent,
  type SetStateAction,
} from 'react';
import {
  Columns2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import {
  clampEditorRatio,
  toggleWorkspacePanel,
  type InterfacePreferences,
} from '../storage/interfacePrefs.ts';

export function WorkspaceControls({
  preferences,
  onChange,
}: {
  preferences: InterfacePreferences;
  onChange: Dispatch<SetStateAction<InterfacePreferences>>;
}) {
  useI18n();
  return (
    <div className="workspace-controls" aria-label={t('工作区布局')}>
      <span>
        <Columns2 size={14} />
        {t('工作区')}
      </span>
      <button
        type="button"
        aria-label={preferences.editorHidden ? t('展开编辑区') : t('收起编辑区')}
        aria-pressed={!preferences.editorHidden}
        onClick={() => onChange((current) => toggleWorkspacePanel(current, 'editor'))}
      >
        {preferences.editorHidden ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        {preferences.editorHidden ? t('展开编辑') : t('收起编辑')}
      </button>
      <button
        type="button"
        aria-label={preferences.previewHidden ? t('展开预览区') : t('收起预览区')}
        aria-pressed={!preferences.previewHidden}
        onClick={() => onChange((current) => toggleWorkspacePanel(current, 'preview'))}
      >
        {preferences.previewHidden ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
        {preferences.previewHidden ? t('展开预览') : t('收起预览')}
      </button>
      <button
        type="button"
        onClick={() =>
          onChange((current) => ({
            ...current,
            editorRatio: 0.4,
            editorHidden: false,
            previewHidden: false,
          }))
        }
      >
        {t('恢复布局')}
      </button>
    </div>
  );
}

export function useWorkspaceLayout(
  preferences: InterfacePreferences,
  onChange: Dispatch<SetStateAction<InterfacePreferences>>,
) {
  const [workspace, workspaceRef] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!workspace) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(0, entry.contentRect.width - 16)),
    );
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [workspace]);
  const ratio = clampEditorRatio(preferences.editorRatio, width);
  const setRatio = (value: number) =>
    onChange((current) => ({ ...current, editorRatio: clampEditorRatio(value, width) }));
  return { workspaceRef, ratio, setRatio, width };
}

export function WorkspaceDivider({
  ratio,
  width,
  onChange,
}: {
  ratio: number;
  width: number;
  onChange: (ratio: number) => void;
}) {
  useI18n();
  const drag = useRef<{ pointerId: number; startX: number; startRatio: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const finish = (event: PointerEvent<HTMLDivElement>, cancel: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (cancel) onChange(current.startRatio);
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const next =
      event.key === 'ArrowLeft'
        ? ratio - step
        : event.key === 'ArrowRight'
          ? ratio + step
          : event.key === 'Home'
            ? 0.2
            : event.key === 'End'
              ? 0.8
              : null;
    if (next !== null) {
      event.preventDefault();
      onChange(next);
    }
  };
  return (
    <div
      className={`workspace-divider ${dragging ? 'is-dragging' : ''}`}
      role="separator"
      tabIndex={0}
      aria-label={t('调整编辑区宽度')}
      aria-orientation="vertical"
      aria-valuemin={Math.round(clampEditorRatio(0.2, width) * 100)}
      aria-valuemax={Math.round(clampEditorRatio(0.8, width) * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuetext={`编辑区 ${Math.round(ratio * 100)}%`}
      aria-controls="resume-editor-panel"
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startRatio: ratio };
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current && current.pointerId === event.pointerId && width > 0)
          onChange(current.startRatio + (event.clientX - current.startX) / width);
      }}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={() => {
        drag.current = null;
        setDragging(false);
      }}
    >
      <span />
    </div>
  );
}
