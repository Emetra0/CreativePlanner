import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CommentBan {
  userId: string;
  userName: string;
  bannedAt: string;
  reason?: string;
}

interface CommentModerationState {
  bans: CommentBan[];
  banUser: (userId: string, userName: string, reason?: string) => void;
  unbanUser: (userId: string) => void;
  isUserBanned: (userId: string) => boolean;
}

export const useCommentModerationStore = create<CommentModerationState>()(
  persist(
    (set, get) => ({
      bans: [],
      banUser: (userId, userName, reason) =>
        set((s) => {
          if (s.bans.some((b) => b.userId === userId)) return s;
          return {
            bans: [
              ...s.bans,
              { userId, userName, bannedAt: new Date().toISOString(), reason },
            ],
          };
        }),
      unbanUser: (userId) =>
        set((s) => ({ bans: s.bans.filter((b) => b.userId !== userId) })),
      isUserBanned: (userId) => get().bans.some((b) => b.userId === userId),
    }),
    { name: 'comment-moderation-v1' }
  )
);
