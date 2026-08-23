import type { Publication } from './model.ts';

export function publicationStatusName(
  status: Publication['status'],
  language: 'zh' | 'en' = 'zh',
): string {
  const names = {
    zh: {
      none: '',
      published: '已发表',
      accepted: '已接收',
      preprint: '预印本',
      submitted: '已投稿',
    },
    en: {
      none: '',
      published: 'Published',
      accepted: 'Accepted',
      preprint: 'Preprint',
      submitted: 'Submitted',
    },
  };
  return names[language][status];
}

export function splitAuthors(authors: string): string[] {
  const separator = /[;；\r\n]/.test(authors)
    ? /[;；\r\n]+/
    : /[，、]/.test(authors)
      ? /[，、]+/
      : /,+/;
  return authors
    .split(separator)
    .map((name) => name.trim())
    .filter(Boolean);
}

function authorMatchKey(name: string): string {
  return name
    .trim()
    .replace(/^[*†‡#\s]+|[*†‡#\s]+$/g, '')
    .trim()
    .toLowerCase();
}

export function authorSegments(
  authors: string,
  highlightedAuthor: string,
): { text: string; highlighted: boolean }[] {
  const highlightKey = authorMatchKey(highlightedAuthor);
  return splitAuthors(authors).flatMap((name, index) => [
    ...(index ? [{ text: '; ', highlighted: false }] : []),
    {
      text: name,
      highlighted: Boolean(highlightKey) && authorMatchKey(name) === highlightKey,
    },
  ]);
}

export function publicationCitationLabel(
  publication: Pick<Publication, 'authors' | 'citationStyle'>,
  index: number,
  date = '',
): string {
  if (publication.citationStyle === 'numbered') return `[${index + 1}]`;
  if (publication.citationStyle !== 'author-year') return '';
  const authors = splitAuthors(publication.authors);
  if (!authors.length) return '';
  const year = date.match(/\b(?:19|20)\d{2}\b/)?.[0];
  return `(${authors[0]}${authors.length > 1 ? ' et al.' : ''}${year ? `, ${year}` : ''})`;
}
