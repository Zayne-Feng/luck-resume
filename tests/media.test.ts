import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchRemoteImage,
  fetchGithubCalendar,
  searchUniversities,
  readImageBatch,
} from '../src/resume/media.ts';

test('image batch preserves file ordering and converts each selected image', async () => {
  const files = [
    new File(['a'], 'first.png', { type: 'image/png' }),
    new File(['b'], 'second.jpg', { type: 'image/jpeg' }),
  ];
  assert.deepEqual(await readImageBatch(files, async (file) => `data:${file.name}`), [
    { name: 'first', data: 'data:first.png' },
    { name: 'second', data: 'data:second.jpg' },
  ]);
  await assert.rejects(
    readImageBatch(
      Array.from({ length: 21 }, () => files[0]),
      async () => 'x',
    ),
    /20/,
  );
});

test('remote image calls same-origin service and decodes into embedded pixels', async () => {
  let received;
  const result = await fetchRemoteImage('https://example.com/photo.png', {
    fetcher: async (url, init) => {
      received = { url, body: JSON.parse(init.body) };
      return new Response(new Blob(['png'], { type: 'image/png' }));
    },
    reader: async (file) => {
      assert.equal(file.type, 'image/png');
      return 'data:image/png;base64,pixels';
    },
  });
  assert.equal(result, 'data:image/png;base64,pixels');
  assert.equal(received.url, '/api/assets/image');
  assert.deepEqual(received.body, { url: 'https://example.com/photo.png' });
});

test('GitHub client validates snapshot and excludes credentials from calendar', async () => {
  const calendar = await fetchGithubCalendar('example', 'secret', 2026, {
    fetcher: async () =>
      Response.json({
        year: 2026,
        title: 'GitHub',
        visible: true,
        days: [{ date: '2026-01-01', count: 2 }],
        token: 'secret',
      }),
  });
  assert.equal(calendar.days[0].count, 2);
  assert.equal('token' in calendar, false);
  await assert.rejects(
    fetchGithubCalendar('example', 'secret', 2026, {
      fetcher: async () =>
        Response.json({
          year: 2026,
          title: '',
          visible: true,
          days: [{ date: '2026-02-30', count: 2 }],
        }),
    }),
  );
});

test('university search keeps source links and explicit pagination', async () => {
  const result = await searchUniversities('Example', 2, {
    fetcher: async () =>
      Response.json({
        items: [
          {
            name: 'Example',
            image: 'https://universitylogos.top/uni_logo/example.png',
            url: 'https://universitylogos.top/?q=Example',
          },
        ],
        page: 2,
        hasMore: false,
        source: 'https://universitylogos.top',
      }),
  });
  assert.equal(result.page, 2);
  assert.equal(result.items[0].name, 'Example');
  assert.equal(result.hasMore, false);
});

test('university client reports malformed pages and removes credential-bearing source links', async () => {
  await assert.rejects(
    searchUniversities('Example', 1, { fetcher: async () => Response.json(null) }),
    /校徽来源/,
  );
  const result = await searchUniversities('Example', 1, {
    fetcher: async () =>
      Response.json({
        items: [
          {
            name: 'Example',
            image: 'https://user:pass@universitylogos.top/uni_logo/example.png',
            url: 'https://universitylogos.top/',
          },
        ],
        page: 1,
        hasMore: false,
        source: 'https://universitylogos.top',
      }),
  });
  assert.deepEqual(result.items, []);
});
