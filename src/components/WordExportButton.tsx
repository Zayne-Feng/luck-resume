import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from './ui';
import { t, useI18n } from '../i18n';
import type { ResumeDocument } from '../resume/model.ts';

export default function WordExportButton({
  document,
  onError,
}: {
  document: ResumeDocument;
  onError: (message: string) => void;
}) {
  useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      aria-label={t('导出 Word')}
      title={t('按模块顺序以单栏导出可编辑 Word，保留文字格式、链接、表格和图片')}
      onClick={async () => {
        setBusy(true);
        try {
          const { downloadDocx } = await import('../resume/docxExport.ts');
          await downloadDocx(document);
        } catch {
          onError('无法导出 Word，请检查图片内容后重试。');
        } finally {
          setBusy(false);
        }
      }}
    >
      <FileText size={16} />
      <span className="action-label">{t(busy ? '正在导出 Word…' : '导出 Word')}</span>
    </Button>
  );
}
