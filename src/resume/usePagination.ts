import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ResumeDocument } from './model.ts';
import { paginateResume } from './pagination.ts';
import { ensureResumeFont } from './fonts.ts';

export function usePagination(document: ResumeDocument | null) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{
    document: ResumeDocument | null;
    pages: HTMLElement[];
    error: string;
  }>({ document: null, pages: [], error: '' });
  const [fontState, setFontState] = useState({ font: '', ready: false, error: '' });
  const font = document?.appearance.font;
  useLayoutEffect(() => {
    if (!font) return;
    let disposed = false;
    setFontState({ font, ready: false, error: '' });
    void ensureResumeFont(font)
      .then(() => {
        if (!disposed) setFontState({ font, ready: true, error: '' });
      })
      .catch(() => {
        if (!disposed)
          setFontState({ font, ready: false, error: '字体未能加载，请刷新或选择另一种字体。' });
      });
    return () => {
      disposed = true;
    };
  }, [font]);

  const refreshPagination = useCallback(() => {
    const source = sourceRef.current?.querySelector<HTMLElement>('.resume-document');
    if (!source || !document || source.offsetWidth === 0) return false;
    const host = window.document.createElement('div');
    sourceRef.current!.append(host);
    try {
      const pages = paginateResume(source, host);
      setResult((previous) =>
        previous.document === document &&
        !previous.error &&
        previous.pages.length === pages.length &&
        previous.pages.every((page, index) => page.isEqualNode(pages[index]))
          ? previous
          : { document, pages, error: '' },
      );
      return true;
    } catch (error) {
      setResult({
        document,
        pages: [],
        error: error instanceof Error ? error.message : '无法完成分页，请调整排版。',
      });
      return false;
    } finally {
      host.remove();
    }
  }, [document]);

  useLayoutEffect(() => {
    const source = sourceRef.current?.querySelector<HTMLElement>('.resume-document');
    if (!source || !document) return;
    let disposed = false;
    let frame = 0;
    const measure = () => {
      if (!disposed) refreshPagination();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(source);
    source.addEventListener('load', schedule, true);
    window.document.fonts.addEventListener('loadingdone', schedule);
    void window.document.fonts.ready.then(() => {
      if (!disposed) schedule();
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      source.removeEventListener('load', schedule, true);
      window.document.fonts.removeEventListener('loadingdone', schedule);
    };
  }, [document, refreshPagination, fontState]);

  return {
    sourceRef,
    pages: result.pages,
    paginationError: fontState.error || result.error,
    paginationReady:
      result.document === document &&
      result.pages.length > 0 &&
      fontState.font === font &&
      fontState.ready,
    refreshPagination,
  };
}
