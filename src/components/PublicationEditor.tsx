import { useI18n, t } from '../i18n';
import { useId } from 'react';
import type { Publication, ResumeEntry } from '../resume/model.ts';
import {
  authorSegments,
  publicationCitationLabel,
  publicationStatusName,
  splitAuthors,
} from '../resume/publications.ts';
import { Field } from './ui';

const emptyPublication: Publication = {
  authors: '',
  highlightedAuthor: '',
  venue: '',
  status: 'none',
  citationStyle: 'plain',
};
const statuses: Record<Publication['status'], string> = {
  none: '不显示状态',
  published: '已发表',
  accepted: '已接收',
  preprint: '预印本',
  submitted: '已投稿',
};

export default function PublicationEditor({
  entry,
  index,
  patch,
}: {
  entry: ResumeEntry;
  index: number;
  patch: <K extends keyof ResumeEntry>(key: K, value: ResumeEntry[K]) => void;
}) {
  useI18n();
  const authorInput = useId();
  const authorChoices = useId();
  const publication = entry.publication ?? emptyPublication;
  const change = <K extends keyof Publication>(key: K, value: Publication[K]) =>
    patch('publication', { ...publication, [key]: value });
  return (
    <details className="entry-options publication-editor">
      <summary>{t('论文作者与引用格式')}</summary>
      <label className="check-field">
        <input
          type="checkbox"
          checked={!entry.hiddenFields?.includes('publication')}
          onChange={(event) =>
            patch(
              'hiddenFields',
              event.target.checked
                ? (entry.hiddenFields ?? []).filter((field) => field !== 'publication')
                : [...new Set([...(entry.hiddenFields ?? []), 'publication'])],
            )
          }
        />
        {t('显示论文信息')}
      </label>
      <div className="field">
        <label htmlFor={authorInput}>{t('作者列表')}</label>
        <textarea
          id={authorInput}
          value={publication.authors}
          rows={3}
          maxLength={10000}
          placeholder={t('用分号或换行分隔作者，如 Doe, Jane; 张三')}
          onChange={(event) => change('authors', event.target.value)}
        />
        <span className="field-hint">{t('每位作者用分号或换行分隔，姓名内的逗号会保留。')}</span>
      </div>
      <Field
        label={t('加粗作者')}
        value={publication.highlightedAuthor}
        maxLength={300}
        list={authorChoices}
        placeholder={t('选择或输入需要加粗的完整姓名')}
        onChange={(event) => change('highlightedAuthor', event.target.value)}
      />
      <datalist id={authorChoices}>
        {[...new Set(splitAuthors(publication.authors))].map((author) => (
          <option key={author} value={author} />
        ))}
      </datalist>
      <Field
        label={t('期刊 / 会议')}
        value={publication.venue}
        maxLength={500}
        onChange={(event) => change('venue', event.target.value)}
      />
      <div className="form-grid">
        <label className="field">
          <span>{t('发表状态')}</span>
          <select
            aria-label={t('发表状态')}
            value={publication.status}
            onChange={(event) => change('status', event.target.value as Publication['status'])}
          >
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('引用格式')}</span>
          <select
            aria-label={t('引用格式')}
            value={publication.citationStyle}
            onChange={(event) =>
              change('citationStyle', event.target.value as Publication['citationStyle'])
            }
          >
            <option value="plain">{t('普通列表')}</option>
            <option value="numbered">{t('编号引用')}</option>
            <option value="author-year">{t('作者与年份')}</option>
          </select>
        </label>
      </div>
      <div className="publication-preview" aria-label={t('论文格式预览')}>
        <span className="field-hint">{t('格式预览')}</span>
        <p>
          {publicationCitationLabel(publication, index, entry.startDate)}{' '}
          {entry.title || t('论文标题')}
        </p>
        <p>
          {authorSegments(publication.authors, publication.highlightedAuthor).map(
            (segment, segmentIndex) =>
              segment.highlighted ? (
                <strong key={segmentIndex}>{segment.text}</strong>
              ) : (
                <span key={segmentIndex}>{segment.text}</span>
              ),
          )}
        </p>
        <p>
          {[publication.venue, t(publicationStatusName(publication.status))]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </details>
  );
}
