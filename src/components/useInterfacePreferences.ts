import { useEffect, useState } from 'react';
import { readInterfacePreferences, writeInterfacePreferences } from '../storage/interfacePrefs.ts';

export function useInterfacePreferences() {
  const [preferences, setPreferences] = useState(readInterfacePreferences);
  useEffect(() => writeInterfacePreferences(preferences), [preferences]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme =
        preferences.theme === 'system' ? (media.matches ? 'dark' : 'light') : preferences.theme;
      document.documentElement.dataset.theme = theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preferences.theme]);
  return { preferences, setPreferences };
}
