import { RemoteError, requestPublic, isPublicAddress } from './assetRemote.mjs';
export { isPublicAddress };

const schoolOrigin = 'https://universitylogos.top';
const response = (value, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => (typeof value === 'string' ? value.trim().slice(0, 200) : '');

function parseJSON(remote) {
  if (remote.status < 200 || remote.status >= 300)
    throw new RemoteError('Remote service is unavailable.');
  try {
    return JSON.parse(remote.bytes.toString('utf8'));
  } catch {
    throw new RemoteError('Remote service returned invalid data.');
  }
}

function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  return '';
}

export function createAssetsHandler({
  universitiesUrl = `${schoolOrigin}/superone/uni_logos`,
  githubUrl = 'https://api.github.com/graphql',
} = {}) {
  return async function handleAssetsRequest({
    path,
    body,
    method = 'POST',
    signal,
    allowLocalProviders = false,
  }) {
    if (!['/api/assets/image', '/api/assets/universities', '/api/assets/github'].includes(path))
      return null;
    if (method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
    body = object(body);
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000);
    const options = { signal: requestSignal, allowLocalProviders };
    try {
      if (path === '/api/assets/image') {
        if (typeof body.url !== 'string') throw new RemoteError('Invalid remote URL.', 400);
        const remote = await requestPublic(body.url, {
          ...options,
          headers: { Accept: 'image/png,image/jpeg,image/webp,image/svg+xml' },
        });
        if (
          remote.status === 200 &&
          /^image\/svg\+xml(?:;|$)/i.test(String(remote.headers['content-type'] || ''))
        ) {
          const { rasterizeSvg } = await import('./raster.mjs');
          const image = await rasterizeSvg(remote.bytes, requestSignal);
          return new Response(new Uint8Array(image), {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }
        const type = imageType(remote.bytes);
        if (
          remote.status !== 200 ||
          !type ||
          !String(remote.headers['content-type'] || '')
            .toLowerCase()
            .startsWith(type)
        )
          throw new RemoteError('Remote image must be JPG, PNG or WebP.');
        return new Response(new Uint8Array(remote.bytes), {
          headers: {
            'Content-Type': type,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      if (path === '/api/assets/universities') {
        const query =
          typeof body.query === 'string'
            ? body.query.normalize('NFKC').trim().replace(/\s+/g, ' ')
            : '';
        const page = body.page ?? 1;
        if (
          query.length < 2 ||
          query.length > 100 ||
          !Number.isSafeInteger(page) ||
          page < 1 ||
          page > 10000
        )
          throw new RemoteError('Enter a university name with 2–100 characters.', 400);
        const pageSize = 20;
        const remote = await requestPublic(universitiesUrl, {
          ...options,
          maxBytes: 256 * 1024,
          method: 'POST',
          redirects: 0,
          headers: {
            'Content-Type': 'application/json',
            Origin: schoolOrigin,
            Referer: `${schoolOrigin}/`,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            input_text: query,
            page_now: page,
            total_page: ['搜索校徽'],
            page_size: pageSize,
            timestp: Date.now(),
            sec: query.length * 99 + pageSize * 99 * 50 * 68,
          }),
        });
        const data = object(parseJSON(remote));
        if (
          !Array.isArray(data.result_list) ||
          !Array.isArray(data.total_page) ||
          data.total_page.length > 10000
        )
          throw new RemoteError('University source returned invalid data.');
        const seen = new Set();
        const items = data.result_list.slice(0, pageSize).flatMap((raw) => {
          const item = object(raw);
          const name = text(item.zh_name) || text(item.en_name);
          const imagePath = text(item.dir).replace(/\\/g, '/').replace(/^\/+/, '');
          if (
            !name ||
            !/^uni_logo\/[a-z0-9_./-]+\.(png|jpe?g|webp|svg)$/i.test(imagePath) ||
            imagePath.split('/').includes('..') ||
            seen.has(imagePath)
          )
            return [];
          seen.add(imagePath);
          return [
            {
              name,
              image: `${schoolOrigin}/${imagePath}`,
              url: `${schoolOrigin}/?${new URLSearchParams({ q: name })}`,
            },
          ];
        });
        return response({
          items,
          page,
          hasMore: page < data.total_page.length,
          source: schoolOrigin,
        });
      }
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      const year = body.year;
      if (
        !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username) ||
        !token ||
        token.length > 512 ||
        /[\r\n]/.test(token) ||
        !Number.isInteger(year) ||
        year < 1960 ||
        year > 2100
      )
        throw new RemoteError('Enter a valid GitHub username, token and year.', 400);
      const query =
        'query($username:String!,$from:DateTime!,$to:DateTime!){user(login:$username){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}';
      const remote = await requestPublic(githubUrl, {
        ...options,
        maxBytes: 256 * 1024,
        redirects: 0,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'LuckResume',
        },
        body: JSON.stringify({
          query,
          variables: { username, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
        }),
      });
      const data = object(parseJSON(remote));
      if (data.errors)
        throw new RemoteError(
          'GitHub could not fetch this calendar. Check the username and token.',
        );
      const weeks = data.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
      if (!Array.isArray(weeks) || weeks.length > 54)
        throw new RemoteError('GitHub returned no calendar data.');
      const seen = new Set();
      const days = [];
      for (const week of weeks) {
        if (!Array.isArray(week.contributionDays) || week.contributionDays.length > 7)
          throw new RemoteError('GitHub returned invalid calendar data.');
        for (const day of week.contributionDays) {
          const date = day.date;
          const count = day.contributionCount;
          if (
            typeof date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isInteger(count) ||
            count < 0 ||
            count > 1000000
          )
            throw new RemoteError('GitHub returned invalid calendar data.');
          const parsed = new Date(`${date}T00:00:00Z`);
          if (
            !Number.isFinite(parsed.getTime()) ||
            parsed.toISOString().slice(0, 10) !== date ||
            seen.has(date)
          )
            throw new RemoteError('GitHub returned invalid calendar data.');
          if (parsed.getUTCFullYear() !== year) continue;
          seen.add(date);
          days.push({ date, count });
        }
      }
      return response({
        title: `${username} · GitHub`,
        visible: true,
        year,
        days: days.sort((a, b) => a.date.localeCompare(b.date)),
      });
    } catch (error) {
      return response(
        {
          error:
            error instanceof RemoteError
              ? error.message
              : requestSignal.aborted
                ? 'Remote request timed out or was cancelled.'
                : 'Remote service is unavailable.',
        },
        error instanceof RemoteError ? error.status : requestSignal.aborted ? 504 : 502,
      );
    }
  };
}

export const handleAssetsRequest = createAssetsHandler();
