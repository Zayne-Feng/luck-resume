const unavailable = () =>
  error(503, 'The local service is unavailable. Keep the backend computer and tunnel online.');

function error(status, message) {
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}

function httpsOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid HTTPS origin.');
  return url.origin;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/'))
      return env.ASSETS.fetch(request);

    let publicOrigin;
    let tunnelOrigin;
    try {
      publicOrigin = httpsOrigin(env.LUCK_PUBLIC_ORIGIN);
      tunnelOrigin = httpsOrigin(env.LUCK_TUNNEL_ORIGIN);
      if (
        tunnelOrigin === publicOrigin ||
        !/^[a-zA-Z0-9_-]{32,256}$/.test(env.LUCK_PROXY_TOKEN || '')
      )
        return unavailable();
    } catch {
      return unavailable();
    }

    if (
      url.origin !== publicOrigin ||
      (request.headers.has('origin') && request.headers.get('origin') !== publicOrigin) ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      return error(403, 'Cross-origin API requests are not allowed.');
    if (url.pathname === '/api') return error(404, 'This API endpoint does not exist.');
    if (!['GET', 'POST'].includes(request.method))
      return error(405, 'This API supports GET and POST requests only.');
    if (
      request.method === 'POST' &&
      !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')
    )
      return error(415, 'Use application/json for this request.');
    if (Number(request.headers.get('content-length') || 0) > 32 * 1024 * 1024)
      return error(413, 'The request exceeds the size limit.');

    const headers = new Headers({
      Origin: publicOrigin,
      'X-Luck-Proxy-Token': env.LUCK_PROXY_TOKEN,
    });
    for (const name of ['content-type', 'accept']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    try {
      const upstream = await fetch(`${tunnelOrigin}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? request.body : undefined,
        duplex: 'half',
        redirect: 'manual',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(130_000)]),
      });
      const contentType = upstream.headers.get('content-type') || '';
      if (
        (upstream.status >= 300 && upstream.status < 400) ||
        /text\/html/i.test(contentType) ||
        (upstream.status >= 500 && !/application\/json/i.test(contentType))
      ) {
        await upstream.body?.cancel();
        return unavailable();
      }
      const responseHeaders = new Headers(upstream.headers);
      for (const name of [
        'set-cookie',
        'x-luck-proxy-token',
        'access-control-allow-origin',
        'access-control-allow-credentials',
      ])
        responseHeaders.delete(name);
      responseHeaders.set('Cache-Control', 'no-store');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
      return request.signal.aborted ? error(499, 'Request cancelled.') : unavailable();
    }
  },
};
