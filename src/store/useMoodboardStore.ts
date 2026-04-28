import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MoodboardItemType = 'image' | 'link' | 'note';

export interface MoodboardItem {
  id: string;
  type: MoodboardItemType;
  /** URL for image or link types */
  url?: string;
  title: string;
  description?: string;
  /** Personal annotation — the story/thought behind the image */
  comment?: string;
  tags: string[];
  addedAt: string;
}

export interface MoodBoard {
  id: string;
  name: string;
  description?: string;
  /** Optional link to a Mindmap document ID */
  projectId?: string;
  items: MoodboardItem[];
  createdAt: string;
  updatedAt: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface MoodboardState {
  boards: MoodBoard[];

  // Board CRUD
  createBoard: (name: string, description?: string, projectId?: string) => string;
  updateBoard: (id: string, patch: Partial<Pick<MoodBoard, 'name' | 'description' | 'projectId'>>) => void;
  deleteBoard: (id: string) => void;

  // Item CRUD
  addItem: (boardId: string, item: Omit<MoodboardItem, 'id' | 'addedAt'>) => void;
  updateItem: (boardId: string, itemId: string, patch: Partial<Omit<MoodboardItem, 'id' | 'addedAt'>>) => void;
  deleteItem: (boardId: string, itemId: string) => void;
}

export const useMoodboardStore = create<MoodboardState>()(
  persist(
    (set) => ({
      boards: [],

      createBoard: (name, description, projectId) => {
        const id = `board-${Date.now()}`;
        const now = new Date().toISOString();
        set((s) => ({
          boards: [
            ...s.boards,
            { id, name, description, projectId, items: [], createdAt: now, updatedAt: now },
          ],
        }));
        return id;
      },

      updateBoard: (id, patch) => {
        set((s) => ({
          boards: s.boards.map((b) =>
            b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b
          ),
        }));
      },

      deleteBoard: (id) => {
        set((s) => ({ boards: s.boards.filter((b) => b.id !== id) }));
      },

      addItem: (boardId, item) => {
        const newItem: MoodboardItem = {
          ...item,
          id: `item-${Date.now()}`,
          addedAt: new Date().toISOString(),
        };
        set((s) => ({
          boards: s.boards.map((b) =>
            b.id === boardId
              ? { ...b, items: [...b.items, newItem], updatedAt: new Date().toISOString() }
              : b
          ),
        }));
      },

      updateItem: (boardId, itemId, patch) => {
        set((s) => ({
          boards: s.boards.map((b) =>
            b.id === boardId
              ? {
                  ...b,
                  updatedAt: new Date().toISOString(),
                  items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
                }
              : b
          ),
        }));
      },

      deleteItem: (boardId, itemId) => {
        set((s) => ({
          boards: s.boards.map((b) =>
            b.id === boardId
              ? {
                  ...b,
                  updatedAt: new Date().toISOString(),
                  items: b.items.filter((i) => i.id !== itemId),
                }
              : b
          ),
        }));
      },
    }),
    { name: 'moodboard-store-v1' }
  )
);
