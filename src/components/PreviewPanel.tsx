import { useI18n, t, errorText } from '../i18n';
import { useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import ResumeDocument from '../resume/ResumeDocument';
import ResumePages from '../resume/ResumePages';
import { PAGE_WIDTH, PAGE_HEIGHT, PAGE_GAP } from '../resume/pagination.ts';
import type { ResumeDocument as Document } from '../resume/model.ts';
import { Button, IconButton } from './ui';
import type { EditorTarget } from './editorNavigation';

export function Thumbnail({ document }: { document: Document }) {
  useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => setScale(entries[0].contentRect.width / 794));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="document-thumbnail" aria-hidden="true">
      <div className="thumbnail-scale" style={{ transform: `scale(${scale})` }}>
        <ResumeDocument document={document} miniature />
      </div>
    </div>
  );
}

export default function PreviewPanel({
  pages,
  error,
  documentId,
  onLocate,
}: {
  pages: HTMLElement[];
  error: string;
  documentId?: string;
  onLocate?: (target: EditorTarget) => void;
}) {
  useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.65);
  const [zoom, setZoom] = useState<number | null>(null);
  const [selectable, setSelectable] = useState(false);
  const scale = zoom ?? fit;
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      if (viewport.current)
        setFit(Math.min(0.95, Math.max(0.25, (viewport.current.clientWidth - 48) / PAGE_WIDTH)));
    });
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, []);
  return (
    <section className="preview-panel" aria-label={t('实时预览')}>
      <div className="preview-toolbar">
        <span>
          <span className="preview-marker" aria-hidden="true" />
          {t('实时预览')}
        </span>
        {onLocate && (
          <Button
            className="preview-edit-toggle"
            aria-pressed={selectable}
            onClick={() => setSelectable(!selectable)}
          >
            {t('点选预览编辑')}
          </Button>
        )}
        <span className="paper-label" aria-live="polite">
          A4 · {t('共 {count} 页', { count: pages.length })}
          {pages[0]?.dataset.onePageFit === 'fitted' && (
            <>
              {' '}
              ·{' '}
              {t('排版比例 {percent}%', {
                percent: Math.round(Number(pages[0].dataset.onePageScale || 1) * 100),
              })}
            </>
          )}
        </span>
        {pages.length > 1 && (
          <select
            aria-label={t('跳转到页')}
            className="page-jump"
            defaultValue="1"
            key={pages.length}
            onChange={(event) =>
              viewport.current?.scrollTo({
                top: (Number(event.target.value) - 1) * (PAGE_HEIGHT + PAGE_GAP) * scale,
                behavior: 'smooth',
              })
            }
          >
            {pages.map((_, index) => (
              <option key={index} value={index + 1}>
                {t('第 {count} 页', { count: index + 1 })}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="preview-viewport" ref={viewport}>
        {pages[0]?.dataset.onePageFit === 'cannot-fit' && (
          <p className="pagination-error" role="status">
            {t('内容超过自动一页的缩放范围，已保留完整多页排版。')}
          </p>
        )}
        {pages[0]?.dataset.onePageFit === 'manual-breaks' && (
          <p className="pagination-error" role="status">
            {t('已保留手动分页；关闭模块分页后可自动适配一页。')}
          </p>
        )}
        {error && (
          <p className="pagination-error" role="alert">
            {errorText(error)}
          </p>
        )}
        <div
          className="paper-stage"
          style={{
            width: PAGE_WIDTH * scale,
            height: (pages.length * PAGE_HEIGHT + Math.max(0, pages.length - 1) * PAGE_GAP) * scale,
          }}
        >
          <div className="paper-scale" style={{ transform: `scale(${scale})` }}>
            <ResumePages
              pages={pages}
              selectable={selectable}
              onLocate={(target, id) => {
                if (id === documentId) onLocate?.(target);
              }}
            />
          </div>
        </div>
        <p className="preview-caption">{t('每一次认真介绍自己，都是一次新的可能。')}</p>
      </div>
      <div className="zoom-controls">
        <IconButton
          label={t('缩小预览')}
          disabled={scale <= 0.3}
          onClick={() => setZoom(Math.max(0.3, scale - 0.1))}
        >
          <Minus size={16} />
        </IconButton>
        <output aria-live="polite">{Math.round(scale * 100)}%</output>
        <IconButton
          label={t('放大预览')}
          disabled={scale >= 1.3}
          onClick={() => setZoom(Math.min(1.3, scale + 0.1))}
        >
          <Plus size={16} />
        </IconButton>
        <span className="control-divider" />
        <IconButton label={t('适应宽度')} onClick={() => setZoom(null)}>
          <Maximize2 size={15} />
        </IconButton>
      </div>
    </section>
  );
}
