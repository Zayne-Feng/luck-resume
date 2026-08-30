import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { Button, Dialog } from '../components/ui';
import { generate } from './client.ts';
import { taskConfig } from './settings.ts';

export default function FieldAssist({
  value,
  onApply,
  label,
  onLocate,
  sourceKey = value,
  renderPreview,
  renderSource,
  controls,
}: {
  value: string;
  onApply: (text: string) => void;
  label?: string;
  onLocate?: () => void;
  sourceKey?: string;
  renderPreview?: (text: string, sourceIdentity: string) => ReactNode;
  renderSource?: (sourceIdentity: string) => ReactNode;
  controls?: ReactNode;
}) {
  const { t, errorText } = useI18n();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [result, setResult] = useState('');
  const [source, setSource] = useState('');
  const [sourceIdentity, setSourceIdentity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const job = useRef<AbortController>();
  const currentSource = useRef({ value, sourceKey });
  currentSource.current = { value, sourceKey };
  const stale = source !== value || sourceIdentity !== sourceKey;
  let formattedPreview: ReactNode;
  let previewError = '';
  if (result && renderPreview) {
    try {
      formattedPreview = renderPreview(result, sourceIdentity);
    } catch (failure) {
      previewError = errorText(failure);
    }
  }
  useEffect(() => () => job.current?.abort(), []);
  const close = () => {
    job.current?.abort();
    job.current = undefined;
    setBusy(false);
    setOpen(false);
  };
  const run = async () => {
    job.current?.abort();
    const controller = new AbortController();
    job.current = controller;
    const snapshot = value;
    setSource(snapshot);
    setSourceIdentity(sourceKey);
    setResult('');
    setError('');
    setBusy(true);
    try {
      await generate(taskConfig('text'), 'polish', snapshot, {
        instructions,
        signal: controller.signal,
        onText: (text) => {
          if (!controller.signal.aborted && job.current === controller) setResult(text);
        },
      });
    } catch (error) {
      if (!controller.signal.aborted && job.current === controller) setError(errorText(error));
    } finally {
      if (job.current === controller) setBusy(false);
    }
  };
  return (
    <>
      <Button
        disabled={!value.trim()}
        onClick={() => {
          setOpen(true);
          setResult('');
          setError('');
          setSource('');
          setSourceIdentity('');
        }}
      >
        {t('AI 润色')}
      </Button>
      {open && (
        <Dialog title={label ? `${t('AI 润色')} · ${label}` : t('AI 润色')} onClose={close} wide>
          <p>{t('点击生成后，将当前字段发送至所选模型。确认后才应用。')}</p>
          <label className="field">
            {t('本次写作要求')}
            <textarea
              aria-label={t('本次写作要求')}
              value={instructions}
              maxLength={4000}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          <div className="transfer-actions">
            <Button disabled={busy} onClick={run}>
              {t(result ? '重新生成' : '生成建议')}
            </Button>
            {busy && (
              <Button
                onClick={() => {
                  job.current?.abort();
                  job.current = undefined;
                  setBusy(false);
                  setResult('');
                }}
              >
                {t('取消')}
              </Button>
            )}
            {onLocate && <Button onClick={onLocate}>{t('定位原文')}</Button>}
          </div>
          {result && (
            <div className="ai-comparison">
              <div>
                <h3>{t('原文')}</h3>
                {renderSource ? (
                  renderSource(sourceIdentity)
                ) : (
                  <pre style={{ whiteSpace: 'pre-wrap' }}>{source}</pre>
                )}
              </div>
              <label className="field">
                {t('修改建议')}
                <textarea
                  aria-label={t('修改建议')}
                  rows={10}
                  value={result}
                  onChange={(e) => {
                    setResult(e.target.value);
                    setError('');
                  }}
                />
              </label>
            </div>
          )}
          {result && renderPreview && (
            <div className="ai-structured-preview" aria-label={t('格式预览')}>
              <h3>{t('格式预览')}</h3>
              {controls}
              {formattedPreview}
            </div>
          )}
          {source && stale && <p role="status">{t('原文已变化，请重新生成。')}</p>}
          {error && <p role="alert">{error}</p>}
          {previewError && <p role="alert">{previewError}</p>}
          <Button
            variant="primary"
            disabled={busy || !result.trim() || stale || !!error || !!previewError}
            onClick={() => {
              if (
                currentSource.current.value !== source ||
                currentSource.current.sourceKey !== sourceIdentity
              )
                return;
              try {
                onApply(result);
                close();
              } catch (failure) {
                setError(errorText(failure));
              }
            }}
          >
            {t('应用修改')}
          </Button>
        </Dialog>
      )}
    </>
  );
}
