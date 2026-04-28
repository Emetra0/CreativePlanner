import { useEffect } from 'react';
import { resolveAppLanguage, resolveAppLanguageDirection } from '@/lib/appLanguages';
import { setAppI18nLanguage } from '@/lib/i18n';
import { useSettingsStore } from '@/store/useSettingsStore';

export default function AppLanguageManager() {
  const appLanguage = useSettingsStore((state) => state.appLanguage);

  useEffect(() => {
    const resolvedLanguage = resolveAppLanguage(appLanguage);
    void setAppI18nLanguage(appLanguage).then(() => {
      document.documentElement.lang = resolvedLanguage;
      document.documentElement.dir = resolveAppLanguageDirection(resolvedLanguage);
    });
  }, [appLanguage]);

  return null;
}