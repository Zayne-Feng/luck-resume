import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

export class RemoteError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function isPublicAddress(address) {
  let ip = address.toLowerCase().split('%')[0];
  if (isIP(ip) === 6) ip = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  if (ip.startsWith('::ffff:')) {
    const tail = ip.slice(7);
    if (isIP(tail) === 4) return isPublicAddress(tail);
    const parts = tail.split(':');
    if (parts.length === 2) {
      const value = parseInt(parts[0], 16) * 65536 + parseInt(parts[1], 16);
      return isPublicAddress([24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.'));
    }
    return false;
  }
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    );
  }
  if (isIP(ip) === 6) {
    if (!/^2[0-9a-f]{3}:/.test(ip)) return false;
    return !/^2001:(?::|0:|db8:|1[0-9a-f]:|2[0-9a-f]:)/.test(ip) && !ip.startsWith('2002:');
  }
  return false;
}

export async function validatePublicUrl(value, { allowLocalProviders = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new RemoteError('Invalid remote URL.', 400);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.length > 4096
  )
    throw new RemoteError('Invalid remote URL.', 400);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new RemoteError('Remote host could not be resolved.');
  }
  const permitted = (address) =>
    isPublicAddress(address) ||
    (allowLocalProviders && (address === '::1' || /^127\./.test(address)));
  if (!addresses.length || addresses.some(({ address }) => !permitted(address)))
    throw new RemoteError('Remote URL must use a public address.', 400);
  return { url, address: addresses[0] };
}

export async function requestPublic(value, options = {}) {
  const {
    signal,
    maxBytes = 8 * 1024 * 1024,
    allowLocalProviders = false,
    redirects = 3,
  } = options;
  const { url, address } = await validatePublicUrl(value, { allowLocalProviders });
  if (signal?.aborted) throw signal.reason;
  const response = await new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers,
        signal,
        lookup: (_hostname, lookupOptions, done) =>
          lookupOptions.all ? done(null, [address]) : done(null, address.address, address.family),
      },
      (upstream) => {
        const status = upstream.statusCode || 502;
        if ([301, 302, 303, 307, 308].includes(status)) {
          upstream.resume();
          resolve({ status, headers: upstream.headers, bytes: Buffer.alloc(0), url });
          return;
        }
        const declared = Number(upstream.headers['content-length']);
        if (declared > maxBytes) {
          upstream.destroy();
          reject(new RemoteError('Remote response is too large.'));
          return;
        }
        const parts = [];
        let size = 0;
        upstream.on('data', (part) => {
          size += part.length;
          if (size > maxBytes) {
            upstream.destroy();
            reject(new RemoteError('Remote response is too large.'));
          } else parts.push(part);
        });
        upstream.on('end', () =>
          resolve({ status, headers: upstream.headers, bytes: Buffer.concat(parts), url }),
        );
        upstream.on('error', reject);
      },
    );
    request.on('error', reject);
    request.setTimeout(12000, () =>
      request.destroy(new RemoteError('Remote request timed out.', 504)),
    );
    request.end(options.body);
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects <= 0 || !response.headers.location)
      throw new RemoteError('Remote redirect is not allowed.');
    const next = new URL(response.headers.location, url);
    const headers = { ...options.headers };
    if (next.origin !== url.origin)
      for (const key of Object.keys(headers))
        if (/^(authorization|cookie|proxy-authorization)$/i.test(key)) delete headers[key];
    const rewrite =
      response.status === 303 ||
      ([301, 302].includes(response.status) && options.method === 'POST');
    return requestPublic(next.href, {
      ...options,
      headers,
      redirects: redirects - 1,
      ...(rewrite ? { method: 'GET', body: undefined } : {}),
    });
  }
  return response;
}
