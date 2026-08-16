import { useEffect, useState } from 'react';
import { useI18n, t } from '../i18n';
import { normalizeBirthDate } from '../resume/dates.ts';
import { Field } from './ui';

export default function BirthDateField({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
}) {
  useI18n();
  const normalized = normalizeBirthDate(value) ?? '';
  const [precision, setPrecision] = useState<'month' | 'date'>(
    normalized.length === 7 ? 'month' : 'date',
  );
  const [draft, setDraft] = useState(normalized);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (normalized) setPrecision(normalized.length === 7 ? 'month' : 'date');
    setDraft(normalized);
    setInvalid(false);
  }, [normalized]);
  const needsDay = precision === 'date' && normalized.length === 7;
  const readDraft = (value: string) => {
    const date = normalizeBirthDate(value);
    return date === '' || date?.length === (precision === 'month' ? 7 : 10) ? date : undefined;
  };
  return (
    <div className="birth-date-field">
      <label className="field">
        <span>{t('出生日期精度')}</span>
        <select
          aria-label={t('出生日期精度')}
          value={precision}
          onChange={(event) => {
            const next = event.target.value as 'month' | 'date';
            setPrecision(next);
            setInvalid(false);
            const nextValue =
              next === 'month'
                ? normalized.slice(0, 7)
                : normalized.length === 10
                  ? normalized
                  : '';
            setDraft(nextValue);
            if (next === 'month' && normalized.length === 10) onChange(nextValue);
          }}
        >
          <option value="month">{t('仅年月')}</option>
          <option value="date">{t('年月日')}</option>
        </select>
      </label>
      <Field
        label={t('出生日期')}
        name={name}
        type={precision}
        maxLength={10}
        placeholder={precision === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'}
        max={precision === 'month' ? '9999-12' : '9999-12-31'}
        value={draft}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          setInvalid(false);
          const date = readDraft(next);
          if (date !== undefined) onChange(date);
        }}
        onBlur={() => setInvalid(readDraft(draft) === undefined)}
        hint={
          invalid
            ? t('请输入有效的出生年月或日期。')
            : needsDay
              ? t('已保留出生年月，请选择日期以补充日。')
              : undefined
        }
      />
    </div>
  );
}
