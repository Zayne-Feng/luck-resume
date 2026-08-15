import { useState } from 'react';
import { useI18n } from '../i18n';
import { serializeResume } from '../resume/files.ts';
import type { DirectoryBackupController } from '../storage/useDirectoryBackup.ts';
import { Button } from './ui';

export default function DirectoryBackupPanel({
  controller,
}: {
  controller: DirectoryBackupController;
}) {
  const { t, errorText } = useI18n();
  const { state, documents, ready } = controller;
  const [selected, setSelected] = useState('');
  const [restored, setRestored] = useState('');
  const preview = state.preview.find((entry) => entry.file === selected);
  const local = preview ? documents[preview.document.id] : undefined;
  return (
    <section className="transfer-export directory-backup-panel" aria-label={t('目录自动备份')}>
      <h3>{t('目录自动备份')}</h3>
      <p>
        {t(
          '选择本机目录后，全部简历的修改会自动保存为 JSON。重命名使用同一文件，删除简历会保留已有备份。',
        )}
      </p>
      {!state.supported && <p>{t('当前浏览器不支持目录访问。可使用 JSON 下载保存原稿。')}</p>}
      <p role="status" aria-live="polite">
        {state.name ? (
          <>
            {t('备份目录：')}
            <strong>{state.name}</strong> ·{' '}
            {t(
              state.busy
                ? '正在处理…'
                : state.permission !== 'granted'
                  ? '等待重新授权'
                  : state.lastSaved
                    ? '已完成自动备份'
                    : '目录已连接',
            )}
          </>
        ) : (
          t('尚未选择备份目录')
        )}
      </p>
      <div className="transfer-actions">
        {state.supported && (
          <Button disabled={!ready || state.busy} onClick={() => void controller.choose()}>
            {t(state.name ? '更换备份目录' : '选择备份目录')}
          </Button>
        )}
        {state.name && (
          <>
            <Button disabled={!ready || state.busy} onClick={() => void controller.reconnect()}>
              {t('重新连接')}
            </Button>
            <Button
              disabled={!ready || state.busy || state.permission !== 'granted'}
              onClick={() => void controller.rescan()}
            >
              {t('重新扫描备份')}
            </Button>
            <Button onClick={() => void controller.disconnect()}>{t('断开目录')}</Button>
          </>
        )}
      </div>
      {state.name && (
        <div className="backup-policies">
          <label className="check-field">
            <input
              type="checkbox"
              checked={controller.autoRead}
              disabled={state.busy}
              onChange={(event) => controller.setAutoRead(event.target.checked)}
            />
            {t('自动读取较新的目录版本')}
          </label>
          <p className="field-hint">
            {t('启用后会在打开页面和返回窗口时检查目录，同 ID 更新保留撤销记录。')}
          </p>
          <label className="field">
            <span>{t('目录删除策略')}</span>
            <select
              aria-label={t('目录删除策略')}
              value={state.policy}
              disabled={state.busy}
              onChange={(event) =>
                controller.setPolicy(event.target.value === 'mirror' ? 'mirror' : 'retain')
              }
            >
              <option value="retain">{t('保留已删除简历的备份')}</option>
              <option value="mirror">{t('同步删除本次连接中删除的简历文件')}</option>
            </select>
          </label>
        </div>
      )}
      {state.error && (
        <p className="transfer-error" role="alert">
          {errorText(state.error)}
        </p>
      )}
      {state.scanErrors.length > 0 && (
        <details>
          <summary>{t('无法读取的文件（{count}）', { count: state.scanErrors.length })}</summary>
          <ul>
            {state.scanErrors.map((entry) => (
              <li key={entry.file}>
                {entry.file}: {errorText(entry.error)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {state.preview.length > 0 && (
        <>
          <h4>{t('查看和恢复备份')}</h4>
          <p>{t('先选择备份检查内容。恢复会创建独立的新简历。')}</p>
          <label className="field">
            <span>{t('备份文件（{count}）', { count: state.preview.length })}</span>
            <select
              aria-label={t('选择要查看的备份')}
              value={preview ? selected : ''}
              onChange={(event) => {
                setSelected(event.target.value);
                setRestored('');
              }}
            >
              <option value="">{t('选择要查看的备份')}</option>
              {state.preview.map((entry) => (
                <option key={entry.file} value={entry.file}>
                  {entry.document.title || t('未命名简历')} · {entry.file}
                </option>
              ))}
            </select>
          </label>
          {preview && (
            <div>
              <p>
                <strong>{preview.document.title}</strong> · {preview.document.profile.name}
              </p>
              <p>{t('备份更新时间：{date}', { date: preview.document.updatedAt })}</p>
              {local && (
                <p>
                  {t(
                    serializeResume(local) === serializeResume(preview.document)
                      ? '与本地简历内容相同'
                      : preview.document.updatedAt > local.updatedAt
                        ? '此备份比同 ID 的本地简历更新'
                        : '本地已有同 ID 的不同版本',
                  )}
                </p>
              )}
              <details>
                <summary>{t('查看完整备份内容')}</summary>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    maxHeight: 320,
                    overflow: 'auto',
                  }}
                >
                  {serializeResume(preview.document)}
                </pre>
              </details>
              <Button
                variant="primary"
                disabled={!ready || state.busy}
                onClick={() => {
                  controller.restore(preview.file);
                  setRestored('已恢复为新简历。');
                }}
              >
                {t('恢复为新简历')}
              </Button>
              {local && (
                <Button
                  disabled={state.busy || !ready}
                  onClick={async () => {
                    const applied = await controller.reconcile(preview.file);
                    setRestored(
                      applied ? '已更新原简历，可通过撤销恢复。' : '未更新，请重新扫描并检查差异。',
                    );
                  }}
                >
                  {t('将此版本应用到原简历')}
                </Button>
              )}
              {restored && <p role="status">{t(restored)}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
