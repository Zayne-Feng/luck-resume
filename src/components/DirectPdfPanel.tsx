import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { ResumeDocument } from '../resume/model.ts';
import { Button } from './ui';

export default function DirectPdfPanel({ document }: { document: ResumeDocument }) {
  const { t, errorText } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  useEffect(
    () => () => {
      version.current++;
      controller.current?.abort();
    },
    [document.id],
  );
  return (
    <section className="transfer-export" aria-label={t('直接下载分页 PDF')}>
      <h3>{t('直接下载分页 PDF')}</h3>
      <p>{t('按当前 A4 分页生成可选择文字的 PDF，由本站服务临时渲染，不保存简历。')}</p>
      <div className="transfer-actions">
        <Button
          disabled={busy}
          onClick={async () => {
            const job = ++version.current;
            const current = new AbortController();
            controller.current = current;
            setBusy(true);
            setMessage('');
            try {
              const { downloadDirectPdf } = await import('../resume/htmlExport.ts');
              await downloadDirectPdf(document, current.signal);
              if (version.current === job) setMessage(t('PDF 已生成。'));
            } catch (error) {
              if (version.current === job)
                setMessage(current.signal.aborted ? t('已取消导出。') : errorText(error));
            } finally {
              if (version.current === job) {
                setBusy(false);
                controller.current = null;
              }
            }
          }}
        >
          {busy ? t('正在生成 PDF…') : t('下载 A4 PDF 文件')}
        </Button>
        {busy && <Button onClick={() => controller.current?.abort()}>{t('取消导出')}</Button>}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
