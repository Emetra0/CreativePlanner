import enApp from '@/locales/en/app.json';
import enGlossary from '@/locales/en/glossary.json';
import nbApp from '@/locales/nb/app.json';
import nbGlossary from '@/locales/nb/glossary.json';
import { createNormalizedLocaleBundle, mergeNormalizedLocaleBundles, normalizeGlossaryFile, normalizeMessagesFile, type NormalizedAppLocaleBundle } from '@/lib/appLocaleSchema';

const EN_MESSAGES_FILE = normalizeMessagesFile(enApp);
const EN_GLOSSARY_FILE = normalizeGlossaryFile(enGlossary);
const NB_MESSAGES_FILE = normalizeMessagesFile(nbApp);
const NB_GLOSSARY_FILE = normalizeGlossaryFile(nbGlossary);

const SOURCE_CONTROLLED_LOCALES: Record<string, NormalizedAppLocaleBundle> = {
  en: createNormalizedLocaleBundle(EN_MESSAGES_FILE.meta, EN_MESSAGES_FILE.messages, EN_MESSAGES_FILE.messageMeta, EN_GLOSSARY_FILE.terms),
  nb: createNormalizedLocaleBundle(NB_MESSAGES_FILE.meta, NB_MESSAGES_FILE.messages, NB_MESSAGES_FILE.messageMeta, NB_GLOSSARY_FILE.terms),
};

export const SOURCE_CONTROLLED_LOCALE_CODES = Object.freeze(Object.keys(SOURCE_CONTROLLED_LOCALES));

export function resolveSourceControlledLocale(language: string) {
  const normalizedLanguage = language.trim() || 'en';
  const baseLanguage = normalizedLanguage.split('-')[0];

  let resolved = SOURCE_CONTROLLED_LOCALES.en;
  if (baseLanguage !== 'en' && SOURCE_CONTROLLED_LOCALES[baseLanguage]) {
    resolved = mergeNormalizedLocaleBundles(resolved, SOURCE_CONTROLLED_LOCALES[baseLanguage]);
  }
  if (normalizedLanguage !== baseLanguage && SOURCE_CONTROLLED_LOCALES[normalizedLanguage]) {
    resolved = mergeNormalizedLocaleBundles(resolved, SOURCE_CONTROLLED_LOCALES[normalizedLanguage]);
  }

  return resolved;
}

export function getSourceControlledMessages(language: string) {
  return resolveSourceControlledLocale(language).messages;
}

export function getSourceControlledMessageMeta(language: string) {
  return resolveSourceControlledLocale(language).messageMeta;
}

export function getSourceControlledGlossary(language: string) {
  return resolveSourceControlledLocale(language).glossary;
}

export function getSourceControlledLocaleMeta(language: string) {
  return resolveSourceControlledLocale(language).meta;
}