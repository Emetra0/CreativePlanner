import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  BUILT_IN_FONT_PRESETS,
  type CustomFontDefinition,
  type WordExportOptions,
  DEFAULT_FONT_ID,
  DEFAULT_WORD_EXPORT_OPTIONS,
} from '@/lib/fontSettings';
import type { AppLanguageCode } from '@/lib/appLanguages';
import { defaultKeybinds, normalizeKeybindKey } from '@/lib/keybinds';

interface Keybinds {
  [key: string]: string;
}

interface SettingsState {
  projectPath: string;
  setProjectPath: (path: string) => void;
  cloudPath: string | null;
  setCloudPath: (path: string | null) => void;
  cloudWorkerUrl: string;
  setCloudWorkerUrl: (url: string) => void;
  collaboraUrl: string;
  setCollaboraUrl: (url: string) => void;
  autoSave: boolean;
  setAutoSave: (enabled: boolean) => void;
  appLanguage: AppLanguageCode;
  setAppLanguage: (language: AppLanguageCode) => void;
  appFontId: string;
  setAppFontId: (fontId: string) => void;
  customFonts: CustomFontDefinition[];
  addCustomFont: (font: CustomFontDefinition) => void;
  removeCustomFont: (fontId: string) => void;
  wordExportDefaults: WordExportOptions;
  setWordExportDefaults: (options: Partial<WordExportOptions>) => void;
  recentColors: string[];
  pushRecentColor: (color: string) => void;
  keybinds: Keybinds;
  setKeybind: (action: string, key: string) => void;
  resetKeybinds: () => void;
}

const MAX_RECENT_COLORS = 12;
const SAFE_WORD_EXPORT_FONT_IDS = new Set(BUILT_IN_FONT_PRESETS.map((font) => font.id));

function normalizeWordExportFontId(fontId?: string) {
  return fontId && SAFE_WORD_EXPORT_FONT_IDS.has(fontId) ? fontId : DEFAULT_FONT_ID;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      projectPath: '', // Default to empty to trigger auto-detection
      setProjectPath: (path) => set({ projectPath: path }),
      cloudPath: null,
      setCloudPath: (path) => set({ cloudPath: path }),
      cloudWorkerUrl: '',
      setCloudWorkerUrl: (url) => set({ cloudWorkerUrl: url.trim() }),
      collaboraUrl: '',
      setCollaboraUrl: (url) => set({ collaboraUrl: url.trim() }),
      autoSave: true,
      setAutoSave: (enabled) => set({ autoSave: enabled }),
      appLanguage: 'system',
      setAppLanguage: (language) => set({ appLanguage: language }),
      appFontId: DEFAULT_FONT_ID,
      setAppFontId: (fontId) => set({ appFontId: fontId }),
      customFonts: [],
      addCustomFont: (font) => set((state) => {
        const existing = state.customFonts.find((item) => item.id === font.id || item.cssFamily === font.cssFamily);
        return existing
          ? { customFonts: state.customFonts.map((item) => item.id === existing.id ? font : item) }
          : { customFonts: [...state.customFonts, font] };
      }),
      removeCustomFont: (fontId) => set((state) => ({
        customFonts: state.customFonts.filter((font) => font.id !== fontId),
        appFontId: state.appFontId === fontId ? DEFAULT_FONT_ID : state.appFontId,
        wordExportDefaults: state.wordExportDefaults.fontId === fontId
          ? { ...state.wordExportDefaults, fontId: DEFAULT_FONT_ID }
          : state.wordExportDefaults,
      })),
      wordExportDefaults: DEFAULT_WORD_EXPORT_OPTIONS,
      setWordExportDefaults: (options) => set((state) => {
        const nextWordExportDefaults = { ...state.wordExportDefaults, ...options };
        nextWordExportDefaults.fontId = normalizeWordExportFontId(nextWordExportDefaults.fontId);
        return {
          wordExportDefaults: nextWordExportDefaults,
        };
      }),
      recentColors: [],
      pushRecentColor: (color) => set((state) => {
        const normalized = color.trim().toLowerCase();
        if (!normalized) return state;
        return {
          recentColors: [normalized, ...state.recentColors.filter((item) => item !== normalized)].slice(0, MAX_RECENT_COLORS),
        };
      }),
      keybinds: { ...defaultKeybinds },
      setKeybind: (action, key) => set((state) => ({ keybinds: { ...state.keybinds, [action]: normalizeKeybindKey(key) } })),
      resetKeybinds: () => set({ keybinds: { ...defaultKeybinds } }),
    }),
    {
      name: 'creative-planner-settings-v4',
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<SettingsState> | undefined) ?? {};
        const persistedKeybinds = Object.fromEntries(
          Object.entries(persisted.keybinds ?? {}).map(([action, key]) => [action, normalizeKeybindKey(key)]),
        );
        const persistedWordExportDefaults = {
          ...DEFAULT_WORD_EXPORT_OPTIONS,
          ...(persisted.wordExportDefaults ?? {}),
        };
        persistedWordExportDefaults.fontId = normalizeWordExportFontId(persistedWordExportDefaults.fontId);

        return {
          ...currentState,
          ...persisted,
          cloudWorkerUrl: persisted.cloudWorkerUrl?.trim() ?? currentState.cloudWorkerUrl,
          collaboraUrl: persisted.collaboraUrl?.trim() ?? currentState.collaboraUrl,
          appLanguage: persisted.appLanguage ?? currentState.appLanguage,
          wordExportDefaults: persistedWordExportDefaults,
          keybinds: {
            ...defaultKeybinds,
            ...persistedKeybinds,
          },
        };
      },
    }
  )
);
