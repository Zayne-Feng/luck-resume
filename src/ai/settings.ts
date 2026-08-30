import { create } from 'zustand';

export type Protocol = 'chat' | 'responses' | 'anthropic' | 'gemini';
export const providerIds = [
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'qwen',
  'doubao',
  'orca',
] as const;
export type ProviderId = (typeof providerIds)[number];
export interface ModelOption {
  id: string;
  name: string;
  vision: boolean;
  verifiedVision?: boolean;
}
export interface ProviderSettings {
  endpoint: string;
  protocol: Protocol;
  apiKey: string;
  remember: boolean;
  models: ModelOption[];
  credentialSource?: 'api-key' | 'oauth';
  reauthorize?: boolean;
}
export interface Assignment {
  provider: ProviderId;
  model: string;
}
export interface AISettings {
  providers: Record<ProviderId, ProviderSettings>;
  text: Assignment;
  pdf: Assignment;
  orcaAppId: string;
  orcaCallback: string;
}
export const providerNames: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  doubao: 'Doubao',
  orca: 'OrcaRouter',
};
const defaults: Record<ProviderId, [string, Protocol]> = {
  openai: ['https://api.openai.com/v1', 'responses'],
  anthropic: ['https://api.anthropic.com/v1', 'anthropic'],
  gemini: ['https://generativelanguage.googleapis.com/v1beta', 'gemini'],
  deepseek: ['https://api.deepseek.com/v1', 'chat'],
  qwen: ['https://dashscope.aliyuncs.com/compatible-mode/v1', 'chat'],
  doubao: ['https://ark.cn-beijing.volces.com/api/v3', 'chat'],
  orca: ['https://api.orcarouter.ai/v1', 'chat'],
};
export function defaultSettings(): AISettings {
  const providers = {} as AISettings['providers'];
  for (const id of providerIds)
    providers[id] = {
      endpoint: defaults[id][0],
      protocol: defaults[id][1],
      apiKey: '',
      remember: false,
      models: [],
    };
  return {
    providers,
    text: { provider: 'openai', model: '' },
    pdf: { provider: 'openai', model: '' },
    orcaAppId: '',
    orcaCallback: '',
  };
}
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const storageKey = 'luck-ai-settings';
const credentialKey = 'luck-ai-session-credentials';
export function readSettings(local?: Store, session?: Store): AISettings {
  const result = defaultSettings();
  try {
    const saved = JSON.parse(local?.getItem(storageKey) || '{}');
    const credentials = JSON.parse(session?.getItem(credentialKey) || '{}');
    for (const id of providerIds) {
      const entry = saved.providers?.[id];
      if (!entry || typeof entry !== 'object') continue;
      const target = result.providers[id];
      if (typeof entry.endpoint === 'string' && entry.endpoint.length <= 2048)
        target.endpoint = entry.endpoint;
      if (['chat', 'responses', 'anthropic', 'gemini'].includes(entry.protocol))
        target.protocol = entry.protocol;
      target.remember = entry.remember === true;
      const key = target.remember ? entry.apiKey : credentials[id];
      target.apiKey = typeof key === 'string' ? key.slice(0, 8192) : '';
      target.models = Array.isArray(entry.models)
        ? entry.models
            .filter(
              (model: ModelOption) =>
                model && typeof model.id === 'string' && model.id.length <= 256,
            )
            .slice(0, 5000)
            .map((model: ModelOption) => ({
              id: model.id,
              name: typeof model.name === 'string' ? model.name : model.id,
              vision: model.vision === true,
              verifiedVision: model.verifiedVision === true,
            }))
        : [];
      target.credentialSource = entry.credentialSource === 'oauth' ? 'oauth' : 'api-key';
      target.reauthorize = entry.reauthorize === true;
    }
    for (const task of ['text', 'pdf'] as const)
      if (providerIds.includes(saved[task]?.provider) && typeof saved[task]?.model === 'string')
        result[task] = { provider: saved[task].provider, model: saved[task].model };
    if (typeof saved.orcaAppId === 'string') result.orcaAppId = saved.orcaAppId;
    if (typeof saved.orcaCallback === 'string') result.orcaCallback = saved.orcaCallback;
  } catch {
    /* Invalid preferences use defaults. */
  }
  return result;
}
export function saveSettings(settings: AISettings, local?: Store, session?: Store) {
  const safe = structuredClone(settings);
  const credentials: Partial<Record<ProviderId, string>> = {};
  for (const id of providerIds)
    if (!safe.providers[id].remember) {
      credentials[id] = safe.providers[id].apiKey;
      safe.providers[id].apiKey = '';
    }
  local?.setItem(storageKey, JSON.stringify(safe));
  session?.setItem(credentialKey, JSON.stringify(credentials));
}
function browserStores() {
  try {
    return { local: globalThis.localStorage, session: globalThis.sessionStorage };
  } catch {
    return {};
  }
}
export const useAISettings = create<{ settings: AISettings; update: (next: AISettings) => void }>(
  (set) => ({
    settings: readSettings(browserStores().local, browserStores().session),
    update: (next) => {
      set({ settings: next });
      try {
        const stores = browserStores();
        saveSettings(next, stores.local, stores.session);
      } catch {
        /* In-memory preferences remain usable. */
      }
    },
  }),
);
export function taskConfig(task: 'text' | 'pdf') {
  const settings = useAISettings.getState().settings;
  const assignment = settings[task];
  const provider = settings.providers[assignment.provider];
  if (!assignment.model || !provider.models.some((model) => model.id === assignment.model))
    throw new Error('请先在 AI 设置中为此任务选择模型。');
  if (provider.reauthorize) throw new Error('凭据已失效，请重新连接或更新 API key。');
  return { ...provider, model: assignment.model, provider: assignment.provider };
}
export function markAuthenticationFailure(provider: ProviderId, key: string) {
  const { settings, update } = useAISettings.getState();
  if (settings.providers[provider].apiKey !== key) return;
  const next = structuredClone(settings);
  next.providers[provider].reauthorize = true;
  update(next);
}
