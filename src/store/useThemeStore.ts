import { create } from 'zustand';

export interface Theme {
  id: string;
  title: string;
  description: string;
  color: string;
  createdAt: string;
}

interface ThemeState {
  themes: Theme[];
  setThemes: (themes: Theme[]) => void;
  addTheme: (theme: Theme) => void;
  updateTheme: (id: string, updates: Partial<Theme>) => void;
  removeTheme: (id: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  themes: [],
  setThemes: (themes) => set({ themes }),
  addTheme: (theme) => set((state) => ({ themes: [...state.themes, theme] })),
  updateTheme: (id, updates) => set((state) => ({
    themes: state.themes.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  })),
  removeTheme: (id) => set((state) => ({
    themes: state.themes.filter((t) => t.id !== id),
  })),
}));
