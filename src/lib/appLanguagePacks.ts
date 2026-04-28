import { APP_LANGUAGE_OPTIONS } from '@/lib/appLanguages';

export async function ensureAppLanguagePackDirectory() {
  return null;
}

export async function refreshInstalledAppLanguagePacks() {
  return null;
}

export async function ensureAppLanguagePackLoaded() {
  return null;
}

export function getLoadedAppLanguagePack() {
  return null;
}

export function getAppLanguagePackRevision() {
  return 0;
}

export function subscribeToAppLanguagePackChanges() {
  return () => undefined;
}

export function useAvailableAppLanguages() {
  return APP_LANGUAGE_OPTIONS;
}
