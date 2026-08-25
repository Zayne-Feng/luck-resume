import { useI18n, t, errorText } from '../i18n';
import { lazy, Suspense, useRef, useState } from 'react';
import { MAX_IMPORT_FILE_BYTES } from '../resume/files.ts';
import { textContent, type ResumeDocument } from '../resume/model.ts';
import { downloadMarkdown, parseTextImport, type TextImportResult } from '../resume/transfer.ts';
import { Button, Dialog, Field } from './ui';
import LocalFilePanel from './LocalFilePanel';
import DirectoryBackupPanel from './DirectoryBackupPanel';
import LongExportPanel from './LongExportPanel';
import DocumentImportPanel from './DocumentImportPanel';
import DirectPdfPanel from './DirectPdfPanel';
import ReferenceImportPanel from './ReferenceImportPanel';
import SemanticImportPanel from '../ai/SemanticImportPanel';
import type { DirectoryBackupController } from '../storage/useDirectoryBackup.ts';
import type { LocalFilesController } from '../storage/useLocalFiles.ts';
const WorkspaceBackupPanel = lazy(() => import('./WorkspaceBackupPanel'));

export default function TransferDialog({
  document,
  onImport,
  onClose,
  onExportHtml,
  localFiles,
  directoryBackup,
  documents,
  onWorkspaceImported,
}: {
  document: ResumeDocument | null;
  onImport: (document: ResumeDocument) => void;
  onClose: () => void;
  onExportHtml?: () => Promise<void>;
  localFiles: LocalFilesController;
  directoryBackup: DirectoryBackupController;
  documents: ResumeDocument[];
  onWorkspaceImported: (documents: ResumeDocument[]) => void;
}) {
  useI18n();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [result, setResult] = useState<TextImportResult | null>(null);
  const [useEmbedded, setUseEmbedded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const readVersion = useRef(0);
  const preview =
    useEmbedded && result?.embeddedDocument ? result.embeddedDocument : result?.document;
  const clearPreview = () => {
    setResult(null);
    setUseEmbedded(false);
    setError('');
  };
  return (
    <Dialog title={t('导入与导出')} onClose={onClose} wide>
      <div className="transfer-dialog">
        <LocalFilePanel files={localFiles} />
        <DirectoryBackupPanel controller={directoryBackup} />
        <Suspense fallback={null}>
          <WorkspaceBackupPanel documents={documents} onImported={onWorkspaceImported} />
        </Suspense>
        {document && <LongExportPanel document={document} />}
        {document && <DirectPdfPanel document={document} />}
        <DocumentImportPanel onImport={onImport} onClose={onClose} />
        <ReferenceImportPanel onImport={onImport} onClose={onClose} />
        <SemanticImportPanel onImport={onImport} onClose={onClose} />
        {document && (
          <section className="transfer-export" aria-label={t('导出当前简历')}>
            <h3>{t('导出当前简历')}</h3>
            <p>
              {t(
                'Markdown 可导出可见文字正文。附带完整原稿后，重新导入还能保留字段、隐藏内容、图片和排版。',
              )}
            </p>
            <label className="check-field">
              <input
                type="checkbox"
                checked={includeOriginal}
                onChange={(event) => setIncludeOriginal(event.target.checked)}
              />
              {t('附带完整原稿（含隐藏内容，适合备份）')}
            </label>
            <div className="transfer-actions">
              <Button
                disabled={busy}
                onClick={() => {
                  try {
                    downloadMarkdown(document, includeOriginal);
                    setError('');
                  } catch (error) {
                    setError(error instanceof Error ? error.message : 'Markdown 导出失败。');
                  }
                }}
              >
                {t('导出 Markdown')}
              </Button>
              {onExportHtml && (
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await onExportHtml();
                    } catch (error) {
                      setError(error instanceof Error ? error.message : 'HTML 导出失败。');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t('导出独立 HTML')}
                </Button>
              )}
            </div>
          </section>
        )}
        <section className="transfer-import" aria-label={t('导入本地文字')}>
          <h3>{t('导入 Markdown 或文本')}</h3>
          <p>{t('选择本地文件或粘贴文字，在预览后创建新简历。')}</p>
          <Field
            label={t('选择 Markdown 或文本文件')}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            disabled={busy}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              const version = ++readVersion.current;
              clearPreview();
              if (!/\.(md|markdown|txt)$/i.test(file.name)) {
                setError('请选择 .md、.markdown 或 .txt 文件。');
                return;
              }
              if (file.size > MAX_IMPORT_FILE_BYTES) {
                setError('文件超过 64 MB，请选择较小的文件。');
                return;
              }
              setBusy(true);
              try {
                const content = await file.text();
                if (version !== readVersion.current) return;
                setText(content);
                setTitle(file.name.replace(/\.(md|markdown|txt)$/i, ''));
              } catch (error) {
                setError(error instanceof Error ? error.message : '无法读取文件。');
              } finally {
                if (version === readVersion.current) setBusy(false);
              }
            }}
          />
          <Field
            label={t('新简历标题')}
            value={title}
            placeholder={t('留空时使用正文标题')}
            onChange={(event) => {
              setTitle(event.target.value);
              clearPreview();
            }}
          />
          <label className="field transfer-text">
            <span>{t('Markdown 或文本内容')}</span>
            <textarea
              aria-label={t('Markdown 或文本内容')}
              rows={9}
              value={text}
              disabled={busy}
              onChange={(event) => {
                readVersion.current++;
                setText(event.target.value);
                clearPreview();
              }}
              placeholder={t('填写姓名、经历标题和成果，可使用 Markdown 格式。')}
            />
          </label>
          <div className="transfer-actions">
            <Button
              disabled={busy || !text.trim()}
              onClick={() => {
                try {
                  setResult(parseTextImport(text, title));
                  setUseEmbedded(false);
                  setError('');
                } catch (error) {
                  setResult(null);
                  setError(error instanceof Error ? error.message : '无法解析文字。');
                }
              }}
            >
              {t('预览导入')}
            </Button>
          </div>
        </section>
        {error && (
          <p className="transfer-error" role="alert">
            {errorText(error)}
          </p>
        )}
        {result && (
          <section className="transfer-result" aria-label={t('导入预览')}>
            {result.warnings.length > 0 && (
              <ul className="transfer-warnings">
                {result.warnings.map((warning) => (
                  <li key={warning}>{errorText(warning)}</li>
                ))}
              </ul>
            )}
            {result.embeddedDocument && (
              <fieldset className="transfer-source">
                <legend>{t('选择导入内容')}</legend>
                <label>
                  <input
                    type="radio"
                    name="transfer-source"
                    checked={!useEmbedded}
                    onChange={() => setUseEmbedded(false)}
                  />
                  {t('修改后的 Markdown 正文')}
                </label>
                <label>
                  <input
                    type="radio"
                    name="transfer-source"
                    checked={useEmbedded}
                    onChange={() => setUseEmbedded(true)}
                  />
                  {t('文件内保存的完整原稿')}
                </label>
              </fieldset>
            )}
            {preview && (
              <div className="transfer-preview">
                <h3>{preview.title}</h3>
                {preview.profile.name && <p>{preview.profile.name}</p>}
                {preview.profile.headline && <p>{preview.profile.headline}</p>}
                {preview.sections.map((section) => (
                  <div key={section.id}>
                    <h4>
                      {section.title}
                      {!section.visible && <small>{t('（已隐藏）')}</small>}
                    </h4>
                    {section.items.map((item) => (
                      <div key={item.id}>
                        {item.title && <strong>{item.title}</strong>}
                        {item.subtitle && <p>{item.subtitle}</p>}
                        <p className="transfer-preview-text">{textContent(item.description)}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="transfer-actions">
              <Button
                variant="primary"
                disabled={!preview || busy}
                onClick={() => {
                  if (preview) {
                    onImport(preview);
                    onClose();
                  }
                }}
              >
                {t('确认导入为新简历')}
              </Button>
              <Button onClick={onClose}>{t('取消')}</Button>
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}
