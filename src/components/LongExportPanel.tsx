import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { ResumeDocument } from '../resume/model.ts';
import {
  exportLongResume,
  type LongExportProgress,
  type LongExportResult,
} from '../resume/longExport.ts';
import type { LongExportFormat } from '../resume/longExportGeometry.ts';
import { Button } from './ui';
import './longExport.css';

interface DownloadResult extends Omit<LongExportResult, 'files'> {
  files: { filename: string; url: string }[];
}

export default function LongExportPanel({ document }: { document: ResumeDocument }) {
  const { t, errorText } = useI18n();
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<LongExportProgress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DownloadResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);

  useEffect(() => {
    setResult(null);
    setError('');
    setProgress(null);
    setBusy(false);
    setCancelling(false);
    return () => {
      version.current++;
      controller.current?.abort();
      controller.current = null;
    };
  }, [document.id]);

  useEffect(
    () => () => {
      result?.files.forEach((file) => URL.revokeObjectURL(file.url));
    },
    [result],
  );

  const start = async (format: LongExportFormat) => {
    if (controller.current) return;
    const current = new AbortController();
    const job = ++version.current;
    controller.current = current;
    setBusy(true);
    setCancelling(false);
    setError('');
    setResult(null);
    setProgress({ stage: 'preparing', completed: 0, total: 1 });
    try {
      const exported = await exportLongResume(document, format, {
        signal: current.signal,
        onProgress: (next) => {
          if (version.current === job && !current.signal.aborted) setProgress(next);
        },
      });
      if (version.current !== job || current.signal.aborted) return;
      const downloadable: DownloadResult = {
        ...exported,
        files: exported.files.map((file) => ({
          filename: file.filename,
          url: URL.createObjectURL(file.blob),
        })),
      };
      setResult(downloadable);
      if (downloadable.files.length === 1) {
        const link = window.document.createElement('a');
        link.href = downloadable.files[0].url;
        link.download = downloadable.files[0].filename;
        link.click();
      }
    } catch (caught) {
      if (version.current !== job) return;
      if (current.signal.aborted) setProgress(null);
      else
        setError(errorText(caught instanceof Error ? caught.message : t('长图导出失败，请重试。')));
    } finally {
      if (version.current === job) {
        controller.current = null;
        setBusy(false);
        setCancelling(false);
      }
    }
  };

  const status = cancelling
    ? t('正在取消，当前图片处理结束后停止…')
    : progress?.stage === 'preparing'
      ? t('正在准备字体和图片…')
      : progress?.stage === 'encoding'
        ? t('正在生成文件…')
        : t('正在渲染长图…');

  return (
    <section className="transfer-export long-export-panel" aria-label={t('长图与长页 PDF')}>
      <h3>{t('长图与长页 PDF')}</h3>
      <p>
        {t('按当前模板导出连续内容，保留字体与图片。长页 PDF 为单页图片式 PDF，文字不可选择。')}
      </p>
      <div className="transfer-actions">
        <Button disabled={busy} onClick={() => void start('png')}>
          {t('导出长图 PNG')}
        </Button>
        <Button disabled={busy} onClick={() => void start('pdf')}>
          {t('导出长页 PDF')}
        </Button>
        {busy && (
          <Button
            disabled={cancelling}
            onClick={() => {
              setCancelling(true);
              controller.current?.abort();
            }}
          >
            {t('取消导出')}
          </Button>
        )}
      </div>
      {busy && (
        <div className="long-export-progress" role="status" aria-live="polite">
          <span>{status}</span>
          <progress
            max={progress?.total || 1}
            value={progress?.completed || 0}
            aria-label={t('导出进度')}
          />
        </div>
      )}
      {error && (
        <p className="transfer-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="long-export-result" role="status">
          <p>
            {result.segmented
              ? t('内容较长，已按原清晰度分段。请按编号下载全部图片，顺序拼接后即为完整简历。')
              : t('导出完成。若下载未自动开始，可点击下面的文件。')}
          </p>
          <ul>
            {result.files.map((file) => (
              <li key={file.filename}>
                <a href={file.url} download={file.filename}>
                  {file.filename}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
