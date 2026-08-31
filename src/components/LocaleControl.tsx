import { Languages } from 'lucide-react';
import { useI18n } from '../i18n';

export default function LocaleControl() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="theme-control locale-control">
      <Languages size={16} aria-hidden="true" />
      <select
        aria-label={t('界面语言')}
        value={locale}
        onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'zh')}
      >
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
