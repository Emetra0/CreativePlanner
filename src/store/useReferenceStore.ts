import { create } from 'zustand';

export interface Reference {
  id: string;
  type: 'bible' | 'note' | 'link';
  content: string;
  source?: string;
  tags: string[];
  createdAt: string;
}

interface ReferenceState {
  references: Reference[];
  setReferences: (references: Reference[]) => void;
  addReference: (reference: Reference) => void;
  updateReference: (id: string, updates: Partial<Reference>) => void;
  removeReference: (id: string) => void;
}

export const useReferenceStore = create<ReferenceState>((set) => ({
  references: [],
  setReferences: (references) => set({ references }),
  addReference: (reference) => set((state) => ({ references: [...state.references, reference] })),
  updateReference: (id, updates) => set((state) => ({
    references: state.references.map((r) => (r.id === id ? { ...r, ...updates } : r)),
  })),
  removeReference: (id) => set((state) => ({
    references: state.references.filter((r) => r.id !== id),
  })),
}));
