import { useI18n, t, errorText } from '../i18n';
import type { LocalFilesController } from '../storage/useLocalFiles.ts';
import { Button } from './ui';

export default function LocalFilePanel({ files }: { files: LocalFilesController }) {
  useI18n();
  const { state, hasDocument } = files;
  return (
    <section className="transfer-export local-file-panel" aria-label={t('本地 JSON 文件')}>
      <h3>{t('本地 JSON 文件')}</h3>
      <p>{t('打开 JSON 后关联本地文件，编辑完成后点击保存。文件关联仅在本次页面会话中保留。')}</p>
      {state.name ? (
        <p role="status" aria-live="polite">
          {t('已关联：')}
          <strong>{state.name}</strong>
          {' · '}
          {state.busy
            ? t('正在处理…')
            : state.dirty
              ? t('有未保存到文件的修改')
              : t('已保存到文件')}
        </p>
      ) : (
        <p role="status" aria-live="polite">
          {state.busy ? t('正在处理…') : t('尚未关联本地文件')}
        </p>
      )}
      <div className="transfer-actions">
        {state.canOpen && (
          <Button disabled={state.busy} onClick={() => void files.open()}>
            {t('打开并关联 JSON')}
          </Button>
        )}
        {state.name && (
          <Button variant="primary" disabled={state.busy} onClick={() => void files.save()}>
            {t('保存到关联文件')}
          </Button>
        )}
        {state.canSaveAs && (
          <Button disabled={state.busy || !hasDocument} onClick={() => void files.saveAs()}>
            {t('另存为 JSON 文件')}
          </Button>
        )}
        {state.name && (
          <Button disabled={state.busy} onClick={files.disconnect}>
            {t('断开文件关联')}
          </Button>
        )}
      </div>
      {(!state.canOpen || !state.canSaveAs) && (
        <p>
          {t(
            '当前浏览器未提供完整的本地文件访问功能。可使用页面中的“导入”和“存原稿”完成 JSON 导入与下载。',
          )}
        </p>
      )}
      {state.error && (
        <p className="transfer-error" role="alert">
          {errorText(state.error)}
        </p>
      )}
    </section>
  );
}
