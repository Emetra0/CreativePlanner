import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  label: string;
  /** Hex color, e.g. '#6366f1' */
  color: string;
  /** True for built-in template tags */
  isTemplate: boolean;
}

// ─── Built-in template tags ────────────────────────────────────────────────────

export const TEMPLATE_TAGS: Tag[] = [
  { id: 'tpl-work',     label: 'Work',      color: '#6366f1', isTemplate: true },
  { id: 'tpl-personal', label: 'Personal',  color: '#ec4899', isTemplate: true },
  { id: 'tpl-urgent',   label: 'Urgent',    color: '#ef4444', isTemplate: true },
  { id: 'tpl-research', label: 'Research',  color: '#f59e0b', isTemplate: true },
  { id: 'tpl-design',   label: 'Design',    color: '#8b5cf6', isTemplate: true },
  { id: 'tpl-meeting',  label: 'Meeting',   color: '#06b6d4', isTemplate: true },
  { id: 'tpl-writing',  label: 'Writing',   color: '#10b981', isTemplate: true },
  { id: 'tpl-review',   label: 'Review',    color: '#f97316', isTemplate: true },
  { id: 'tpl-bug',      label: 'Bug Fix',   color: '#dc2626', isTemplate: true },
  { id: 'tpl-feature',  label: 'Feature',   color: '#0ea5e9', isTemplate: true },
];

/** Color palette for custom tag creation */
export const TAG_COLORS = [
  '#6366f1', '#ec4899', '#ef4444', '#f59e0b',
  '#8b5cf6', '#06b6d4', '#10b981', '#f97316',
  '#3b82f6', '#84cc16', '#dc2626', '#0ea5e9',
];

// ─── State Interface ──────────────────────────────────────────────────────────

interface TagState {
  tags: Tag[];
  /** Add a new custom tag; returns the new id */
  addTag: (label: string, color: string) => string;
  /** Permanently remove a tag from the library */
  deleteTag: (id: string) => void;
  /** Update label or color of an existing tag */
  updateTag: (id: string, updates: Partial<Pick<Tag, 'label' | 'color'>>) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTagStore = create<TagState>()(
  persist(
    (set) => ({
      tags: [...TEMPLATE_TAGS],

      addTag: (label, color) => {
        const id = Math.random().toString(36).substr(2, 9);
        set((s) => ({ tags: [...s.tags, { id, label, color, isTemplate: false }] }));
        return id;
      },

      deleteTag: (id) =>
        set((s) => ({ tags: s.tags.filter((t) => t.id !== id) })),

      updateTag: (id, updates) =>
        set((s) => ({ tags: s.tags.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),
    }),
    { name: 'tag-store-v1' }
  )
);
