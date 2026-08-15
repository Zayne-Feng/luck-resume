import { useState } from 'react';
import { useI18n } from '../i18n';
import type { ResumeDocument } from '../resume/model.ts';
import { MAX_IMPORT_FILE_BYTES } from '../resume/files.ts';
import { listAppearancePresets } from '../storage/appearancePresets.ts';
import { listVersions } from '../storage/versionHistory.ts';
import { loadDocuments } from '../storage/database.ts';
import { useWorkspace } from '../stores/useWorkspace.ts';
import {
  createWorkspaceBackup,
  importWorkspaceBackup,
  MAX_WORKSPACE_BYTES,
  parseWorkspaceBackup,
  mergeWorkspaceBackupDocuments,
  type WorkspaceBackupData,
} from '../storage/workspaceBackup.ts';
import { Button, Field } from './ui';

function download(part: { name: string; blob: Blob }) {
  const url = URL.createObjectURL(part.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = part.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function WorkspaceBackupPanel({
  documents,
  onImported,
}: {
  documents: ResumeDocument[];
  onImported: (documents: ResumeDocument[]) => void;
}) {
  const { t, errorText } = useI18n();
  const [parts, setParts] = useState<ReturnType<typeof createWorkspaceBackup>>([]);
  const [preview, setPreview] = useState<WorkspaceBackupData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const work = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setDone(false);
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : '工作区备份操作失败。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="transfer-export workspace-backup-panel" aria-label={t('工作区备份')}>
      <h3>{t('工作区备份')}</h3>
      <p>
        {t(
          '备份全部简历、外观样式和本地版本。导入前可预览，并创建独立副本。请保留并一次选择全部分片。',
        )}
      </p>
      <div className="transfer-actions">
        <Button
          disabled={busy}
          onClick={() =>
            void work(async () => {
              setParts([]);
              const state = useWorkspace.getState();
              const [presets, versions, stored] = await Promise.all([
                listAppearancePresets(),
                listVersions(),
                loadDocuments(),
              ]);
              if (stored.recovery.length)
                throw new Error(
                  '存在无法读取的草稿，请先在恢复提示中下载恢复记录，再准备工作区备份。',
                );
              const merged = mergeWorkspaceBackupDocuments(
                stored.documents,
                Object.values(state.documents).length ? Object.values(state.documents) : documents,
                state.revisions,
                state.statuses,
                t('未保存修改副本'),
              );
              const files = createWorkspaceBackup({ documents: merged, presets, versions });
              setParts(files);
              if (files.length === 1) download(files[0]);
            })
          }
        >
          {t('准备工作区备份')}
        </Button>
      </div>
      {parts.length > 0 && (
        <div className="transfer-actions">
          {parts.map((part, index) => (
            <Button key={part.name} disabled={busy} onClick={() => download(part)}>
              {t('下载备份分片')} {index + 1}/{parts.length}
            </Button>
          ))}
        </div>
      )}
      <Field
        label={t('选择工作区备份全部分片')}
        aria-label={t('选择工作区备份全部分片')}
        type="file"
        multiple
        accept=".json,application/json"
        disabled={busy}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          setPreview(null);
          if (!files.length) return;
          void work(async () => {
            if (
              files.length > 10000 ||
              files.some(
                (file) => !/\.json$/i.test(file.name) || file.size > MAX_IMPORT_FILE_BYTES,
              ) ||
              files.reduce((sum, file) => sum + file.size, 0) > MAX_WORKSPACE_BYTES
            )
              throw new Error('工作区备份超过大小限制。');
            setPreview(parseWorkspaceBackup(await Promise.all(files.map((file) => file.text()))));
          });
        }}
      />
      {preview && (
        <div className="transfer-result">
          <p>
            {t('工作区备份预览')}：{preview.documents.length} {t('份简历')} ·{' '}
            {preview.presets.length} {t('个样式')} · {preview.versions.length} {t('个版本')}
          </p>
          <ul>
            {preview.documents.map((row) => (
              <li key={row.id}>{row.title}</li>
            ))}
            {preview.presets.map((row) => (
              <li key={row.id}>{row.name}</li>
            ))}
            {[
              ...new Map(
                preview.versions
                  .filter((row) => !preview.documents.some((doc) => doc.id === row.documentId))
                  .map((row) => [row.documentId, row.document.title]),
              ).entries(),
            ].map(([id, title]) => (
              <li key={`recovered-${id}`}>
                {t('从历史恢复简历')}：{title}
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              void work(async () => {
                const imported = await importWorkspaceBackup(preview);
                onImported(imported);
                setPreview(null);
                setDone(true);
              })
            }
          >
            {t('确认导入工作区副本')}
          </Button>
        </div>
      )}
      {busy && <p role="status">{t('正在处理…')}</p>}
      {done && <p role="status">{t('工作区副本已导入')}</p>}
      {error && (
        <p className="transfer-error" role="alert">
          {errorText(error)}
        </p>
      )}
    </section>
  );
}
