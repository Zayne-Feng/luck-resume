import { useEffect, useState } from 'react';
import { useI18n, t, errorText } from '../i18n';

export default function StorageStatusPanel() {
  useI18n();
  const [estimate, setEstimate] = useState<StorageEstimate>({});
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const manager = navigator.storage;
      if (!manager) return;
      const [usage, durable] = await Promise.all([manager.estimate?.(), manager.persisted?.()]);
      setEstimate(usage ?? {});
      setPersisted(durable ?? null);
    } catch (reason) {
      setError(reason);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const megabytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`;
  return (
    <section className="storage-status-panel editor-form" aria-label={t('本地存储')}>
      <h3>{t('本地存储')}</h3>
      <p>
        {t('浏览器总用量')}：
        {estimate.usage === undefined ? t('不可用') : megabytes(estimate.usage)} /{' '}
        {estimate.quota === undefined ? t('不可用') : megabytes(estimate.quota)}
      </p>
      <p>
        {persisted === null
          ? t('持久存储状态不可用')
          : persisted
            ? t('已启用持久存储')
            : t('尚未启用持久存储')}
      </p>
      <button
        type="button"
        disabled={busy || !navigator.storage?.persist || persisted === true}
        onClick={() => {
          setBusy(true);
          setError(null);
          void navigator.storage
            .persist()
            .then((result) => setPersisted(result))
            .catch((reason) => setError(reason))
            .finally(() => setBusy(false));
        }}
      >
        {t('请求持久存储')}
      </button>
      <button type="button" onClick={() => void refresh()}>
        {t('刷新存储状态')}
      </button>
      {error != null && <p role="alert">{errorText(error)}</p>}
    </section>
  );
}
