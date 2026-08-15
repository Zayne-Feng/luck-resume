import { useI18n, t } from '../i18n';
import { useCallback, useState, type ReactNode } from 'react';
import { createRecoveryFiles, downloadRecoveryFile, type RecoveryFile } from '../resume/files.ts';
import { Button, Dialog } from './ui';

export default function RecoveryDownload({
  drafts,
  children,
  onError,
}: {
  drafts: unknown[];
  children: ReactNode;
  onError: (message: string) => void;
}) {
  useI18n();
  const [files, setFiles] = useState<RecoveryFile[] | null>(null);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const close = useCallback(() => setFiles(null), []);
  return (
    <>
      <Button
        onClick={() => {
          try {
            const parts = createRecoveryFiles(drafts);
            if (parts.length === 1 && parts[0].canImport) downloadRecoveryFile(parts[0]);
            else {
              setDownloaded([]);
              setFiles(parts);
            }
          } catch {
            onError('恢复文件无法下载，原始数据仍保留在当前设备或导入文件中。');
          }
        }}
      >
        {children}
      </Button>
      {files && (
        <Dialog title={t('下载分卷恢复文件')} onClose={close}>
          <p className="dialog-copy">
            {t('数据已分为 {count} 个文件，请逐个下载。可导入的分卷可通过「导入 JSON」分别恢复。', {
              count: files.length,
            })}
          </p>
          <ul className="recovery-parts">
            {files.map((file) => (
              <li key={file.name}>
                <div>
                  <strong>{file.name}</strong>
                  <small>
                    {(file.blob.size / 1024 / 1024).toFixed(2)} MB
                    {file.canImport ? '' : t(' · 原始大记录，需单独修复')}
                  </small>
                </div>
                <Button
                  onClick={() => {
                    downloadRecoveryFile(file);
                    setDownloaded((previous) => [...previous, file.name]);
                  }}
                >
                  {downloaded.includes(file.name) ? t('再次下载') : t('下载')}
                </Button>
              </li>
            ))}
          </ul>
          <div className="dialog-actions">
            <Button onClick={close}>{t('关闭')}</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
