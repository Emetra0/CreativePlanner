import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resolveAppLanguage } from '@/lib/appLanguages';
import type { AppLanguageCode } from '@/lib/appLanguages';
import { SOURCE_CONTROLLED_LOCALE_CODES } from '@/lib/appLocaleResources';
import { EN_MESSAGES, TRANSLATIONS, resolveMessages } from '@/lib/appTranslations';

const resources = Object.fromEntries(
  Array.from(new Set(['en', ...SOURCE_CONTROLLED_LOCALE_CODES, ...Object.keys(TRANSLATIONS)])).map((language) => [language, { translation: resolveMessages(language) }]),
);

if (!i18n.isInitialized) {
  void i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      keySeparator: false,
      nsSeparator: false,
      react: {
        useSuspense: false,
      },
      returnNull: false,
      defaultNS: 'translation',
      missingKeyHandler: undefined,
    });
}

export async function setAppI18nLanguage(language: AppLanguageCode) {
  const resolvedLanguage = resolveAppLanguage(language);
  const resourceLanguage = resolvedLanguage.startsWith('en') ? 'en' : resolvedLanguage;
  const baseLanguage = resolvedLanguage.split('-')[0];

  i18n.addResourceBundle(resourceLanguage, 'translation', resolveMessages(resolvedLanguage), true, true);
  if (baseLanguage && baseLanguage !== resourceLanguage) {
    i18n.addResourceBundle(baseLanguage, 'translation', resolveMessages(baseLanguage), true, true);
  }

  const supportedLanguage = i18n.hasResourceBundle(resourceLanguage, 'translation')
    ? resourceLanguage
    : i18n.hasResourceBundle(baseLanguage, 'translation')
      ? baseLanguage
      : 'en';

  if (i18n.language !== supportedLanguage) {
    void i18n.changeLanguage(supportedLanguage);
  }

  return supportedLanguage;
}

export function getDefaultTranslation(key: keyof typeof EN_MESSAGES) {
  return EN_MESSAGES[key];
}

export default i18n;