import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Button, Dialog, Field } from '../components/ui';
import { aiRequest, syntheticVision } from './client.ts';
import { finishOrcaConnect, startOrcaConnect } from './oauth.ts';
import {
  providerIds,
  providerNames,
  useAISettings,
  type AISettings,
  type ProviderId,
  type ModelOption,
  type Protocol,
} from './settings.ts';

export default function AISettingsDialog({ onClose }: { onClose: () => void }) {
  const { t, errorText } = useI18n();
  const { settings, update } = useAISettings();
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [search, setSearch] = useState('');
  const [modelId, setModelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const job = useRef<AbortController>();
  const config = settings.providers[provider];
  useEffect(() => {
    let active = true;
    finishOrcaConnect()
      .then((done) => {
        if (active && done) {
          setProvider('orca');
          setStatus(t('已连接 OrcaRouter'));
        }
      })
      .catch((error) => {
        if (active) setError(errorText(error));
      });
    return () => {
      active = false;
      job.current?.abort();
    };
  }, [t, errorText]);
  const change = (mutate: (next: AISettings) => void) => {
    const next = structuredClone(useAISettings.getState().settings);
    mutate(next);
    update(next);
  };
  const patch = (value: Partial<typeof config>) =>
    change((next) => {
      const target = next.providers[provider];
      if (
        (value.endpoint !== undefined && value.endpoint !== target.endpoint) ||
        (value.protocol !== undefined && value.protocol !== target.protocol)
      )
        target.models = [];
      Object.assign(target, value);
    });
  const run = async (action: 'models' | 'test' | 'vision', model?: ModelOption) => {
    const selectedProvider = provider;
    const snapshot = structuredClone(config);
    job.current?.abort();
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      if (action === 'models') {
        const result = await aiRequest<{ models: ModelOption[] }>(
          'models',
          { config: { ...snapshot, provider: selectedProvider } },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        change((next) => {
          const old = next.providers[selectedProvider];
          if (old.endpoint !== snapshot.endpoint || old.apiKey !== snapshot.apiKey) return;
          const fetched = result.models.map((model) => ({
            ...model,
            verifiedVision: old.models.find((item) => item.id === model.id)?.verifiedVision,
          }));
          old.models = [
            ...fetched,
            ...old.models.filter((model) => !fetched.some((item) => item.id === model.id)),
          ];
        });
        setStatus(t('已读取 {count} 个模型', { count: result.models.length }));
      } else {
        const vision = action === 'vision' ? syntheticVision() : null;
        const result = await aiRequest<{ text: string }>(
          'test',
          {
            config: { ...snapshot, provider: selectedProvider, model: model?.id },
            vision: !!vision,
            text: 'Synthetic connection test',
            attachments: vision ? [vision.attachment] : [],
          },
          controller.signal,
        );
        if (vision && !result.text.includes(vision.code))
          throw new Error('模型未能正确读取测试图像。');
        if (!vision && !/\bOK\b/i.test(result.text))
          throw new Error('模型未返回预期的连接测试响应。');
        if (vision)
          change((next) => {
            const current = next.providers[selectedProvider];
            if (
              current.endpoint !== snapshot.endpoint ||
              current.protocol !== snapshot.protocol ||
              current.apiKey !== snapshot.apiKey
            )
              return;
            const item = current.models.find((item) => item.id === model?.id);
            if (item) {
              item.vision = true;
              item.verifiedVision = true;
            }
          });
        setStatus(t(vision ? '视觉测试通过' : '连接测试通过'));
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(errorText(error));
    } finally {
      if (job.current === controller) setBusy(false);
    }
  };
  return (
    <Dialog title={t('AI 设置')} onClose={onClose} wide>
      <div className="editor-form">
        <p>{t('仅在点击读取、测试或生成时请求服务。API key 默认只保留在当前会话。')}</p>
        <label className="field">
          {t('服务商')}
          <select
            aria-label={t('服务商')}
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as ProviderId);
              setSearch('');
              setModelId('');
              setStatus('');
              setError('');
            }}
          >
            {providerIds.map((id) => (
              <option key={id} value={id}>
                {providerNames[id]}
              </option>
            ))}
          </select>
        </label>
        <Field
          label={t('API 地址')}
          value={config.endpoint}
          onChange={(e) => patch({ endpoint: e.target.value })}
        />
        <label className="field">
          {t('接口协议')}
          <select
            aria-label={t('接口协议')}
            value={config.protocol}
            onChange={(e) => patch({ protocol: e.target.value as Protocol })}
          >
            {['chat', 'responses', 'anthropic', 'gemini'].map((protocol) => (
              <option key={protocol}>{protocol}</option>
            ))}
          </select>
        </label>
        <Field
          label="API key"
          type="password"
          autoComplete="off"
          value={config.apiKey}
          onChange={(e) =>
            patch({ apiKey: e.target.value, credentialSource: 'api-key', reauthorize: false })
          }
        />
        <label className="check-field">
          <input
            type="checkbox"
            checked={config.remember}
            onChange={(e) => patch({ remember: e.target.checked })}
          />
          {t('在此设备记住凭据')}
        </label>
        <Button
          onClick={() => patch({ apiKey: '', reauthorize: false, credentialSource: 'api-key' })}
        >
          {t('移除凭据')}
        </Button>
        {config.reauthorize && <p role="alert">{t('凭据已失效，请重新连接或更新 API key。')}</p>}
        {provider === 'orca' && (
          <fieldset>
            <legend>OrcaRouter OAuth</legend>
            <Field
              label={t('应用 ID（可选）')}
              value={settings.orcaAppId}
              onChange={(e) =>
                change((next) => {
                  next.orcaAppId = e.target.value;
                })
              }
            />
            <Field
              label={t('回调地址')}
              placeholder={`${location.origin}/auth/orca/callback`}
              value={settings.orcaCallback}
              onChange={(e) =>
                change((next) => {
                  next.orcaCallback = e.target.value;
                })
              }
            />
            <Button
              disabled={busy}
              onClick={async () => {
                setError('');
                setBusy(true);
                try {
                  const response = await fetch('/api/ai/config');
                  if (!response.ok) throw new Error('AI 服务不可用。');
                  const defaults = await response.json();
                  await startOrcaConnect(
                    settings.orcaAppId || defaults.orcaAppId,
                    settings.orcaCallback || defaults.orcaCallback,
                  );
                } catch (error) {
                  setError(errorText(error));
                  setBusy(false);
                }
              }}
            >
              {t(config.reauthorize ? '重新授权' : '连接 OrcaRouter')}
            </Button>
          </fieldset>
        )}
        <div className="transfer-actions">
          <Button disabled={busy} onClick={() => run('models')}>
            {t('读取模型列表')}
          </Button>
          {busy && (
            <Button
              onClick={() => {
                job.current?.abort();
                setBusy(false);
              }}
            >
              {t('取消')}
            </Button>
          )}
        </div>
        <Field label={t('搜索模型')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="transfer-actions">
          <Field
            label={t('模型 ID')}
            value={modelId}
            maxLength={256}
            onChange={(event) => setModelId(event.target.value)}
            hint={t('模型列表不可用时，可填写服务商提供的模型 ID。')}
          />
          <Button
            disabled={!modelId.trim() || /[\u0000-\u0020\u007f]/.test(modelId.trim())}
            onClick={() => {
              const id = modelId.trim();
              if (!config.models.some((model) => model.id === id))
                patch({ models: [...config.models, { id, name: id, vision: false }] });
              setModelId('');
            }}
          >
            {t('添加模型')}
          </Button>
        </div>
        <div style={{ maxHeight: 280, overflow: 'auto' }}>
          {config.models
            .filter((model) =>
              `${model.id} ${model.name}`.toLowerCase().includes(search.toLowerCase()),
            )
            .map((model) => (
              <div key={model.id} className="transfer-actions">
                <span style={{ flex: 1, overflowWrap: 'anywhere' }}>
                  {model.name} · {model.id}
                  {model.verifiedVision
                    ? ` · ${t('视觉已验证')}`
                    : model.vision
                      ? ` · ${t('支持图像')}`
                      : ''}
                </span>
                <Button disabled={busy} onClick={() => run('test', model)}>
                  {t('测试连接')}
                </Button>
                <Button disabled={busy} onClick={() => run('vision', model)}>
                  {t('测试视觉')}
                </Button>
                <Button
                  onClick={() =>
                    patch({ models: config.models.filter((item) => item.id !== model.id) })
                  }
                >
                  {t('移除')}
                </Button>
              </div>
            ))}
        </div>
        {(['text', 'pdf'] as const).map((task) => (
          <fieldset key={task}>
            <legend>{t(task === 'text' ? '文字任务模型' : 'PDF 任务模型')}</legend>
            <label className="field">
              {t('服务商')}
              <select
                aria-label={t('服务商')}
                value={settings[task].provider}
                onChange={(e) =>
                  change((next) => {
                    next[task] = { provider: e.target.value as ProviderId, model: '' };
                  })
                }
              >
                {providerIds.map((id) => (
                  <option key={id} value={id}>
                    {providerNames[id]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('模型')}
              <select
                aria-label={t('模型')}
                value={settings[task].model}
                onChange={(e) =>
                  change((next) => {
                    next[task].model = e.target.value;
                  })
                }
              >
                <option value="">{t('请选择模型')}</option>
                {settings.providers[settings[task].provider].models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                    {model.verifiedVision ? ` · ${t('视觉已验证')}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ))}
        {status && <p role="status">{status}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
