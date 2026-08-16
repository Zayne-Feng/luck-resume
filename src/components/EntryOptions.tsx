import { useI18n, t } from '../i18n';
import type { ResumeEntry } from '../resume/model.ts';
import { Button, Field } from './ui';
import ImageAcquisition from './ImageAcquisition';

const names = {
  title: '标题',
  subtitle: '副标题',
  degree: '学历 / 学位',
  gpa: 'GPA',
  dates: '日期',
  location: '地点',
  link: '链接',
  description: '描述',
  image: '图片',
};
export default function EntryOptions({
  entry,
  patch,
  onImage,
  contextKey,
  education = false,
}: {
  entry: ResumeEntry;
  patch: <K extends keyof ResumeEntry>(key: K, value: ResumeEntry[K]) => void;
  onImage: (image: string) => void;
  contextKey?: string | null;
  education?: boolean;
}) {
  useI18n();
  return (
    <details className="entry-options">
      <summary>{t('字段名称、显示与配图')}</summary>
      <div className="entry-field-options">
        {Object.entries(names)
          .filter(([key]) => education || !['degree', 'gpa'].includes(key))
          .map(([key, label]) => (
            <div key={key} className="builtin-field-option">
              <label>
                <input
                  type="checkbox"
                  checked={!entry.hiddenFields?.includes(key)}
                  onChange={(event) =>
                    patch(
                      'hiddenFields',
                      event.target.checked
                        ? (entry.hiddenFields ?? []).filter((id) => id !== key)
                        : [...new Set([...(entry.hiddenFields ?? []), key])],
                    )
                  }
                />
                {t('显示{name}', { name: t(label) })}
              </label>
              {['title', 'subtitle', 'degree', 'gpa'].includes(key) && (
                <Field
                  label={t('{name}字段名称', { name: t(label) })}
                  value={entry.fieldLabels?.[key] ?? ''}
                  maxLength={100}
                  placeholder={t(label)}
                  onChange={(event) =>
                    patch('fieldLabels', { ...entry.fieldLabels, [key]: event.target.value })
                  }
                />
              )}
            </div>
          ))}
      </div>
      {entry.image && (
        <img className="entry-image-thumbnail" src={entry.image} alt={t('条目配图')} />
      )}
      <ImageAcquisition
        label={t('添加 / 更换配图')}
        contextKey={contextKey}
        onImages={(images) => {
          if (images[0]) onImage(images[0].data);
        }}
      />
      {entry.image && <Button onClick={() => patch('image', '')}>{t('移除配图')}</Button>}
      {entry.image && (
        <label className="field">
          <span>{t('配图对齐')}</span>
          <select
            aria-label={t('配图对齐')}
            value={entry.imageAlign ?? 'left'}
            onChange={(event) =>
              patch('imageAlign', event.target.value as ResumeEntry['imageAlign'])
            }
          >
            <option value="left">{t('靠左')}</option>
            <option value="center">{t('居中')}</option>
            <option value="right">{t('靠右')}</option>
          </select>
        </label>
      )}
      {entry.image && (
        <label className="field">
          <span>
            {t('配图宽度')}
            {entry.imageWidth ?? 100}%
          </span>
          <input
            aria-label={t('配图宽度')}
            type="range"
            min={5}
            max={100}
            value={entry.imageWidth ?? 100}
            onChange={(event) => patch('imageWidth', Number(event.target.value))}
          />
        </label>
      )}
    </details>
  );
}
