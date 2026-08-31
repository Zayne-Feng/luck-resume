import { useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useI18n, t } from '../i18n';
import { openParentDetails } from './editorNavigation';

interface SettingMatch {
  label: string;
  group: string;
  element: HTMLElement;
}

function findSettings(root: HTMLElement, query: string): SettingMatch[] {
  const terms = query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const matches: SettingMatch[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(
    'input:not([type=file]):not([type=hidden]),select,button',
  )) {
    if (element.closest('[data-setting-search-ignore]') || element.matches(':disabled')) continue;
    const labels = 'labels' in element ? (element as HTMLInputElement).labels : null;
    const label = (
      element.getAttribute('aria-label') ||
      (labels?.length
        ? Array.from(labels, (node) => node.textContent).join(' ')
        : element.textContent) ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    const group =
      element.closest('fieldset')?.querySelector(':scope > legend')?.textContent?.trim() || '';
    if (
      label &&
      terms.every((term) =>
        `${label} ${group}`.normalize('NFKC').toLocaleLowerCase().includes(term),
      )
    )
      matches.push({ label, group, element });
    if (matches.length === 12) break;
  }
  return matches;
}

export default function SettingSearch() {
  useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SettingMatch[]>([]);
  return (
    <div className="setting-search" ref={ref} data-setting-search-ignore>
      <label>
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label={t('查找排版设置')}
          placeholder={t('查找字号、行高、照片等设置')}
          maxLength={80}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            const panel = ref.current?.closest<HTMLElement>('.appearance-panel');
            setMatches(panel ? findSettings(panel, event.target.value) : []);
          }}
        />
      </label>
      {query.trim() && (
        <div className="setting-search-results" aria-label={t('设置查找结果')}>
          {matches.length ? (
            matches.map((match, index) => (
              <button
                type="button"
                key={index}
                onClick={() => {
                  if (!match.element.isConnected) return;
                  openParentDetails(match.element);
                  match.element.scrollIntoView({ block: 'center', behavior: 'auto' });
                  match.element.focus({ preventScroll: true });
                }}
              >
                <span>{match.label}</span>
                {match.group && <small>{match.group}</small>}
              </button>
            ))
          ) : (
            <p role="status">{t('没有找到匹配设置，试试更短的关键词。')}</p>
          )}
        </div>
      )}
    </div>
  );
}
