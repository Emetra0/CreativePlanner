import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AppRequestVote {
  userId: string;
  vote: 'up' | 'down';
}

export interface AppRequestComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

export interface AppRequest {
  id: string;
  userId: string;
  userEmail: string;
  appName: string;
  description: string;
  reason: string;
  categories: string[];
  status: AppRequestStatus;
  feedback?: string;
  createdAt: string;
  respondedAt?: string;
  votes: AppRequestVote[];
  requestComments: AppRequestComment[];
}

interface AppRequestState {
  requests: AppRequest[];
  submitRequest: (
    userId: string,
    userEmail: string,
    appName: string,
    description: string,
    reason: string,
    categories: string[]
  ) => void;
  respondToRequest: (id: string, status: 'approved' | 'rejected', feedback: string) => void;
  deleteRequest: (id: string) => void;
  voteRequest: (requestId: string, userId: string, voteType: 'up' | 'down') => void;
  addRequestComment: (requestId: string, userId: string, userName: string, text: string) => void;
  deleteRequestComment: (requestId: string, commentId: string) => void;
}

export const useAppRequestStore = create<AppRequestState>()(
  persist(
    (set) => ({
      requests: [],
      submitRequest: (userId, userEmail, appName, description, reason, categories) =>
        set((state) => ({
          requests: [
            ...state.requests,
            {
              id: crypto.randomUUID(),
              userId,
              userEmail,
              appName,
              description,
              reason,
              categories,
              status: 'pending',
              createdAt: new Date().toISOString(),
              votes: [],
              requestComments: [],
            },
          ],
        })),
      respondToRequest: (id, status, feedback) =>
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === id
              ? { ...r, status, feedback, respondedAt: new Date().toISOString() }
              : r
          ),
        })),
      deleteRequest: (id) =>
        set((state) => ({
          requests: state.requests.filter((r) => r.id !== id),
        })),
      voteRequest: (requestId, userId, voteType) =>
        set((state) => ({
          requests: state.requests.map((r) => {
            if (r.id !== requestId) return r;
            const existing = (r.votes ?? []).find((v) => v.userId === userId);
            let newVotes: AppRequestVote[];
            if (!existing) {
              // No vote yet — add
              newVotes = [...(r.votes ?? []), { userId, vote: voteType }];
            } else if (existing.vote === voteType) {
              // Same vote clicked again — remove (toggle off)
              newVotes = (r.votes ?? []).filter((v) => v.userId !== userId);
            } else {
              // Switching vote direction
              newVotes = (r.votes ?? []).map((v) =>
                v.userId === userId ? { ...v, vote: voteType } : v
              );
            }
            return { ...r, votes: newVotes };
          }),
        })),
      addRequestComment: (requestId, userId, userName, text) => {
        if (!text.trim()) return;
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  requestComments: [
                    ...(r.requestComments ?? []),
                    {
                      id: crypto.randomUUID(),
                      userId,
                      userName,
                      text: text.trim(),
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : r
          ),
        }));
      },
      deleteRequestComment: (requestId, commentId) =>
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  requestComments: (r.requestComments ?? []).filter(
                    (c) => c.id !== commentId
                  ),
                }
              : r
          ),
        })),
    }),
    { name: 'creative-planner-app-requests' }
  )
);
