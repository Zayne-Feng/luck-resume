import { useI18n, t } from '../i18n';
import { useId, useState } from 'react';
import {
  filterResumeIcons,
  iconCatalog,
  iconCategories,
  isResumeIcon,
  type ResumeIcon,
} from '../resume/icons.ts';
import FieldIcon from '../resume/FieldIcon.tsx';
import '../styles/icon-picker.css';

export default function IconPicker({
  value,
  onChange,
  label,
}: {
  value?: string;
  onChange: (value: ResumeIcon) => void;
  label: string;
}) {
  useI18n();
  const id = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const selected = isResumeIcon(value) ? value : 'none';
  const choices = filterResumeIcons(query, category);
  const current = iconCatalog.find((icon) => icon.id === selected)!;
  const currentVisible = choices.some((icon) => icon.id === selected);
  return (
    <div className="field icon-picker-field">
      <label htmlFor={id}>{label}</label>
      <div className="icon-picker">
        <FieldIcon name={value} />
        <select
          id={id}
          value={selected}
          onChange={(event) => {
            if (isResumeIcon(event.target.value)) onChange(event.target.value);
          }}
        >
          {!currentVisible && (
            <option value={current.id}>{t('{name}（当前图标）', { name: t(current.name) })}</option>
          )}
          {iconCategories.map((group) => (
            <optgroup label={t(group.name)} key={group.id}>
              {choices
                .filter((icon) => icon.category === group.id)
                .map((icon) => (
                  <option value={icon.id} key={icon.id}>
                    {t(icon.name)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <details className="icon-discovery">
        <summary>{t('查找图标')}</summary>
        <div className="icon-discovery-controls">
          <label htmlFor={`${id}-search`}>{t('搜索图标')}</label>
          <input
            id={`${id}-search`}
            type="search"
            aria-label={`${label} · ${t('搜索图标')}`}
            placeholder={t('输入名称或关键词')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <label htmlFor={`${id}-category`}>{t('图标分类')}</label>
          <select
            id={`${id}-category`}
            aria-label={`${label} · ${t('图标分类')}`}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">{t('全部图标')}</option>
            {iconCategories.map((group) => (
              <option value={group.id} key={group.id}>
                {t(group.name)}
              </option>
            ))}
          </select>
          <p className="field-hint" role="status">
            {choices.length
              ? t('找到 {count} 个图标，在上方列表中选择', { count: choices.length })
              : t('没有匹配的图标，请调整搜索或分类')}
          </p>
        </div>
      </details>
    </div>
  );
}
