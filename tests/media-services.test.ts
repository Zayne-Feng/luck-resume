import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createAssetsHandler, isPublicAddress } from '../server/assets.mjs';

const serve = async (handler) => {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
};
const context = (path, body, extra = {}) => ({
  path,
  body,
  method: 'POST',
  signal: new AbortController().signal,
  ...extra,
});

test('remote image requests block local hosts and unsupported schemes', async () => {
  const handler = createAssetsHandler();
  for (const url of [
    'http://127.0.0.1/a.png',
    'http://[::1]/a.png',
    'file:///tmp/a.png',
    'https://user:pass@example.com/a',
  ]) {
    assert.equal((await handler(context('/api/assets/image', { url }))).status, 400);
  }
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    '2001:db8::1',
  ])
    assert.equal(isPublicAddress(ip), false);
  assert.equal(isPublicAddress('8.8.8.8'), true);
});

test('image service returns bounded raster bytes and validates every redirect', async () => {
  const fixture = await serve((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: 'file:///etc/passwd' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': req.url === '/html' ? 'text/html' : 'image/png' });
    res.end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]));
  });
  try {
    const handler = createAssetsHandler();
    const image = await handler(
      context('/api/assets/image', { url: `${fixture.url}/image` }, { allowLocalProviders: true }),
    );
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(
      (
        await handler(
          context(
            '/api/assets/image',
            { url: `${fixture.url}/redirect` },
            { allowLocalProviders: true },
          ),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await handler(
          context(
            '/api/assets/image',
            { url: `${fixture.url}/html` },
            { allowLocalProviders: true },
          ),
        )
      ).status,
      502,
    );
  } finally {
    fixture.server.closeAllConnections();
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  }
});

test('university pagination normalizes source and rejects unsafe image paths', async () => {
  let sent;
  const fixture = await serve((req, res) => {
    let text = '';
    req.on('data', (part) => (text += part));
    req.on('end', () => {
      sent = JSON.parse(text);
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          result_list: [
            { id: 1, zh_name: 'Example University', dir: 'uni_logo/example.png' },
            { id: 2, zh_name: 'Invalid', dir: '../outside.png' },
          ],
          total_page: [1, 2],
        }),
      );
    });
  });
  try {
    const handler = createAssetsHandler({ universitiesUrl: `${fixture.url}/search` });
    const response = await handler(
      context(
        '/api/assets/universities',
        { query: 'Example', page: 1 },
        { allowLocalProviders: true },
      ),
    );
    const result = await response.json();
    assert.equal(result.items.length, 1);
    assert.equal(result.hasMore, true);
    assert.equal(sent.input_text, 'Example');
    assert.equal(sent.page_now, 1);
    assert.match(result.items[0].url, /^https:\/\/universitylogos.top/);
  } finally {
    fixture.server.closeAllConnections();
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  }
});

test('GitHub GraphQL sends credentials upstream and returns calendar data only', async () => {
  let sent;
  let authorization;
  const fixture = await serve((req, res) => {
    let text = '';
    authorization = req.headers.authorization;
    req.on('data', (part) => (text += part));
    req.on('end', () => {
      sent = JSON.parse(text);
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          data: {
            user: {
              contributionsCollection: {
                contributionCalendar: {
                  weeks: [{ contributionDays: [{ date: '2026-02-03', contributionCount: 7 }] }],
                },
              },
            },
          },
        }),
      );
    });
  });
  try {
    const handler = createAssetsHandler({ githubUrl: `${fixture.url}/graphql` });
    const response = await handler(
      context(
        '/api/assets/github',
        { username: 'example', token: 'secret', year: 2026 },
        { allowLocalProviders: true },
      ),
    );
    const calendar = await response.json();
    assert.equal(response.status, 200);
    assert.equal(authorization, 'Bearer secret');
    assert.equal(sent.variables.from, '2026-01-01T00:00:00Z');
    assert.deepEqual(calendar.days, [{ date: '2026-02-03', count: 7 }]);
    assert.equal(JSON.stringify(calendar).includes('secret'), false);
    assert.equal(calendar.username, undefined);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    fixture.server.closeAllConnections();
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  }
});

test('local test access accepts loopback only and blocks private network destinations', async () => {
  const handler = createAssetsHandler();
  const response = await handler(
    context(
      '/api/assets/image',
      { url: 'http://10.0.0.1/private.png' },
      { allowLocalProviders: true },
    ),
  );
  assert.equal(response.status, 400);
});

test('IPv6 address classification normalizes expanded special ranges', () => {
  for (const ip of [
    '2001:0000:0000:0000:0000:0000:0000:0001',
    '2002:0000:0000:0000:0000:0000:0000:0001',
    '::ffff:7f00:1',
  ])
    assert.equal(isPublicAddress(ip), false);
});

test('same-origin HTTP routes fetch actual upstream images, school pages and GitHub snapshots', async () => {
  const { apiMiddleware } = await import('../server/http.mjs');
  const pixels = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const upstream = await serve((req, res) => {
    if (req.url === '/image') {
      res.setHeader('content-type', 'image/png');
      res.end(pixels);
      return;
    }
    let body = '';
    req.on('data', (part) => (body += part));
    req.on('end', () => {
      const input = JSON.parse(body);
      if (req.url === '/search') {
        assert.equal(input.page_now, 2);
        res.end(
          JSON.stringify({
            result_list: [{ zh_name: 'Synthetic University', dir: 'uni_logo/synthetic.png' }],
            total_page: [1, 2, 3],
          }),
        );
      } else {
        assert.equal(req.headers.authorization, 'Bearer synthetic-token');
        res.end(
          JSON.stringify({
            data: {
              user: {
                contributionsCollection: {
                  contributionCalendar: {
                    weeks: [{ contributionDays: [{ date: '2026-03-03', contributionCount: 3 }] }],
                  },
                },
              },
            },
          }),
        );
      }
    });
  });
  const service = await serve((req, res) =>
    apiMiddleware(req, res, undefined, {
      allowLocalProviders: true,
      handlers: [
        createAssetsHandler({
          universitiesUrl: `${upstream.url}/search`,
          githubUrl: `${upstream.url}/github`,
        }),
      ],
    }),
  );
  const post = (path, body) =>
    fetch(`${service.url}/api/assets/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: service.url },
      body: JSON.stringify(body),
    });
  try {
    const image = await post('image', { url: `${upstream.url}/image` });
    assert.equal(image.status, 200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), pixels);
    const schools = await (await post('universities', { query: 'Synthetic', page: 2 })).json();
    assert.equal(schools.items[0].name, 'Synthetic University');
    assert.equal(schools.page, 2);
    assert.equal(schools.hasMore, true);
    const calendar = await (
      await post('github', { username: 'example', token: 'synthetic-token', year: 2026 })
    ).json();
    assert.deepEqual(calendar.days, [{ date: '2026-03-03', count: 3 }]);
    assert.equal(JSON.stringify(calendar).includes('synthetic-token'), false);
  } finally {
    for (const fixture of [service, upstream]) {
      fixture.server.closeAllConnections();
      await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
    }
  }
});
