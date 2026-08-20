import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { createDocument, type Appearance } from '../resume/model.ts';
import ResumeDocument from '../resume/ResumeDocument';
import {
  createAppearancePreset,
  deleteAppearancePreset,
  importAppearancePresets,
  listAppearancePresets,
  MAX_PRESET_FILE_BYTES,
  parseAppearancePresets,
  renameAppearancePreset,
  serializeAppearancePresets,
  type AppearancePreset,
} from '../storage/appearancePresets.ts';
import { Button, Dialog, Field } from './ui';

export default function AppearancePresetsPanel({
  appearance,
  onApply,
}: {
  appearance: Appearance;
  onApply: (appearance: Appearance) => void;
}) {
  const { t, errorText } = useI18n();
  const [presets, setPresets] = useState<AppearancePreset[]>([]);
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<AppearancePreset | null>(null);
  const [pending, setPending] = useState<AppearancePreset[] | null>(null);
  const [rename, setRename] = useState<AppearancePreset | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const rows = await listAppearancePresets();
      if (mounted.current) setPresets(rows);
    } catch (cause) {
      if (mounted.current) setError(errorText(cause));
    }
  }, [errorText]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (cause) {
      if (mounted.current) setError(errorText(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const sample = useMemo(() => {
    if (!preview) return null;
    return { ...createDocument(preview.appearance.template, true), appearance: preview.appearance };
  }, [preview]);
  const download = (row: AppearancePreset) => {
    try {
      const url = URL.createObjectURL(
        new Blob([serializeAppearancePresets([row])], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'appearance-preset.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(errorText(cause));
    }
  };
  return (
    <section className="appearance-presets-panel" aria-label={t('我的样式')}>
      <h3>{t('我的样式')}</h3>
      <p>{t('保存排版和配色，预览后应用到当前简历。')}</p>
      <Field
        label={t('样式名称')}
        value={name}
        maxLength={80}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="button-row">
        <Button
          disabled={busy || !name.trim()}
          onClick={() =>
            void run(async () => {
              await createAppearancePreset(name, appearance);
              setName('');
            })
          }
        >
          {t('保存当前样式')}
        </Button>
        <Button disabled={busy} onClick={() => input.current?.click()}>
          {t('导入样式')}
        </Button>
        <Button disabled={busy} onClick={() => void refresh()}>
          {t('刷新样式')}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void run(async () => {
            if (file.size > MAX_PRESET_FILE_BYTES) throw new Error('样式文件不能超过 1 MB。');
            setPending(parseAppearancePresets(await file.text()));
          });
        }}
      />
      {error && <p role="alert">{error}</p>}
      {!presets.length && <p>{t('尚未保存样式。')}</p>}
      <ul className="appearance-preset-list">
        {presets.map((row) => (
          <li key={row.id}>
            <strong>{row.name}</strong>
            <div className="button-row">
              <Button disabled={busy} onClick={() => setPreview(row)}>
                {t('预览样式')}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setRename(row);
                  setRenameValue(row.name);
                }}
              >
                {t('重命名样式')}
              </Button>
              <Button disabled={busy} onClick={() => download(row)}>
                {t('导出样式')}
              </Button>
              <Button
                disabled={busy}
                variant="danger"
                onClick={() => void run(() => deleteAppearancePreset(row.id))}
              >
                {t('删除样式')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {preview && sample && (
        <Dialog title={t('样式预览')} onClose={() => setPreview(null)} wide>
          <p>
            {preview.name} · {t('使用示例内容预览，仅应用外观设置。')}
          </p>
          <div className="appearance-preset-preview">
            <ResumeDocument document={sample} miniature />
          </div>
          <Button
            variant="primary"
            onClick={() => {
              onApply(structuredClone(preview.appearance));
              setPreview(null);
            }}
          >
            {t('应用此样式')}
          </Button>
        </Dialog>
      )}
      {rename && (
        <Dialog title={t('重命名样式')} onClose={() => setRename(null)}>
          <Field
            label={t('样式名称')}
            value={renameValue}
            maxLength={80}
            onChange={(event) => setRenameValue(event.target.value)}
          />
          <Button
            disabled={busy || !renameValue.trim()}
            onClick={() =>
              void run(async () => {
                await renameAppearancePreset(rename.id, renameValue);
                setRename(null);
              })
            }
          >
            {t('保存样式名称')}
          </Button>
        </Dialog>
      )}
      {pending && (
        <Dialog title={t('检查导入样式')} onClose={() => setPending(null)}>
          <p>{t('导入后将新增独立样式，不会修改当前简历。')}</p>
          <ul>
            {pending.map((row, index) => (
              <li key={index}>
                {row.name} <Button onClick={() => setPreview(row)}>{t('预览样式')}</Button>
              </li>
            ))}
          </ul>
          <Button
            disabled={busy || !pending.length}
            variant="primary"
            onClick={() =>
              void run(async () => {
                await importAppearancePresets(pending);
                setPending(null);
              })
            }
          >
            {t('确认导入样式')}
          </Button>
        </Dialog>
      )}
    </section>
  );
}
