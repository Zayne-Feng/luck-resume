import { useEffect, useId, useRef, useState } from 'react';
import { useI18n, t, errorText } from '../i18n';
import {
  DocumentImportSession,
  isDocumentImportCancelled,
  type DocumentImportMode,
  type ImportedPage,
  type ImportProgress,
  type OcrLanguage,
  type PasswordRequest,
} from '../resume/documentImport.ts';
import { parseDocumentPages } from '../resume/documentImportHelpers.ts';
import { parseTextImport, type TextImportResult } from '../resume/transfer.ts';
import { textContent, type ResumeDocument } from '../resume/model.ts';
import { Button, Field } from './ui';
import './documentImport.css';

export default function DocumentImportPanel({
  onImport,
  onClose,
}: {
  onImport: (document: ResumeDocument) => void;
  onClose: () => void;
}) {
  useI18n();
  const modeId = useId();
  const languageId = useId();
  const session = useRef<DocumentImportSession>();
  const version = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [selection, setSelection] = useState<'all' | 'range'>('all');
  const [range, setRange] = useState('');
  const [mode, setMode] = useState<DocumentImportMode>('automatic');
  const [language, setLanguage] = useState<OcrLanguage>('eng+chi_sim');
  const [passwordRequest, setPasswordRequest] = useState<PasswordRequest | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pages, setPages] = useState<ImportedPage[]>([]);
  const [blankPages, setBlankPages] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState<TextImportResult | null>(null);
  const missingPages = pages.filter((page) => !page.text.trim() && !blankPages.includes(page.page));

  useEffect(
    () => () => {
      version.current++;
      session.current?.dispose();
    },
    [],
  );

  const clearReview = () => {
    setPages([]);
    setBlankPages([]);
    setPreview(null);
    setError('');
    setNotice('');
  };

  const cancel = () => {
    version.current++;
    session.current?.dispose();
    session.current = undefined;
    setBusy(false);
    setFile(null);
    setPageCount(0);
    setPasswordRequest(null);
    setPassword('');
    setProgress(null);
    clearReview();
    setNotice(t('已取消文档读取。'));
  };

  const loadFile = async (nextFile: File) => {
    const currentVersion = ++version.current;
    session.current?.dispose();
    session.current = undefined;
    clearReview();
    setFile(nextFile);
    setPageCount(0);
    setPasswordRequest(null);
    setPassword('');
    setSelection('all');
    setRange('');
    setTitle(nextFile.name.replace(/\.[^.]+$/, ''));
    setBusy(true);
    setProgress({ phase: 'loading', completed: 0, total: 0 });
    try {
      const nextSession = new DocumentImportSession(nextFile);
      session.current = nextSession;
      await nextSession.load(
        (request) => {
          if (currentVersion === version.current) setPasswordRequest(request);
        },
        (value) => {
          if (currentVersion === version.current) setProgress(value);
        },
      );
      if (currentVersion !== version.current) return;
      setPasswordRequest(null);
      setPageCount(nextSession.pageCount);
      if (nextSession.kind === 'image' && mode === 'text') setMode('automatic');
    } catch (cause) {
      if (currentVersion !== version.current || isDocumentImportCancelled(cause)) return;
      session.current?.dispose();
      session.current = undefined;
      setPasswordRequest(null);
      setError(errorText(cause));
    } finally {
      if (currentVersion === version.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  const extract = async (onlyMissing = false) => {
    const activeSession = session.current;
    if (!activeSession || busy) return;
    let selected: number[];
    try {
      selected = onlyMissing
        ? pages.filter((page) => !page.text.trim()).map((page) => page.page)
        : parseDocumentPages(selection === 'all' ? 'all' : range, pageCount);
    } catch {
      setError(t('请输入有效页码，例如 1-3, 5，且不超过总页数。'));
      return;
    }
    const currentVersion = ++version.current;
    setBusy(true);
    setError('');
    setNotice('');
    setPreview(null);
    try {
      const extracted = await activeSession.extract(
        selected,
        onlyMissing ? 'ocr' : mode,
        language,
        (value) => {
          if (currentVersion === version.current) setProgress(value);
        },
      );
      if (currentVersion !== version.current) return;
      setPages((previous) =>
        onlyMissing
          ? previous.map(
              (page) => extracted.find((replacement) => replacement.page === page.page) ?? page,
            )
          : extracted,
      );
      setBlankPages([]);
    } catch (cause) {
      if (currentVersion === version.current && !isDocumentImportCancelled(cause))
        setError(errorText(cause));
    } finally {
      if (currentVersion === version.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  const progressLabel = progress
    ? {
        loading: t('正在读取本地文件…'),
        rendering: t('正在渲染第 {page} 页…', { page: progress.page ?? 1 }),
        initializing: t('正在加载本地 OCR 引擎和语言数据…'),
        recognizing: t('正在识别第 {page} 页…', { page: progress.page ?? 1 }),
        text: t('正在提取第 {page} 页的文字…', { page: progress.page ?? 1 }),
      }[progress.phase]
    : '';
  const progressValue = progress?.total
    ? (progress.completed + (progress.fraction ?? 0)) / progress.total
    : progress?.fraction;

  return (
    <section className="document-import-panel" aria-label={t('导入 PDF 或图片')}>
      <h3>{t('导入 PDF 或图片')}</h3>
      <p>{t('文件在当前设备处理。先选择页码并提取文字，核对后预览，再创建新简历。')}</p>
      <Field
        label={t('选择 PDF 或图片文件')}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
        disabled={busy}
        hint={t('支持 PDF、PNG、JPEG、WebP，最大 64 MB。')}
        onChange={(event) => {
          const selectedFile = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (selectedFile) void loadFile(selectedFile);
        }}
      />
      {file && (
        <p className="document-import-file">
          {file.name}
          {pageCount > 0 && ` · ${t('共 {count} 页', { count: pageCount })}`}
        </p>
      )}
      {passwordRequest && (
        <form
          className="document-import-password"
          onSubmit={(event) => {
            event.preventDefault();
            if (!password) return;
            passwordRequest.submit(password);
            setPassword('');
            setPasswordRequest(null);
          }}
        >
          <p role="status">
            {passwordRequest.incorrect ? t('PDF 密码不正确，请重试。') : t('此 PDF 需要密码。')}
          </p>
          <Field
            label={t('PDF 密码')}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button type="submit" disabled={!password}>
            {t('解锁 PDF')}
          </Button>
        </form>
      )}
      {pageCount > 0 && (
        <>
          <fieldset className="document-import-options" disabled={busy}>
            <legend>{t('选择读取页码')}</legend>
            <label>
              <input
                type="radio"
                name="document-pages"
                checked={selection === 'all'}
                onChange={() => {
                  setSelection('all');
                  clearReview();
                }}
              />
              {t('全部页面')}
            </label>
            <label>
              <input
                type="radio"
                name="document-pages"
                checked={selection === 'range'}
                onChange={() => {
                  setSelection('range');
                  clearReview();
                }}
              />
              {t('指定页码')}
            </label>
            {selection === 'range' && (
              <Field
                label={t('页码范围')}
                placeholder="1-3, 5"
                value={range}
                onChange={(event) => {
                  setRange(event.target.value);
                  clearReview();
                }}
              />
            )}
          </fieldset>
          <div className="document-import-grid">
            <div className="field">
              <label htmlFor={modeId}>{t('读取方式')}</label>
              <select
                id={modeId}
                value={mode}
                disabled={busy}
                onChange={(event) => {
                  setMode(event.target.value as DocumentImportMode);
                  clearReview();
                }}
              >
                <option value="automatic">{t('自动选择')}</option>
                <option value="text" disabled={session.current?.kind === 'image'}>
                  {t('仅 PDF 文字层')}
                </option>
                <option value="ocr">{t('OCR 图片识别')}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={languageId}>{t('OCR 语言')}</label>
              <select
                id={languageId}
                value={language}
                disabled={busy}
                onChange={(event) => {
                  setLanguage(event.target.value as OcrLanguage);
                  setPreview(null);
                }}
              >
                <option value="eng+chi_sim">{t('简体中文与英文')}</option>
                <option value="eng">{t('英文')}</option>
                <option value="chi_sim">{t('简体中文')}</option>
              </select>
            </div>
          </div>
          <p className="field-hint">
            {t(
              '自动选择优先读取 PDF 文字层；图片使用 OCR。扫描 PDF 可在提取后明确选择 OCR，或直接选择 OCR 模式。',
            )}
          </p>
          <div className="document-import-actions">
            <Button disabled={busy} onClick={() => void extract()}>
              {t('提取所选页面')}
            </Button>
          </div>
        </>
      )}
      {busy && (
        <div className="document-import-progress" role="status" aria-live="polite">
          <p>{progressLabel}</p>
          <progress
            max={1}
            value={progressValue === undefined ? undefined : Math.min(1, progressValue)}
            aria-label={progressLabel}
          />
          {progress && progress.total > 0 && (
            <span>
              {t('已完成 {done} / {total} 页', { done: progress.completed, total: progress.total })}
            </span>
          )}
          <Button onClick={cancel}>{t('取消读取')}</Button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="transfer-error" role="alert">
          {error}
        </p>
      )}
      {pages.length > 0 && (
        <section className="document-import-review" aria-label={t('核对提取文字')}>
          <h4>{t('核对提取文字')}</h4>
          <p>
            {t('逐页检查阅读顺序、换行和 OCR 错字。这里的文字可直接修改，修改后需要重新预览。')}
          </p>
          {pages.some((page) => !page.text.trim()) && (
            <div className="document-import-missing" role="status">
              <p>
                {t(
                  '部分页面没有提取到文字。可使用 OCR、补充文字，或逐页确认该页无需文字；确认前不会导入。',
                )}
              </p>
              <Button disabled={busy} onClick={() => void extract(true)}>
                {t('对无文字页面使用 OCR')}
              </Button>
            </div>
          )}
          {pages.map((page) => (
            <div className="document-import-page" key={page.page}>
              <label className="field">
                <span>
                  {t('第 {page} 页', { page: page.page })} ·{' '}
                  {page.method === 'ocr' ? 'OCR' : t('PDF 文字层')}
                  {page.confidence !== undefined &&
                    ` · ${t('置信度 {value}%', { value: Math.round(page.confidence) })}`}
                </span>
                <textarea
                  rows={6}
                  value={page.text}
                  disabled={busy}
                  onChange={(event) => {
                    const text = event.target.value;
                    setPages((previous) =>
                      previous.map((item) => (item.page === page.page ? { ...item, text } : item)),
                    );
                    setBlankPages((previous) => previous.filter((number) => number !== page.page));
                    setPreview(null);
                  }}
                />
              </label>
              {page.confidence !== undefined && page.confidence < 70 && (
                <p className="field-hint">{t('此页 OCR 置信度较低，请仔细核对。')}</p>
              )}
              {!page.text.trim() && (
                <label className="check-field">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={blankPages.includes(page.page)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setBlankPages((previous) =>
                        checked
                          ? [...previous, page.page]
                          : previous.filter((number) => number !== page.page),
                      );
                      setPreview(null);
                    }}
                  />
                  {t('确认此页无需导入文字')}
                </label>
              )}
            </div>
          ))}
          <Field
            label={t('新简历标题')}
            value={title}
            disabled={busy}
            onChange={(event) => {
              setTitle(event.target.value);
              setPreview(null);
            }}
          />
          <Button
            disabled={busy || missingPages.length > 0 || !pages.some((page) => page.text.trim())}
            onClick={() => {
              try {
                setPreview(parseTextImport(pages.map((page) => page.text).join('\n\n'), title));
                setError('');
              } catch (cause) {
                setError(errorText(cause));
              }
            }}
          >
            {t('预览导入')}
          </Button>
        </section>
      )}
      {preview && (
        <section className="transfer-result" aria-label={t('导入预览')}>
          {preview.warnings.length > 0 && (
            <ul>
              {preview.warnings.map((warning) => (
                <li key={warning}>{errorText(warning)}</li>
              ))}
            </ul>
          )}
          <div className="transfer-preview">
            <h3>{preview.document.title}</h3>
            {preview.document.profile.name && <p>{preview.document.profile.name}</p>}
            {preview.document.sections.map((section) => (
              <div key={section.id}>
                <h4>{section.title}</h4>
                {section.items.map((item) => (
                  <div key={item.id}>
                    {item.title && <strong>{item.title}</strong>}
                    <p className="transfer-preview-text">{textContent(item.description)}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="document-import-actions">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                onImport(preview.document);
                session.current?.dispose();
                onClose();
              }}
            >
              {t('确认导入为新简历')}
            </Button>
            <Button
              onClick={() => {
                session.current?.dispose();
                onClose();
              }}
            >
              {t('取消')}
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}
