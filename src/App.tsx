import { useI18n, t, errorText } from './i18n';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  CircleHelp,
  Download,
  Eye,
  FileJson,
  FilePlus2,
  FileText,
  Menu,
  Palette,
  PencilLine,
  Plus,
  Printer,
  Redo2,
  RotateCw,
  ShieldCheck,
  Save,
  Undo2,
  Upload,
  Sparkles,
} from 'lucide-react';
import { useWorkspace } from './stores/useWorkspace.ts';
import { templates, type TemplateId } from './resume/model.ts';
import {
  downloadResume,
  MAX_IMPORT_FILE_BYTES,
  parseImportFile,
  serializeResume,
  type RecoveryResult,
} from './resume/files.ts';
import ResumeDocument from './resume/ResumeDocument';
import ResumePages from './resume/ResumePages';
import { usePagination } from './resume/usePagination';
import { ensureResumeFont } from './resume/fonts.ts';
import { Button, Dialog, Field, IconButton } from './components/ui';
import BrandMark from './components/BrandMark';
import ContentEditor from './components/ContentEditor';
import AppearancePanel from './components/AppearancePanel';
import PreviewPanel from './components/PreviewPanel';
import ReviewPanel from './components/ReviewPanel';
import Library from './components/Library';
import Templates from './components/Templates';
import Help from './components/Help';
import RecoveryDownload from './components/RecoveryDownload';
import WordExportButton from './components/WordExportButton';
import TransferDialog from './components/TransferDialog';
import { useLocalFiles } from './storage/useLocalFiles.ts';
import { useDirectoryBackup } from './storage/useDirectoryBackup.ts';
import Introduction from './components/Introduction';
import ThemeControl from './components/ThemeControl';
const VersionHistoryPanel = lazy(() => import('./components/VersionHistoryPanel'));
import StorageStatusPanel from './components/StorageStatusPanel';
import { useVersionCheckpoints } from './storage/useVersionCheckpoints';
import { focusEditorTarget, type EditorTarget } from './components/editorNavigation';
import {
  WorkspaceControls,
  WorkspaceDivider,
  useWorkspaceLayout,
} from './components/WorkspaceControls';
import { useInterfacePreferences } from './components/useInterfacePreferences';
import type { CSSProperties } from 'react';
import AISettingsDialog from './ai/AISettingsDialog';

type Page = 'home' | 'editor' | 'library' | 'templates' | 'help';
const pageNames: Record<Page, string> = {
  home: '认识幸运',
  editor: '简历编辑',
  library: '我的简历',
  templates: '模板中心',
  help: '保存与帮助',
};
const readPage = (): Page =>
  ['home', 'library', 'templates', 'help'].includes(location.hash.slice(1))
    ? (location.hash.slice(1) as Page)
    : 'editor';

export default function App() {
  const { locale, setLocale } = useI18n();
  const { preferences, setPreferences } = useInterfacePreferences();
  const { workspaceRef, ratio, setRatio, width } = useWorkspaceLayout(preferences, setPreferences);
  const {
    documents,
    activeId,
    ready,
    loadError,
    recoveryDrafts,
    statuses,
    histories,
    initialize,
    create,
    update,
    add,
    travel,
    flush,
    remove,
    recover,
  } = useWorkspace();
  const active = activeId ? documents[activeId] : null;
  const versionCheckpoint = useVersionCheckpoints(active);
  const { sourceRef, pages, paginationError, paginationReady, refreshPagination } =
    usePagination(active);
  const [page, setPageState] = useState<Page>(readPage);
  const [mode, setMode] = useState<'content' | 'appearance' | 'review'>('content');
  useLayoutEffect(() => {
    const panel = document.querySelector('.edit-panel-body');
    if (panel) panel.scrollTop = 0;
  }, [mode, activeId]);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<TemplateId>('linen');
  const [newName, setNewName] = useState('');
  const [newAccent, setNewAccent] = useState<string | undefined>();
  const [includeSample, setIncludeSample] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const saveOriginal = useCallback(() => {
    if (!active) return;
    try {
      downloadResume(active);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法保存原稿，请重试。');
    }
  }, [active]);
  const [importing, setImporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const locateEditor = (target?: EditorTarget) => {
    setMode('content');
    setMobilePreview(false);
    if (target) requestAnimationFrame(() => focusEditorTarget(target));
  };
  const [aiSettingsOpen, setAISettingsOpen] = useState(
    () => location.pathname === '/auth/orca/callback',
  );
  const [recoveryImport, setRecoveryImport] = useState<RecoveryResult | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const status = activeId ? statuses[activeId] : undefined;
  const history = activeId ? histories[activeId] : undefined;

  const navigate = useCallback((target: Page) => {
    location.hash = target;
    setPageState(target);
    setMenuOpen(false);
  }, []);
  const openCreate = useCallback((template: TemplateId = 'linen', accent?: string) => {
    setNewTemplate(template);
    setNewName('');
    setNewAccent(accent);
    setIncludeSample(false);
    setCreateOpen(true);
  }, []);
  const closeCreate = useCallback(() => setCreateOpen(false), []);
  const closeError = useCallback(() => setError(''), []);
  const closeTransfer = useCallback(() => setTransferOpen(false), []);
  const closeAISettings = useCallback(() => setAISettingsOpen(false), []);
  const closeRecovery = useCallback(() => setRecoveryImport(null), []);
  const closeDelete = useCallback(() => {
    if (!deleting) setDeleteId(null);
  }, [deleting]);
  const closeSectionDelete = useCallback(() => setDeleteSectionId(null), []);
  const localFiles = useLocalFiles(active, (document) => {
    add(document);
    navigate('editor');
    setMode('content');
  });
  const directoryBackup = useDirectoryBackup(
    documents,
    ready,
    (document) => {
      add(document);
      navigate('editor');
      setMode('content');
    },
    (document, expected) => {
      const state = useWorkspace.getState();
      const local = state.documents[document.id];
      if (expected === null) {
        if (local) return false;
        const selected = state.activeId;
        state.add(document);
        if (selected) state.select(selected);
        return true;
      }
      if (
        !local ||
        serializeResume(local) !== expected ||
        state.statuses[document.id] === 'conflict'
      )
        return false;
      state.update((draft) => Object.assign(draft, document), undefined, document.id);
      return true;
    },
  );

  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const onHash = () => setPageState(readPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    setMobilePreview(false);
  }, [activeId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !active || document.querySelector('dialog[open]'))
        return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (localFiles.state.name) void localFiles.save();
        else saveOriginal();
      }
      if (page === 'editor' && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        travel(event.shiftKey ? 'redo' : 'undo');
      }
      if (page === 'editor' && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        travel('redo');
      }
    };
    const flushAll = () => {
      const state = useWorkspace.getState();
      for (const id of Object.keys(state.documents)) void state.flush(id);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };
    const onUnload = (event: BeforeUnloadEvent) => {
      if (Object.values(useWorkspace.getState().statuses).some((state) => state !== 'saved')) {
        flushAll();
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [active, page, travel, localFiles.state.name, localFiles.save, saveOriginal]);

  async function importFile(file: File) {
    setImporting(true);
    try {
      if (file.size > MAX_IMPORT_FILE_BYTES)
        throw new Error('文件超过 64 MB，请选择较小的 JSON 备份或分卷恢复文件。');
      const result = parseImportFile(await file.text());
      if (result.recovery) {
        setRecoveryImport(result);
        return;
      }
      add(result.documents[0]);
      navigate('editor');
      setMode('content');
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法读取此文件，请重试。');
    } finally {
      setImporting(false);
    }
  }

  async function printResume() {
    if (!active || printing || !paginationReady) return;
    setPrinting(true);
    const originalTitle = document.title;
    try {
      await document.fonts.ready;
      await ensureResumeFont(active.appearance.font);
      await Promise.all(
        Array.from(document.querySelectorAll<HTMLImageElement>('.pagination-source img')).map(
          (img) => img.decode().catch(() => undefined),
        ),
      );
      const current = useWorkspace.getState();
      if (current.activeId !== active.id || current.documents[active.id] !== active) {
        setError('简历内容已更新，请重新导出 PDF。');
        return;
      }
      if (!flushSync(refreshPagination)) {
        setError('当前排版无法完成分页，请回到编辑区调整排版。');
        return;
      }
      document.title = active.title || '幸运简历';
      window.print();
    } catch {
      setError('未能打开打印窗口，请重试或使用浏览器的打印菜单。');
    } finally {
      document.title = originalTitle;
      setPrinting(false);
    }
  }

  return (
    <>
      <div className="app-shell">
        <div className="main-shell">
          <header className="topbar">
            <a
              className="brand"
              href="#editor"
              aria-label={t('幸运简历首页')}
              onClick={() => navigate('editor')}
            >
              <BrandMark />
              <span>
                <strong>{t('幸运简历')}</strong>
                <small>Luck Resume</small>
              </span>
            </a>
            <nav className={`main-nav ${menuOpen ? 'nav-open' : ''}`} aria-label={t('主导航')}>
              {(Object.keys(pageNames) as Page[]).map((id) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className={page === id ? 'active' : ''}
                  aria-current={page === id ? 'page' : undefined}
                  onClick={() => navigate(id)}
                >
                  {t(pageNames[id])}
                </a>
              ))}
              <button
                className="mobile-ai-settings"
                type="button"
                onClick={() => {
                  setAISettingsOpen(true);
                  setMenuOpen(false);
                }}
              >
                {t('AI 设置')}
              </button>
            </nav>
            <div className="topbar-actions">
              <IconButton label={t('AI 设置')} onClick={() => setAISettingsOpen(true)}>
                <Sparkles size={18} />
              </IconButton>
              <select
                className="locale-control"
                aria-label={t('界面语言')}
                value={locale}
                onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'zh')}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
              <ThemeControl
                value={preferences.theme}
                onChange={(theme) => setPreferences((current) => ({ ...current, theme }))}
              />
              <span className="local-badge">
                <ShieldCheck size={15} />
                {t('草稿留在本地')}
              </span>
              <IconButton label={t('使用帮助')} onClick={() => navigate('help')}>
                <CircleHelp size={19} />
              </IconButton>
              <button
                type="button"
                className="mobile-menu icon-button"
                aria-label={t('打开导航')}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <Menu size={21} />
              </button>
            </div>
          </header>
          <main className="main-content">
            {!ready ? (
              <div className="loading-state">
                <BrandMark size={48} />
                <p>{t('正在打开你的工作台…')}</p>
              </div>
            ) : (
              <>
                {loadError && (
                  <div className="storage-banner" role="alert">
                    <span>{loadError}</span>
                    <Button onClick={() => void initialize()}>
                      <RotateCw size={14} />
                      {t('重新读取')}
                    </Button>
                  </div>
                )}
                {recoveryDrafts.length > 0 && (
                  <div className="storage-banner recovery-banner" role="alert">
                    <span>
                      {t('有')}
                      {recoveryDrafts.length}{' '}
                      {t(
                        '份草稿需要恢复，其他简历已正常打开。原始数据仍保留在此设备，可先下载恢复文件。',
                      )}
                    </span>
                    <RecoveryDownload drafts={recoveryDrafts} onError={setError}>
                      <Download size={14} />
                      {t('下载恢复文件')}
                    </RecoveryDownload>
                  </div>
                )}
                {page === 'home' && (
                  <Introduction
                    onCreate={openCreate}
                    onEditor={() => navigate('editor')}
                    onTemplates={() => navigate('templates')}
                  />
                )}
                {page === 'editor' && (
                  <>
                    <div className="workspace-heading">
                      <div>
                        <h1>
                          {t('下一站，')}
                          <span>{t('好运。')}</span>
                        </h1>
                        <p>{t('把经历写成自己的样子，把可能留给下一次出发。')}</p>
                      </div>
                      <div className="workspace-intro-note">
                        <span className="intro-paper" aria-hidden="true" />
                        <p>
                          {t('一张好纸，')}
                          <br />
                          {t('装得下你的闪光点。')}
                        </p>
                      </div>
                    </div>
                    {active ? (
                      <>
                        <div className="document-toolbar">
                          <div className="document-title">
                            <FileText size={18} />
                            <input
                              aria-label={t('简历名称')}
                              maxLength={200}
                              value={active.title}
                              placeholder={t('未命名简历')}
                              onChange={(e) =>
                                update((doc) => {
                                  doc.title = e.target.value;
                                }, 'document-title')
                              }
                            />
                            <span className="save-status" role="status">
                              {status === 'saved' ? (
                                <>
                                  <Check size={13} />
                                  {t('草稿已保存到此设备')}
                                </>
                              ) : status === 'error' ? (
                                t('本地保存失败')
                              ) : status === 'conflict' ? (
                                t('检测到版本冲突')
                              ) : (
                                t('正在保存…')
                              )}
                            </span>
                          </div>
                          <div className="document-actions">
                            <div className="history-actions">
                              <IconButton
                                label={t('撤销')}
                                disabled={!history?.past.length}
                                onClick={() => travel('undo')}
                              >
                                <Undo2 size={17} />
                              </IconButton>
                              <IconButton
                                label={t('重做')}
                                disabled={!history?.future.length}
                                onClick={() => travel('redo')}
                              >
                                <Redo2 size={17} />
                              </IconButton>
                            </div>
                            <Button onClick={() => openCreate()} aria-label={t('新建简历')}>
                              <Plus size={16} />
                              <span className="action-label">{t('新建')}</span>
                            </Button>
                            <Button
                              onClick={() => importInput.current?.click()}
                              disabled={importing}
                              aria-label={t('导入 JSON')}
                            >
                              <Upload size={16} />
                              <span className="action-label">{t('导入')}</span>
                            </Button>
                            <Button onClick={saveOriginal} aria-label={t('保存 JSON')}>
                              <Download size={16} />
                              <span className="action-label">{t('存原稿')}</span>
                            </Button>
                            {localFiles.state.name && (
                              <Button
                                onClick={() => void localFiles.save()}
                                disabled={localFiles.state.busy}
                                aria-label={t('保存到关联文件')}
                                title={`${localFiles.state.name} · ${localFiles.state.dirty ? t('有未保存修改') : t('已保存')}`}
                              >
                                <Save size={16} />
                                <span className="action-label">
                                  {localFiles.state.dirty ? t('保存到文件') : t('文件已保存')}
                                </span>
                              </Button>
                            )}
                            <Button
                              onClick={() => setTransferOpen(true)}
                              aria-label={t('更多导入导出')}
                            >
                              <FileJson size={16} />
                              <span className="action-label">{t('更多格式')}</span>
                            </Button>
                            <Button onClick={() => setVersionsOpen(true)}>{t('版本历史')}</Button>
                            <WordExportButton document={active} onError={setError} />
                            <Button
                              variant="primary"
                              onClick={() => void printResume()}
                              disabled={printing || !paginationReady}
                              aria-label={t('导出 PDF')}
                            >
                              <Printer size={16} />
                              <span className="action-label">{t('导出 PDF')}</span>
                            </Button>
                          </div>
                        </div>
                        {localFiles.state.error && (
                          <div className="storage-banner" role="alert">
                            <span>{errorText(localFiles.state.error)}</span>
                            <Button onClick={() => setTransferOpen(true)}>
                              {t('查看本地文件')}
                            </Button>
                          </div>
                        )}
                        {versionCheckpoint.error != null && (
                          <div className="storage-banner" role="alert">
                            {t('自动版本暂未保存，当前草稿仍可编辑。')}{' '}
                            {errorText(versionCheckpoint.error)}
                          </div>
                        )}
                        {(status === 'error' || status === 'conflict') && (
                          <div className="storage-banner" role="alert">
                            <span>
                              {status === 'conflict'
                                ? t('此简历在另一个标签页有更新。当前修改仍在这里，请另存为副本。')
                                : t('草稿未能写入浏览器。当前内容仍可编辑，请下载 JSON 保留修改。')}
                            </span>
                            {status === 'conflict' ? (
                              <Button onClick={() => void recover(active.id)}>
                                {t('另存为副本')}
                              </Button>
                            ) : (
                              <Button onClick={() => void flush()}>
                                <RotateCw size={14} />
                                {t('重试保存')}
                              </Button>
                            )}
                          </div>
                        )}
                        <div className="mobile-view-switch segmented">
                          <button
                            type="button"
                            className={!mobilePreview ? 'active' : ''}
                            onClick={() => setMobilePreview(false)}
                          >
                            <PencilLine size={15} />
                            {t('编辑内容')}
                          </button>
                          <button
                            type="button"
                            className={mobilePreview ? 'active' : ''}
                            onClick={() => setMobilePreview(true)}
                          >
                            <Eye size={15} />
                            {t('预览简历')}
                          </button>
                        </div>
                        <WorkspaceControls preferences={preferences} onChange={setPreferences} />
                        <div
                          ref={workspaceRef}
                          className={`editor-workspace resizable-workspace ${mobilePreview ? 'mobile-show-preview' : ''} ${preferences.editorHidden ? 'workspace-editor-hidden' : ''} ${preferences.previewHidden ? 'workspace-preview-hidden' : ''}`}
                          style={
                            {
                              '--editor-column': `${ratio}fr`,
                              '--preview-column': `${1 - ratio}fr`,
                            } as CSSProperties
                          }
                        >
                          <section
                            id="resume-editor-panel"
                            className="edit-panel"
                            aria-label={t('简历编辑')}
                          >
                            <div className="edit-tabs">
                              <button
                                type="button"
                                className={mode === 'content' ? 'active' : ''}
                                aria-pressed={mode === 'content'}
                                onClick={() => setMode('content')}
                              >
                                <PencilLine size={16} />
                                {t('写内容')}
                              </button>
                              <button
                                type="button"
                                className={mode === 'appearance' ? 'active' : ''}
                                aria-pressed={mode === 'appearance'}
                                onClick={() => setMode('appearance')}
                              >
                                <Palette size={16} />
                                {t('调风格')}
                              </button>
                              <button
                                type="button"
                                className={mode === 'review' ? 'active' : ''}
                                aria-pressed={mode === 'review'}
                                onClick={() => setMode('review')}
                              >
                                <CheckCheck size={16} />
                                {t('检查一下')}
                              </button>
                            </div>
                            <div className="edit-panel-body">
                              {mode === 'appearance' ? (
                                <AppearancePanel appearance={active.appearance} />
                              ) : mode === 'review' ? (
                                <ReviewPanel
                                  document={active}
                                  pages={pages}
                                  onAppearance={() => setMode('appearance')}
                                  onEdit={locateEditor}
                                />
                              ) : (
                                <ContentEditor
                                  key={active.id}
                                  document={active}
                                  onDeleteSection={setDeleteSectionId}
                                />
                              )}
                            </div>
                            <div className="edit-panel-footer">
                              <ShieldCheck size={13} />
                              {t('填写和排版，都在本地完成')}
                            </div>
                          </section>
                          <WorkspaceDivider ratio={ratio} width={width} onChange={setRatio} />
                          <PreviewPanel
                            key={active.id}
                            pages={pages}
                            error={paginationError}
                            documentId={active.id}
                            onLocate={locateEditor}
                          />
                        </div>
                        <footer className="workspace-footer">
                          <span>
                            <FileJson size={14} />
                            {t('存原稿会下载 JSON，换设备后导入即可继续。')}
                          </span>
                          <button type="button" onClick={() => navigate('help')}>
                            {t('关于保存')}
                            <ArrowUpRight size={13} />
                          </button>
                        </footer>
                      </>
                    ) : (
                      <div className="empty-state">
                        <FilePlus2 size={40} />
                        <h2>{t('写下你的第一份简历')}</h2>
                        <p>{t('从空白开始，或导入保存好的 JSON 原稿。')}</p>
                        <div className="empty-actions">
                          <Button variant="primary" onClick={() => openCreate()}>
                            {t('新建简历')}
                          </Button>
                          <Button onClick={() => importInput.current?.click()}>
                            {t('导入 JSON')}
                          </Button>
                          <Button onClick={() => setTransferOpen(true)}>
                            {t('导入 Markdown / 文本')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {page === 'library' && (
                  <>
                    <div className="page-utility">
                      <Button onClick={() => importInput.current?.click()} disabled={importing}>
                        <Upload size={16} />
                        {t('导入 JSON')}
                      </Button>
                      <Button onClick={() => setTransferOpen(true)}>
                        {t('导入 Markdown / 文本')}
                      </Button>
                    </div>
                    <Library
                      onOpen={() => {
                        navigate('editor');
                        setMode('content');
                      }}
                      onCreate={() => openCreate()}
                      confirmDelete={setDeleteId}
                    />
                  </>
                )}
                {page === 'templates' && (
                  <Templates
                    selected={active?.appearance.template}
                    onChoose={(template, accent) => {
                      if (!active) create(template);
                      update((doc) => {
                        doc.appearance.template = template;
                        if (accent) doc.appearance.accent = accent;
                      });
                      navigate('editor');
                      setMode('appearance');
                    }}
                    onCreate={openCreate}
                  />
                )}
                {page === 'help' && <Help />}
              </>
            )}
          </main>
          <footer className="project-footer">
            <a
              className="text-button"
              href="https://github.com/Zayne-Feng/luck-resume/blob/main/README.md"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('项目文档（新标签页）')}
            >
              <BookOpen size={15} aria-hidden="true" />
              {t('项目文档')}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </footer>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importFile(file);
            }}
          />
          {createOpen && (
            <Dialog title={t('为下一站，新建一份简历')} onClose={closeCreate}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  create(newTemplate, includeSample);
                  if (newName.trim() || newAccent)
                    update((doc) => {
                      if (newName.trim()) doc.title = newName.trim();
                      if (newAccent) doc.appearance.accent = newAccent;
                    });
                  setCreateOpen(false);
                  navigate('editor');
                  setMode('content');
                }}
              >
                <Field
                  label={t('简历名称')}
                  value={newName}
                  maxLength={200}
                  placeholder={t('例如：产品设计师求职简历')}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <fieldset className="create-template-field">
                  <legend>{t('选择一张好纸')}</legend>
                  <div className="create-template-options">
                    {templates.map((template) => (
                      <label key={template.id}>
                        <input
                          type="radio"
                          name="new-template"
                          checked={newTemplate === template.id}
                          onChange={() => setNewTemplate(template.id)}
                        />
                        <span>{t(template.name)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={includeSample}
                    onChange={(e) => setIncludeSample(e.target.checked)}
                  />
                  {t('使用示例内容，边看边修改')}
                </label>
                <p className="dialog-note">
                  {t('示例为虚构内容，用于展示排版。新简历保存在此浏览器。')}
                </p>
                <div className="dialog-actions">
                  <Button onClick={closeCreate}>{t('取消')}</Button>
                  <Button variant="primary" type="submit">
                    <Plus size={16} />
                    {t('创建简历')}
                  </Button>
                </div>
              </form>
            </Dialog>
          )}
          {deleteId && (
            <Dialog title={t('删除这份本地草稿？')} onClose={closeDelete}>
              <p className="dialog-copy">
                「{documents[deleteId]?.title}
                {t('」将从此浏览器删除。你已下载的 JSON 和 PDF 文件不受影响。')}
              </p>
              <p className="dialog-note">{t('如需保留可编辑版本，请先下载 JSON 备份。')}</p>
              <div className="dialog-actions">
                <Button onClick={closeDelete} disabled={deleting}>
                  {t('保留草稿')}
                </Button>
                <Button
                  variant="danger"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await remove(deleteId);
                      setDeleteId(null);
                    } catch {
                      setError('无法删除本地草稿，可能在另一个标签页有更新。请重新打开后再试。');
                    } finally {
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? t('正在删除…') : t('删除草稿')}
                </Button>
              </div>
            </Dialog>
          )}
          {deleteSectionId && (
            <Dialog title={t('删除这个简历模块？')} onClose={closeSectionDelete}>
              <p className="dialog-copy">
                {t('模块及其中内容将从这份简历中移除，可以通过撤销恢复。')}
              </p>
              <div className="dialog-actions">
                <Button onClick={closeSectionDelete}>{t('保留模块')}</Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    update((doc) => {
                      doc.sections = doc.sections.filter((s) => s.id !== deleteSectionId);
                    });
                    setDeleteSectionId(null);
                  }}
                >
                  {t('删除模块')}
                </Button>
              </div>
            </Dialog>
          )}
          {transferOpen && (
            <TransferDialog
              directoryBackup={directoryBackup}
              localFiles={localFiles}
              document={active}
              documents={Object.values(documents)}
              onWorkspaceImported={(imported) => useWorkspace.getState().adoptImported(imported)}
              onClose={closeTransfer}
              onImport={(doc) => {
                add(doc);
                setTransferOpen(false);
                navigate('editor');
                setMode('content');
              }}
              onExportHtml={
                active
                  ? async () => {
                      const { downloadPrintHtml } = await import('./resume/htmlExport');
                      await downloadPrintHtml(active);
                    }
                  : undefined
              }
            />
          )}
          {aiSettingsOpen && <AISettingsDialog onClose={closeAISettings} />}
          {versionsOpen && active && (
            <Dialog title={t('版本历史')} onClose={() => setVersionsOpen(false)} wide>
              <Suspense fallback={<p>{t('正在读取本地版本…')}</p>}>
                <VersionHistoryPanel
                  key={active.id}
                  document={active}
                  onRestore={(snapshot, expected) => {
                    const state = useWorkspace.getState();
                    if (
                      state.activeId !== expected.id ||
                      state.documents[expected.id] !== expected ||
                      state.statuses[expected.id] === 'conflict'
                    )
                      return false;
                    state.update((draft) => Object.assign(draft, snapshot), undefined, expected.id);
                    return true;
                  }}
                />
              </Suspense>
              <StorageStatusPanel />
            </Dialog>
          )}
          {recoveryImport && (
            <Dialog title={t('恢复本地草稿')} onClose={closeRecovery}>
              <p className="dialog-copy">
                {t('找到 {count} 份可恢复简历，{failed} 份记录仍需修复。恢复后会创建独立副本。', {
                  count: recoveryImport.documents.length,
                  failed: recoveryImport.failures.length,
                })}
              </p>
              {recoveryImport.documents.length > 0 && (
                <ul className="recovery-list" aria-label={t('可恢复简历')}>
                  {recoveryImport.documents.map((doc) => (
                    <li key={doc.id}>{doc.title || t('未命名简历')}</li>
                  ))}
                </ul>
              )}
              {recoveryImport.failures.length > 0 && (
                <details className="recovery-details">
                  <summary>{t('查看未恢复记录')}</summary>
                  <ul className="recovery-list">
                    {recoveryImport.failures.map((failure) => (
                      <li key={failure.index}>
                        {t('第 {count} 份：{reason}', {
                          count: failure.index + 1,
                          reason: errorText(failure.reason),
                        })}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="dialog-actions">
                <Button onClick={closeRecovery}>{t('关闭')}</Button>
                {recoveryImport.failures.length > 0 && (
                  <RecoveryDownload
                    drafts={recoveryImport.failures.map((f) => f.record)}
                    onError={setError}
                  >
                    {t('下载未恢复记录')}
                  </RecoveryDownload>
                )}
                {recoveryImport.documents.length > 0 && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      recoveryImport.documents.forEach(add);
                      setRecoveryImport(null);
                      navigate('editor');
                      setMode('content');
                    }}
                  >
                    {t('导入可恢复简历')}
                  </Button>
                )}
              </div>
            </Dialog>
          )}
          {error && (
            <Dialog title={t('需要再检查一下')} onClose={closeError}>
              <p className="dialog-copy" role="alert">
                {errorText(error)}
              </p>
              <div className="dialog-actions">
                <Button variant="primary" onClick={closeError}>
                  {t('知道了')}
                </Button>
              </div>
            </Dialog>
          )}
        </div>
      </div>
      {active && (
        <>
          <div className="pagination-source" ref={sourceRef} aria-hidden="true">
            <ResumeDocument document={active} />
          </div>
          <div className="print-root">
            <style>{'@page { size: A4; margin: 0; }'}</style>
            <ResumePages pages={pages} />
          </div>
        </>
      )}
    </>
  );
}
