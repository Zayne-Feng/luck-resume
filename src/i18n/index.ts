import { create } from 'zustand';
import { translate, translateError, type Locale, type MessageValues } from './translate.ts';

const localeKey = 'luck-interface-locale';
const initialLocale = (): Locale => {
  try {
    return localStorage.getItem(localeKey) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
};
const useLocale = create<{ locale: Locale; setLocale: (locale: Locale) => void }>((set) => ({
  locale: initialLocale(),
  setLocale: (locale) => {
    try {
      localStorage.setItem(localeKey, locale);
    } catch {
      /* Interface preferences remain available for this session. */
    }
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
    set({ locale });
  },
}));
if (typeof document !== 'undefined') {
  document.documentElement.lang = useLocale.getState().locale === 'en' ? 'en' : 'zh-CN';
}

export function t(message: string, values?: MessageValues): string {
  return translate(useLocale.getState().locale, message, values);
}

export function errorText(error: unknown): string {
  return translateError(useLocale.getState().locale, error);
}

export function useI18n() {
  const state = useLocale();
  return { ...state, t, errorText };
}
