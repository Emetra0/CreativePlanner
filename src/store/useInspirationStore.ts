import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ReactionType = 'love' | 'fire';

export interface InspirationComment {
  id: string;
  text: string;
  createdAt: string;
  userId?: string;
  userName?: string;
}

export interface InspirationEntry {
  verseRef: string;
  love: number;
  fire: number;
  /** Whether this user has loved the verse today (resets each day). */
  userLove: boolean;
  /** YYYY-MM-DD – the date userLove was last set. Used to auto-reset daily. */
  userLoveDate?: string;
  /** Whether this user has reacted with fire. No daily reset. */
  userFire: boolean;
  comments: InspirationComment[];
}

interface InspirationState {
  entries: Record<string, InspirationEntry>;
  toggleReaction: (verseRef: string, reaction: ReactionType) => void;
  addComment: (verseRef: string, text: string, userId?: string, userName?: string) => void;
  deleteComment: (verseRef: string, commentId: string) => void;
  getEntry: (verseRef: string) => InspirationEntry;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const defaultEntry = (verseRef: string): InspirationEntry => ({
  verseRef,
  love: 0,
  fire: 0,
  userLove: false,
  userLoveDate: undefined,
  userFire: false,
  comments: [],
});

export const useInspirationStore = create<InspirationState>()(
  persist(
    (set, get) => ({
      entries: {},

      getEntry: (verseRef: string) => {
        return get().entries[verseRef] ?? defaultEntry(verseRef);
      },

      toggleReaction: (verseRef: string, reaction: ReactionType) => {
        set((state) => {
          const raw = state.entries[verseRef] ?? defaultEntry(verseRef);
          const today = todayStr();

          // Love resets daily – treat as inactive if it was set on a different day
          const loveActive = raw.userLove && raw.userLoveDate === today;
          const fireActive = raw.userFire;

          if (reaction === 'love') {
            return {
              entries: {
                ...state.entries,
                [verseRef]: {
                  ...raw,
                  userLove: !loveActive,
                  userLoveDate: !loveActive ? today : raw.userLoveDate,
                  love: !loveActive ? raw.love + 1 : Math.max(0, raw.love - 1),
                },
              },
            };
          } else {
            return {
              entries: {
                ...state.entries,
                [verseRef]: {
                  ...raw,
                  userFire: !fireActive,
                  fire: !fireActive ? raw.fire + 1 : Math.max(0, raw.fire - 1),
                },
              },
            };
          }
        });
      },

      addComment: (verseRef: string, text: string, userId?: string, userName?: string) => {
        if (!text.trim()) return;
        set((state) => {
          const entry = state.entries[verseRef] ?? defaultEntry(verseRef);
          return {
            entries: {
              ...state.entries,
              [verseRef]: {
                ...entry,
                comments: [
                  ...entry.comments,
                  {
                    id: Date.now().toString(),
                    text: text.trim(),
                    createdAt: new Date().toISOString(),
                    userId,
                    userName,
                  },
                ],
              },
            },
          };
        });
      },

      deleteComment: (verseRef: string, commentId: string) => {
        set((state) => {
          const entry = state.entries[verseRef];
          if (!entry) return state;
          return {
            entries: {
              ...state.entries,
              [verseRef]: {
                ...entry,
                comments: entry.comments.filter((c) => c.id !== commentId),
              },
            },
          };
        });
      },
    }),
    { name: 'inspiration-store-v1' }
  )
);
