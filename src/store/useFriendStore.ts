import { create } from 'zustand';
import { getWorkerUrl } from '@/lib/cloudSync';
import { useAuthStore } from './useAuthStore';

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Friend {
  /** friendship row id */
  id: string;
  friend_id: string;
  friend_username: string;
  friend_discriminator: string;
  friend_avatar_url?: string | null;
  friend_presence?: string | null;
  friend_last_seen_at?: number | null;
  status: 'accepted';
  created_at: number;
}

export interface FriendRequest {
  /** friendship row id */
  id: string;
  requester_id: string;
  requester_username: string;
  requester_discriminator: string;
  created_at: number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface FriendState {
  friends: Friend[];
  pendingRequests: FriendRequest[];
  loading: boolean;

  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  /** Send a friend request to another user. Returns { success, error? }. */
  sendRequest: (addresseeId: string) => Promise<{ success: boolean; error?: string }>;
  /** Accept or reject an incoming request by friendship id. */
  respondToRequest: (requestId: string, accept: boolean) => Promise<boolean>;
  /** Remove an accepted friend by their user id. */
  unfriend: (friendUserId: string) => Promise<boolean>;
  /** True if the given user id is an accepted friend. */
  isFriend: (userId: string) => boolean;
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  pendingRequests: [],
  loading: false,

  fetchFriends: async () => {
    set({ loading: true });
    try {
      const res = await fetch(`${getWorkerUrl()}/friends`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        set({ friends: (data.friends as Friend[]) || [] });
      }
    } catch {}
    set({ loading: false });
  },

  fetchRequests: async () => {
    try {
      const res = await fetch(`${getWorkerUrl()}/friends/requests`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        set({ pendingRequests: (data.requests as FriendRequest[]) || [] });
      }
    } catch {}
  },

  sendRequest: async (addresseeId) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/friends/request`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ addressee_id: addresseeId }),
      });
      const data = await res.json();
      if (res.ok) return { success: true };
      return { success: false, error: data.error || 'Failed to send request' };
    } catch {
      return { success: false, error: 'Network error' };
    }
  },

  respondToRequest: async (requestId, accept) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/friends/respond/${requestId}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: accept ? 'accept' : 'reject' }),
      });
      if (res.ok) {
        // Remove from pending immediately
        set((s) => ({ pendingRequests: s.pendingRequests.filter((r) => r.id !== requestId) }));
        if (accept) await get().fetchFriends();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  unfriend: async (friendUserId) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/friends/${friendUserId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        set((s) => ({ friends: s.friends.filter((f) => f.friend_id !== friendUserId) }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  isFriend: (userId) => get().friends.some((f) => f.friend_id === userId),
}));
