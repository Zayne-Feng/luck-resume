import { readResumeImage } from './images.ts';
import { validateContributionCalendar } from './contributions.ts';
import type { ContributionCalendar } from './model.ts';

export interface AcquiredImage {
  name: string;
  data: string;
}
export interface UniversityLogo {
  name: string;
  image: string;
  url: string;
}
export interface UniversityPage {
  items: UniversityLogo[];
  page: number;
  hasMore: boolean;
  source: string;
}
interface RequestOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

async function post(
  path: string,
  body: unknown,
  { signal, fetcher = fetch }: RequestOptions = {},
): Promise<Response> {
  const response = await fetcher(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    let message = '远程服务暂时不可用，请重试。';
    try {
      const data = await response.json();
      if (typeof data.error === 'string') message = data.error;
    } catch {
      /* The service may return an empty error response. */
    }
    throw new Error(message);
  }
  return response;
}

export async function readImageBatch(
  files: File[],
  reader = readResumeImage,
): Promise<AcquiredImage[]> {
  if (files.length > 20) throw new Error('一次最多选择 20 张图片。');
  const images: AcquiredImage[] = [];
  for (const file of files)
    images.push({
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 100),
      data: await reader(file),
    });
  return images;
}

export function imageFilesFromClipboard(data: DataTransfer): File[] {
  return Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .flatMap((item) => {
      const file = item.getAsFile();
      return file ? [file] : [];
    });
}

export async function fetchRemoteImage(
  url: string,
  options: RequestOptions & { reader?: typeof readResumeImage } = {},
): Promise<string> {
  const normalized = url.trim();
  let remote: URL;
  try {
    remote = new URL(normalized);
  } catch {
    throw new Error('请输入有效的图片链接。');
  }
  if (!['http:', 'https:'].includes(remote.protocol) || remote.username || remote.password)
    throw new Error('请输入有效的图片链接。');
  const response = await post('/api/assets/image', { url: normalized }, options);
  const blob = await response.blob();
  return (options.reader ?? readResumeImage)(new File([blob], 'remote-image', { type: blob.type }));
}

export async function searchUniversities(
  query: string,
  page: number,
  options: RequestOptions = {},
): Promise<UniversityPage> {
  const response = await post('/api/assets/universities', { query, page }, options);
  const result = await response.json();
  if (
    !result ||
    !Array.isArray(result.items) ||
    result.items.length > 20 ||
    result.page !== page ||
    typeof result.hasMore !== 'boolean' ||
    result.source !== 'https://universitylogos.top'
  )
    throw new Error('校徽来源返回的数据无效，请重试。');
  const safeUrl = (value: unknown) => {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return url.origin === 'https://universitylogos.top' && !url.username && !url.password;
    } catch {
      return false;
    }
  };
  return {
    page,
    hasMore: result.hasMore,
    source: result.source,
    items: result.items.filter(
      (item: UniversityLogo) =>
        typeof item?.name === 'string' && safeUrl(item.image) && safeUrl(item.url),
    ),
  };
}

export async function fetchGithubCalendar(
  username: string,
  token: string,
  year: number,
  options: RequestOptions = {},
): Promise<ContributionCalendar> {
  const response = await post('/api/assets/github', { username, token, year }, options);
  const calendar = validateContributionCalendar(await response.json());
  if (calendar.year !== year) throw new Error('数据年份与所选年份不一致。');
  return calendar;
}
