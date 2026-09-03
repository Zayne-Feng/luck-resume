export function publicConfiguration(env) {
  let url;
  try {
    url = new URL(env.LUCK_PUBLIC_ORIGIN);
  } catch {
    throw new Error('LUCK_PUBLIC_ORIGIN must be a complete HTTPS origin.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('LUCK_PUBLIC_ORIGIN must be an HTTPS origin without a path or credentials.');
  if (!/^[a-zA-Z0-9_-]{32,256}$/.test(env.LUCK_PROXY_TOKEN || ''))
    throw new Error('LUCK_PROXY_TOKEN must contain 32 to 256 URL-safe characters.');
  const port = Number(env.PORT || 5176);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer from 1 to 65535.');
  return { publicOrigin: url.origin, proxyToken: env.LUCK_PROXY_TOKEN, port };
}
