import { useI18n, t, errorText } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { ResumeEntry } from '../resume/model.ts';
import { resizeDimensions } from '../resume/dimensions.ts';
import { fetchRemoteImage, searchUniversities, type UniversityPage } from '../resume/media.ts';
import {
  listLogoAssets,
  removeLogoAsset,
  saveLogoAsset,
  validateLogoAsset,
  type LogoAsset,
} from '../storage/logoAssets.ts';
import { Button, Field } from './ui';
import ImageAcquisition from './ImageAcquisition';
import './entryControls.css';

export interface LogoDimensions {
  width: number;
  height: number;
  ratio?: number;
}

export default function LogoEditor({
  entry,
  patch,
  onLogo,
  onDimensions,
  contextKey,
}: {
  entry: ResumeEntry;
  patch: <K extends keyof ResumeEntry>(key: K, value: ResumeEntry[K]) => void;
  onLogo: (image: string) => void;
  onDimensions?: (dimensions: LogoDimensions) => void;
  contextKey?: string | null;
}) {
  useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assets, setAssets] = useState<LogoAsset[]>([]);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [results, setResults] = useState<UniversityPage | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [lastSearch, setLastSearch] = useState({ query: '', page: 1 });
  const pending = useRef(false);
  const generation = useRef(0);
  const searchRequest = useRef<AbortController | null>(null);
  const refresh = async () => setAssets(await listLogoAssets());
  const dimensions = {
    width: entry.logoWidth ?? entry.logoSize ?? 40,
    height: entry.logoHeight ?? entry.logoSize ?? 40,
  };
  useEffect(() => {
    generation.current += 1;
    pending.current = false;
    setBusy(false);
    setError('');
    setResults(null);
    setSearchError('');
    setSearchBusy(false);
    setSchoolQuery('');
    return () => {
      generation.current += 1;
      searchRequest.current?.abort();
    };
  }, [contextKey, entry.id]);
  const perform = async (action: () => Promise<void>) => {
    if (pending.current) return;
    const version = generation.current;
    pending.current = true;
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      if (version === generation.current) setError(errorText(failure));
    } finally {
      if (version === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  const changeDimensions = (next: LogoDimensions) => {
    if (onDimensions) onDimensions(next);
    else {
      patch('logoWidth', next.width);
      patch('logoHeight', next.height);
      patch('logoRatio', next.ratio);
    }
  };
  const resize = (axis: 'width' | 'height', value: number) =>
    changeDimensions({
      ...resizeDimensions(dimensions, axis, value, entry.logoRatio, {
        minWidth: 8,
        maxWidth: 200,
        minHeight: 8,
        maxHeight: 200,
      }),
      ratio: entry.logoRatio,
    });
  const search = async (query: string, page: number) => {
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    const version = generation.current;
    setLastSearch({ query, page });
    setSearchBusy(true);
    setSearchError('');
    try {
      const response = await searchUniversities(query, page, { signal: controller.signal });
      if (!controller.signal.aborted && version === generation.current) setResults(response);
    } catch (failure) {
      if (!controller.signal.aborted && version === generation.current)
        setSearchError(errorText(failure));
    } finally {
      if (!controller.signal.aborted && version === generation.current) setSearchBusy(false);
    }
  };
  return (
    <details className="entry-options logo-editor">
      <summary>{t('公司 / 学校标识')}</summary>
      {entry.logo && (
        <div className="logo-editor-preview">
          <img
            src={entry.logo}
            alt={t('当前条目标识')}
            style={{
              ...dimensions,
              borderRadius: entry.logoRadius ?? 0,
              objectFit: entry.logoFit ?? 'contain',
            }}
          />
        </div>
      )}
      <ImageAcquisition
        label={t('上传标识')}
        contextKey={contextKey ?? entry.id}
        disabled={busy || searchBusy}
        onImages={(images) => {
          if (images[0]) onLogo(images[0].data);
        }}
      />
      {entry.logo && (
        <>
          <Button disabled={busy} onClick={() => patch('logo', '')}>
            {t('移除标识')}
          </Button>
          <label className="check-field">
            <input
              type="checkbox"
              checked={entry.logoVisible !== false && !entry.hiddenFields?.includes('logo')}
              onChange={(event) => {
                patch('logoVisible', event.target.checked);
                if (event.target.checked && entry.hiddenFields?.includes('logo'))
                  patch(
                    'hiddenFields',
                    entry.hiddenFields.filter((field) => field !== 'logo'),
                  );
              }}
            />
            {t('显示标识')}
          </label>
          <label className="field">
            <span>
              {t('标识尺寸')} {entry.logoSize ?? 40} px
            </span>
            <input
              aria-label={t('标识尺寸')}
              type="range"
              min={20}
              max={96}
              value={entry.logoSize ?? 40}
              onChange={(event) => {
                const size = Number(event.target.value);
                patch('logoSize', size);
                if (entry.logoWidth !== undefined || entry.logoHeight !== undefined)
                  changeDimensions({
                    width: size,
                    height: size,
                    ratio: entry.logoRatio ? 1 : undefined,
                  });
              }}
            />
          </label>
          <div className="form-grid">
            <Field
              label={t('标识宽度')}
              type="number"
              min={8}
              max={200}
              step={1}
              value={dimensions.width}
              onChange={(event) => {
                if (event.target.value) resize('width', Number(event.target.value));
              }}
            />
            <Field
              label={t('标识高度')}
              type="number"
              min={8}
              max={200}
              step={1}
              value={dimensions.height}
              onChange={(event) => {
                if (event.target.value) resize('height', Number(event.target.value));
              }}
            />
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={entry.logoRatio !== undefined}
              onChange={(event) =>
                changeDimensions({
                  ...dimensions,
                  ratio: event.target.checked ? dimensions.width / dimensions.height : undefined,
                })
              }
            />
            {t('锁定标识比例')}
          </label>
          <label className="field">
            <span>
              {t('标识圆角')} {entry.logoRadius ?? 0} px
            </span>
            <input
              aria-label={t('标识圆角')}
              type="range"
              min={0}
              max={48}
              value={entry.logoRadius ?? 0}
              onChange={(event) => patch('logoRadius', Number(event.target.value))}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>{t('标识位置')}</span>
              <select
                aria-label={t('标识位置')}
                value={entry.logoPosition ?? 'left'}
                onChange={(event) => patch('logoPosition', event.target.value as 'left' | 'right')}
              >
                <option value="left">{t('左侧')}</option>
                <option value="right">{t('右侧')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('标识适配')}</span>
              <select
                aria-label={t('标识适配')}
                value={entry.logoFit ?? 'contain'}
                onChange={(event) => patch('logoFit', event.target.value as 'contain' | 'cover')}
              >
                <option value="contain">{t('完整显示')}</option>
                <option value="cover">{t('填满裁切')}</option>
              </select>
            </label>
          </div>
        </>
      )}
      <details className="university-search">
        <summary>{t('在线搜索学校标识')}</summary>
        <Field
          label={t('学校名称')}
          type="search"
          value={schoolQuery}
          minLength={2}
          maxLength={100}
          onChange={(event) => {
            searchRequest.current?.abort();
            setSearchBusy(false);
            setSchoolQuery(event.target.value);
            setResults(null);
            setSearchError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && schoolQuery.trim().length >= 2 && !busy && !searchBusy)
              void search(schoolQuery.trim(), 1);
          }}
        />
        <Button
          disabled={busy || searchBusy || schoolQuery.trim().length < 2}
          onClick={() => void search(schoolQuery.trim(), 1)}
        >
          {t('搜索学校')}
        </Button>
        <p className="field-hint">
          {t('校徽来源：')}{' '}
          <a href="https://universitylogos.top" target="_blank" rel="noreferrer">
            universitylogos.top
          </a>
        </p>
        {searchBusy && (
          <p role="status" className="field-hint">
            {t('正在搜索学校…')}
          </p>
        )}
        {searchError && (
          <div>
            <p className="inline-error" role="alert">
              {searchError}
            </p>
            <Button
              disabled={searchBusy || busy}
              onClick={() => void search(lastSearch.query, lastSearch.page)}
            >
              {t('重试搜索')}
            </Button>
          </div>
        )}
        {results && (
          <>
            <div className="logo-search-results">
              {results.items.map((item) => (
                <div className="logo-search-result" key={item.image}>
                  <span>{item.name}</span>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {t('查看来源')}
                  </a>
                  <Button
                    disabled={busy || searchBusy}
                    onClick={() => {
                      const apply = onLogo;
                      void perform(async () => apply(await fetchRemoteImage(item.image)));
                    }}
                  >
                    {t('使用校徽')}
                  </Button>
                </div>
              ))}
            </div>
            {!results.items.length && <p className="field-hint">{t('没有匹配的学校。')}</p>}
            <div className="field-checks">
              <Button
                disabled={busy || searchBusy || results.page <= 1}
                onClick={() => void search(lastSearch.query, results.page - 1)}
              >
                {t('上一页')}
              </Button>
              <span>{t('第 {page} 页', { page: results.page })}</span>
              <Button
                disabled={busy || searchBusy || !results.hasMore}
                onClick={() => void search(lastSearch.query, results.page + 1)}
              >
                {t('下一页')}
              </Button>
            </div>
          </>
        )}
      </details>
      <details
        className="logo-library"
        onToggle={(event) => {
          if (event.currentTarget.open) void perform(refresh);
        }}
      >
        <summary>{t('本地标识素材库')}</summary>
        {entry.logo && (
          <>
            <Field
              label={t('素材名称')}
              value={name}
              maxLength={100}
              placeholder={t('例如：公司名称')}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              disabled={busy || !name.trim()}
              onClick={() => {
                const image = entry.logo!;
                const assetName = name;
                void perform(async () => {
                  await saveLogoAsset(assetName, image);
                  await refresh();
                  setName('');
                });
              }}
            >
              {t('保存当前标识')}
            </Button>
          </>
        )}
        <Field
          label={t('搜索本地标识')}
          type="search"
          value={query}
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="logo-asset-list">
          {assets
            .filter((asset) =>
              asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
            )
            .map((asset) => (
              <div className="logo-asset-row" key={asset.id}>
                <img src={asset.image} alt="" width={32} height={32} />
                <span>{asset.name}</span>
                <Button
                  disabled={busy}
                  onClick={() => {
                    try {
                      onLogo(validateLogoAsset(asset).image);
                      setError('');
                    } catch (failure) {
                      setError(errorText(failure));
                    }
                  }}
                >
                  {t('使用')}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await removeLogoAsset(asset.id);
                      await refresh();
                    })
                  }
                >
                  {t('删除')}
                </Button>
              </div>
            ))}
        </div>
        {!assets.length && <p className="field-hint">{t('还没有保存的标识素材。')}</p>}
        {!!assets.length &&
          !assets.some((asset) =>
            asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
          ) && <p className="field-hint">{t('没有匹配的标识。')}</p>}
      </details>
      {error && (
        <p className="inline-error" role="alert">
          {errorText(error)}
        </p>
      )}
    </details>
  );
}
