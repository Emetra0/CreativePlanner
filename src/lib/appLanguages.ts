export interface AppLanguageOption {
  value: string;
  label: string;
  builtIn?: boolean;
}

export const BUILT_IN_APP_LANGUAGE_OPTIONS: readonly AppLanguageOption[] = [
  { value: 'system', label: 'System' },
  { value: 'en', label: 'English' },
  { value: 'nb', label: 'Norsk Bokmål' },
] as const;

export const APP_LANGUAGE_OPTIONS = BUILT_IN_APP_LANGUAGE_OPTIONS.map((option) => ({
  ...option,
  builtIn: option.value !== 'system',
}));

export type AppLanguageCode = string;

const RTL_LANGUAGE_CODES = new Set(['ar', 'fa', 'he', 'ur']);

function normalizeSupportedLanguage(language: string) {
  const normalized = language.trim().toLowerCase();
  if (!normalized) return 'en';
  if (normalized === 'nb' || normalized.startsWith('nb-')) return 'nb';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return 'en';
}

export function resolveAppLanguage(language: AppLanguageCode) {
  if (language !== 'system') return normalizeSupportedLanguage(language);
  if (typeof navigator === 'undefined' || !navigator.language) return 'en';
  return normalizeSupportedLanguage(navigator.language);
}

export function resolveAppLanguageDirection(language: string) {
  const baseLanguage = language.split('-')[0].toLowerCase();
  return RTL_LANGUAGE_CODES.has(baseLanguage) ? 'rtl' : 'ltr';
}