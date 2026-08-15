import { useEffect, useRef, useState } from 'react';
import { useI18n, t, errorText } from '../i18n';
import type { ResumeDocument } from '../resume/model.ts';
import { compareVersions, snapshotText } from '../resume/versionDiff.ts';
import { downloadRecoveryFile } from '../resume/files.ts';
import { Thumbnail } from './PreviewPanel';
import {
  deleteVersion,
  importVersionSnapshots,
  listVersions,
  parseVersionHistory,
  restoreVersionDocument,
  saveVersion,
  serializeVersionHistory,
  VERSION_EVENT,
  type ResumeVersion,
} from '../storage/versionHistory.ts';

export default function VersionHistoryPanel({
  document,
  onRestore,
}: {
  document: ResumeDocument;
  onRestore: (snapshot: ResumeDocument, expected: ResumeDocument) => boolean;
}) {
  useI18n();
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ResumeVersion[] | null>(null);
  const [deleteId, setDeleteId] = useState('');
  const current = useRef(document);
  current.current = document;
  useEffect(() => {
    let active = true;
    setVersions([]);
    setSelectedId('');
    setPending(null);
    setDeleteId('');
    setError(null);
    const refresh = () => {
      void listVersions(document.id)
        .then((rows) => {
          if (active) setVersions(rows);
        })
        .catch((reason) => {
          if (active) setError(reason);
        });
    };
    refresh();
    window.addEventListener(VERSION_EVENT, refresh);
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('luck-version-history');
    if (channel) channel.onmessage = refresh;
    return () => {
      active = false;
      window.removeEventListener(VERSION_EVENT, refresh);
      channel?.close();
    };
  }, [document.id]);
  const selected = versions.find((row) => row.id === selectedId);
  const differences = selected ? compareVersions(document, selected.document) : [];
  const changedContent =
    selected &&
    JSON.stringify([
      selected.document.title,
      selected.document.profile,
      selected.document.sections,
    ]) !== JSON.stringify([document.title, document.profile, document.sections]);
  const changedStyle =
    selected &&
    JSON.stringify(selected.document.appearance) !== JSON.stringify(document.appearance);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  const kindLabel = (kind: ResumeVersion['kind']) =>
    t({ automatic: '自动', named: '命名', safety: '恢复前副本', imported: '已导入' }[kind]);
  return (
    <section className="version-history-panel editor-form" aria-label={t('本地版本')}>
      <h3>{t('本地版本')}</h3>
      <p>
        {t(
          '停止编辑后自动保存，最多保留 30 个自动版本和 48 MB。命名版本和恢复前副本由你手动删除。',
        )}
      </p>
      <label>
        {t('版本名称')}
        <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </label>
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={() =>
          void run(async () => {
            await saveVersion(document, 'named', name);
            setName('');
          })
        }
      >
        {t('保存命名版本')}
      </button>
      <button
        type="button"
        disabled={busy || !versions.length}
        onClick={() =>
          void run(async () => {
            downloadRecoveryFile({
              name: 'luck-version-history.json',
              blob: new Blob([serializeVersionHistory(versions)], { type: 'application/json' }),
              canImport: true,
            });
          })
        }
      >
        {t('导出版本历史')}
      </button>
      <label>
        {t('导入版本历史')}
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const expected = document;
            void run(async () => {
              if (file.size > 64 * 1024 * 1024) throw new Error(t('版本文件过大。'));
              const rows = parseVersionHistory(await file.text());
              if (current.current.id !== expected.id)
                throw new Error(t('当前简历已切换，请重新操作。'));
              setPending(rows);
            });
          }}
        />
      </label>
      {pending && (
        <div className="version-import-review">
          <p>
            {t('将 {count} 个版本导入为当前简历的独立快照，不会替换正文。', {
              count: pending.length,
            })}
          </p>
          <ul>
            {pending.slice(0, 10).map((row, index) => (
              <li key={index}>
                {row.name || row.document.title} · {new Date(row.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await importVersionSnapshots(pending, document);
                setPending(null);
              })
            }
          >
            {t('确认导入到当前简历')}
          </button>
          <button type="button" onClick={() => setPending(null)}>
            {t('取消')}
          </button>
        </div>
      )}
      {error != null && <p role="alert">{errorText(error)}</p>}
      <label>
        {t('选择版本')}
        <select
          aria-label={t('选择版本')}
          value={selectedId}
          onChange={(event) => {
            setSelectedId(event.target.value);
            setDeleteId('');
          }}
        >
          <option value="">{t('选择版本')}</option>
          {versions.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name || kindLabel(row.kind)} · {new Date(row.createdAt).toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      {!versions.length && <p>{t('尚无本地版本。')}</p>}
      {selected && (
        <div className="version-history-preview">
          <p>
            {kindLabel(selected.kind)} · {new Date(selected.createdAt).toLocaleString()}
          </p>
          <p>
            {changedContent ? t('正文有变化') : t('正文相同')} ·{' '}
            {changedStyle ? t('外观有变化') : t('外观相同')}
          </p>
          <details open>
            <summary>{t('版本差异（当前 → 所选版本）')}</summary>
            {differences.length ? (
              <ul>
                {differences.map((row, index) => (
                  <li key={index}>
                    <strong>
                      {row.context && `${t(row.context)} · `}
                      {t(row.label)}
                    </strong>
                    <p>
                      {row.before || t('空')} → {row.after || t('空')}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('内容与外观相同')}</p>
            )}
            <p>{t('最多显示 120 项差异，每项显示前 240 个字符。')}</p>
          </details>
          <details>
            <summary>{t('预览版本')}</summary>
            <Thumbnail document={selected.document} />
            {snapshotText(selected.document, t).map((block, index) => (
              <article key={index}>
                <h4>
                  {block.title} {block.hidden && `(${t('已隐藏')})`}
                </h4>
                {block.lines.map((line, lineIndex) => (
                  <p key={lineIndex} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {line}
                  </p>
                ))}
              </article>
            ))}
          </details>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const expected = document;
                await saveVersion(expected, 'safety', t('恢复前副本'));
                if (!onRestore(restoreVersionDocument(selected.document, expected), expected))
                  throw new Error(t('当前简历已变化，请重新选择版本。'));
              })
            }
          >
            {t('保存当前副本并恢复此版本')}
          </button>
          {deleteId === selected.id ? (
            <>
              <span>{t('确认删除这个版本？')}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await deleteVersion(selected.id);
                    setSelectedId('');
                    setDeleteId('');
                  })
                }
              >
                {t('确认删除版本')}
              </button>
              <button type="button" onClick={() => setDeleteId('')}>
                {t('取消')}
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => setDeleteId(selected.id)}>
              {t('删除版本')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
