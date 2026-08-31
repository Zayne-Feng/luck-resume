import { useI18n, t } from '../i18n';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { InterfaceTheme } from '../storage/interfacePrefs.ts';

export default function ThemeControl({
  value,
  onChange,
}: {
  value: InterfaceTheme;
  onChange: (theme: InterfaceTheme) => void;
}) {
  useI18n();
  const Icon = value === 'system' ? Monitor : value === 'dark' ? Moon : Sun;
  return (
    <label className="theme-control">
      <Icon size={16} aria-hidden="true" />
      <select
        aria-label={t('界面主题')}
        value={value}
        onChange={(event) => onChange(event.target.value as InterfaceTheme)}
      >
        <option value="system">{t('跟随系统')}</option>
        <option value="light">{t('浅色界面')}</option>
        <option value="dark">{t('深色界面')}</option>
      </select>
    </label>
  );
}
