import { aiRequest } from './client.ts';
import { useAISettings } from './settings.ts';

const pendingKey = 'luck-orca-pkce';
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
export async function startOrcaConnect(appId: string, callback: string) {
  const { authorizationEndpoint } = await aiRequest<{ authorizationEndpoint: string }>(
    'oauth/discovery',
    {},
  );
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  const redirect = new URL(callback || '/auth/orca/callback', location.origin);
  if (redirect.origin !== location.origin || redirect.pathname !== '/auth/orca/callback')
    throw new Error('OAuth 回调必须使用本站的 /auth/orca/callback。');
  sessionStorage.setItem(pendingKey, JSON.stringify({ verifier, state, created: Date.now() }));
  const url = new URL(authorizationEndpoint);
  url.searchParams.set('callback_url', redirect.href);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'api');
  url.searchParams.set('app_name', 'Luck');
  if (appId.trim()) url.searchParams.set('app_id', appId.trim());
  location.assign(url.href);
}
let callbackJob: Promise<boolean> | undefined;
export function finishOrcaConnect(): Promise<boolean> {
  if (callbackJob) return callbackJob;
  if (location.pathname !== '/auth/orca/callback') return Promise.resolve(false);
  callbackJob = (async () => {
    const params = new URLSearchParams(location.search);
    const saved = sessionStorage.getItem(pendingKey);
    sessionStorage.removeItem(pendingKey);
    history.replaceState(null, '', '/');
    const pending = saved ? JSON.parse(saved) : null;
    if (!pending || params.get('state') !== pending.state || Date.now() - pending.created > 600000)
      throw new Error('OAuth 会话已过期或状态不匹配，请重新连接。');
    if (params.has('error')) throw new Error('授权已取消，请重新连接。');
    const code = params.get('code');
    if (!code) throw new Error('缺少授权码，请重新连接。');
    const { key } = await aiRequest<{ key: string }>('oauth/exchange', {
      code,
      verifier: pending.verifier,
    });
    const { settings, update } = useAISettings.getState();
    const next = structuredClone(settings);
    next.providers.orca.apiKey = key;
    next.providers.orca.credentialSource = 'oauth';
    next.providers.orca.reauthorize = false;
    update(next);
    return true;
  })();
  return callbackJob;
}
