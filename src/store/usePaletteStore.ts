import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PaletteHarmony =
  | 'analogous'
  | 'complementary'
  | 'triadic'
  | 'split-complementary'
  | 'monochromatic'
  | 'tetradic';

export interface StoredPalette {
  id: string;
  harmony: PaletteHarmony;
  colors: string[];
  name?: string;
}

interface PaletteState {
  palettes: StoredPalette[];
  addPalette: (p: StoredPalette) => void;
  removePalette: (id: string) => void;
}

export const usePaletteStore = create<PaletteState>()(
  persist(
    (set) => ({
      palettes: [],
      addPalette: (p) => set((s) => ({ palettes: [p, ...s.palettes] })),
      removePalette: (id) => set((s) => ({ palettes: s.palettes.filter((p) => p.id !== id) })),
    }),
    { name: 'creative-planner-palettes' },
  ),
);
