import { create } from 'zustand';
import { getWorkerUrl } from '@/lib/cloudSync';
import { useAuthStore } from './useAuthStore';
import { loadFromCloud, setAllAppData } from '@/lib/cloudSync';

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_username: string;
  sender_avatar_url?: string | null;
  content: string;
  attachment_type: string | null;
  attachment_id: string | null;
  attachment_data: string | null;
  sent_at: number;
  deleted_at: number | null;
  is_system?: number;
  edited_at?: number | null;
}

export interface RawReaction {
  id: string;
  message_id: string;
  user_id: string;
  username: string;
  emoji: string;
  created_at: number;
}

export interface ChatChannel {
  id: string;
  type: 'global' | 'project' | 'dm' | 'group';
  project_id?: string | null;
  name?: string | null;
  channel_label: string;
  project_name?: string | null;
  other_username?: string | null;
  other_user_id?: string | null;
  other_avatar_url?: string | null;
  other_discriminator?: string | null;
  other_banner_color?: string | null;
  other_presence?: string | null;
  avatar_url?: string | null;
  group_type?: string | null;
  owner_id?: string | null;
  last_message?: {
    content: string;
    sender_username: string;
    sent_at: number;
  } | null;
}

function authHeaders() {
  const token = useAuthStore.getState().token;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

interface ChatState {
  channels: ChatChannel[];
  activeChannelId: string | null;
  messages: Record<string, ChatMessage[]>; // channelId → messages
  reactions: Record<string, RawReaction[]>; // channelId → flat reaction rows
  loadingChannels: boolean;
  loadingMessages: boolean;
  pollingRef: ReturnType<typeof setInterval> | null;

  fetchChannels: () => Promise<void>;
  setActiveChannel: (channelId: string) => void;
  fetchMessages: (channelId: string, before?: number) => Promise<void>;
  sendMessage: (channelId: string, content: string, attachment?: { type: string; id: string; data: any }) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  openOrCreateDm: (targetUserId: string) => Promise<{ channel_id: string } | { error: string }>;
  startPolling: (channelId: string) => void;
  stopPolling: () => void;
  appendMessage: (msg: ChatMessage) => void;
  /** Accept or reject a share_invite. Updates local message attachment_data status. */
  respondToInvite: (inviteId: string, messageId: string, accept: boolean) => Promise<boolean>;
  /** Patch attachment_data of a single message in local store */
  patchMessageData: (messageId: string, data: any) => void;
  /** Fetch all reactions for a channel */
  fetchReactions: (channelId: string) => Promise<void>;
  /** Toggle an emoji reaction on a message (optimistic) */
  toggleReaction: (messageId: string, channelId: string, emoji: string) => Promise<void>;
  /** Create a group channel */
  createGroup: (name: string, memberIds: string[], groupType?: string) => Promise<string | null>;
  /** Edit a message */
  editMessage: (messageId: string, content: string) => Promise<boolean>;
  /** Hide a DM channel from sidebar */
  hideChannel: (channelId: string) => Promise<boolean>;
  /** Delete/leave a channel */
  deleteChannel: (channelId: string) => Promise<{ success: boolean; unfriended?: boolean; error?: string }>;
  /** Update group avatar (owner only) */
  updateGroupAvatar: (channelId: string, avatarUrl: string | null) => Promise<boolean>;
  /** Upload/update user avatar */
  uploadAvatar: (avatarUrl: string | null) => Promise<boolean>;
  /** Resolve current usernames for an array of user IDs */
  resolveUsernames: (userIds: string[]) => Promise<Record<string, string>>;
  /** Re-resolve all sender names in already-loaded messages (call after a username change) */
  refreshAllUsernames: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  channels: [],
  activeChannelId: null,
  messages: {},
  reactions: {},
  loadingChannels: false,
  loadingMessages: false,
  pollingRef: null,

  fetchChannels: async () => {
    set({ loadingChannels: true });
    try {
      const res = await fetch(`${getWorkerUrl()}/chat/channels`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch channels');
      const { channels } = await res.json();
      set({ channels: channels || [], loadingChannels: false });
    } catch {
      set({ loadingChannels: false });
    }
  },

  setActiveChannel: (channelId) => {
    set({ activeChannelId: channelId });
  },

  fetchMessages: async (channelId, before) => {
    set({ loadingMessages: true });
    try {
      const url = before
        ? `${getWorkerUrl()}/chat/channels/${channelId}/messages?limit=50&before=${before}`
        : `${getWorkerUrl()}/chat/channels/${channelId}/messages?limit=50`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed');
      const { messages } = await res.json();
      const msgs: ChatMessage[] = messages || [];

      // Resolve current usernames so renamed users show their new name
      const uniqueIds = [...new Set(msgs.map((m) => m.sender_id).filter(Boolean))];
      const resolved = uniqueIds.length ? await get().resolveUsernames(uniqueIds) : {};
      const patched = msgs.map((m) =>
        resolved[m.sender_id] ? { ...m, sender_username: resolved[m.sender_id] } : m
      );

      if (before) {
        set((s) => ({ messages: { ...s.messages, [channelId]: [...patched, ...(s.messages[channelId] || [])] }, loadingMessages: false }));
      } else {
        set((s) => ({ messages: { ...s.messages, [channelId]: patched }, loadingMessages: false }));
      }
    } catch {
      set({ loadingMessages: false });
    }
  },

  sendMessage: async (channelId, content, attachment) => {
    const body: any = { content };
    if (attachment) {
      body.attachment_type = attachment.type;
      body.attachment_id = attachment.id;
      body.attachment_data = attachment.data;
    }
    const res = await fetch(`${getWorkerUrl()}/chat/channels/${channelId}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const { message } = await res.json();
    set((s) => ({
      messages: { ...s.messages, [channelId]: [...(s.messages[channelId] || []), message] },
      channels: s.channels.map((ch) =>
        ch.id === channelId ? { ...ch, last_message: { content: message.content, sender_username: message.sender_username, sent_at: message.sent_at } } : ch
      ),
    }));
  },

  deleteMessage: async (messageId) => {
    await fetch(`${getWorkerUrl()}/chat/messages/${messageId}`, { method: 'DELETE', headers: authHeaders() });
    set((s) => {
      const updated: Record<string, ChatMessage[]> = {};
      for (const [cid, msgs] of Object.entries(s.messages)) {
        updated[cid] = msgs.filter((m) => m.id !== messageId);
      }
      return { messages: updated };
    });
  },

  openOrCreateDm: async (targetUserId) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/chat/dm`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ target_user_id: targetUserId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: (data as any).error || 'Failed to open DM' };
      }
      const { channel_id } = await res.json();
      await get().fetchChannels();
      return { channel_id };
    } catch {
      return { error: 'Network error' };
    }
  },

  startPolling: (channelId) => {
    const existing = get().pollingRef;
    if (existing) clearInterval(existing);
    let tickCount = 0;
    const ref = setInterval(async () => {
      tickCount++;
      // Every 3 ticks (~4.5s) refresh the channel list so sidebar DM labels stay current for all users
      if (tickCount % 3 === 0) {
        try { await get().fetchChannels(); } catch {}
      }
      const url = `${getWorkerUrl()}/chat/channels/${channelId}/messages?limit=50`;
      try {
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok) return;
        const { messages: incoming } = await res.json();
        if (!incoming?.length) return;

        const incomingMsgs: ChatMessage[] = incoming;

        // Build a sender_id → current username map from the incoming rows.
        // The backend JOIN already guarantees these are live names from the users table.
        const nameById: Record<string, string> = {};
        for (const m of incomingMsgs) {
          if (m.sender_id && m.sender_username) nameById[m.sender_id] = m.sender_username;
        }

        // For any sender IDs in the local store that aren't in the incoming batch
        // (older messages beyond the 50-row window), resolve them separately.
        const current = get().messages[channelId] || [];
        const missingIds = [...new Set(
          current.map((m) => m.sender_id).filter((id) => id && !nameById[id])
        )];
        if (missingIds.length) {
          const extra = await get().resolveUsernames(missingIds);
          Object.assign(nameById, extra);
        }

        set((s) => {
          const stored = s.messages[channelId] || [];
          const existingIds = new Set(stored.map((m: ChatMessage) => m.id));
          const newMsgs = incomingMsgs.filter((m) => !existingIds.has(m.id));

          // Patch sender_username on EVERY message in the store using the live name map
          const patchedExisting = stored.map((m) =>
            nameById[m.sender_id] ? { ...m, sender_username: nameById[m.sender_id] } : m
          );
          const merged = newMsgs.length ? [...patchedExisting, ...newMsgs] : patchedExisting;

          // Also update the DM channel_label if the other person renamed
          const updatedChannels = s.channels.map((ch) => {
            if (ch.id !== channelId) return ch;
            const updated: typeof ch = { ...ch };
            if (newMsgs.length) {
              updated.last_message = { content: newMsgs[newMsgs.length - 1].content, sender_username: newMsgs[newMsgs.length - 1].sender_username, sent_at: newMsgs[newMsgs.length - 1].sent_at };
            }
            // Refresh DM label if the other user's current name is now known
            if (ch.type === 'dm' && ch.other_user_id && nameById[ch.other_user_id]) {
              updated.channel_label = nameById[ch.other_user_id];
            }
            return updated;
          });

          return { messages: { ...s.messages, [channelId]: merged }, channels: updatedChannels };
        });
      } catch {}
    }, 1500);
    set({ pollingRef: ref });
  },

  stopPolling: () => {
    const ref = get().pollingRef;
    if (ref) clearInterval(ref);
    set({ pollingRef: null });
  },

  appendMessage: (msg) => {
    set((s) => ({
      messages: { ...s.messages, [msg.channel_id]: [...(s.messages[msg.channel_id] || []), msg] },
    }));
  },

  patchMessageData: (messageId, data) => {
    set((s) => {
      const updated: Record<string, ChatMessage[]> = {};
      for (const [cid, msgs] of Object.entries(s.messages)) {
        updated[cid] = msgs.map((m) =>
          m.id === messageId ? { ...m, attachment_data: JSON.stringify(data) } : m
        );
      }
      return { messages: updated };
    });
  },

  fetchReactions: async (channelId) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/chat/channels/${channelId}/reactions`, { headers: authHeaders() });
      if (!res.ok) return;
      const { reactions } = await res.json();
      set((s) => ({ reactions: { ...s.reactions, [channelId]: reactions || [] } }));
    } catch {}
  },

  toggleReaction: async (messageId, channelId, emoji) => {
    const { user } = useAuthStore.getState() as any;
    const userId = user?.id || '';
    const username = user?.username || '';
    // Optimistic update
    set((s) => {
      const existing = s.reactions[channelId] || [];
      const alreadyIdx = existing.findIndex((r) => r.message_id === messageId && r.user_id === userId && r.emoji === emoji);
      const updated = alreadyIdx >= 0
        ? existing.filter((_, i) => i !== alreadyIdx)
        : [...existing, { id: `temp-${Date.now()}`, message_id: messageId, user_id: userId, username, emoji, created_at: Date.now() }];
      return { reactions: { ...s.reactions, [channelId]: updated } };
    });
    try {
      await fetch(`${getWorkerUrl()}/chat/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ emoji }),
      });
      // Re-fetch to sync server state
      await get().fetchReactions(channelId);
    } catch {}
  },

  createGroup: async (name, memberIds, groupType = 'private') => {
    try {
      const res = await fetch(`${getWorkerUrl()}/chat/groups`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, member_ids: memberIds, group_type: groupType }),
      });
      if (!res.ok) return null;
      const { channel_id } = await res.json();
      await get().fetchChannels();
      return channel_id as string;
    } catch {
      return null;
    }
  },

  editMessage: async (messageId, content) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/chat/messages/${messageId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ content }),
      });
      if (!res.ok) return false;
      const { message } = await res.json();
      set((s) => {
        const updated: Record<string, ChatMessage[]> = {};
        for (const [cid, msgs] of Object.entries(s.messages)) {
          updated[cid] = msgs.map((m) => (m.id === messageId ? message : m));
        }
        return { messages: updated };
      });
      return true;
    } catch {
      return false;
    }
  },

  hideChannel: async (channelId) => {
    try {
      await fetch(`${getWorkerUrl()}/chat/channels/${channelId}/hide`, {
        method: 'POST',
        headers: authHeaders(),
      });
      set((s) => ({ channels: s.channels.filter((c) => c.id !== channelId) }));
      return true;
    } catch {
      return false;
    }
  },

  deleteChannel: async (channelId) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/chat/channels/${channelId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return { success: false, error: (d as any).error || 'Failed' };
      }
      const data = await res.json();
      set((s) => ({ channels: s.channels.filter((c) => c.id !== channelId) }));
      return { success: true, unfriended: data.unfriended };
    } catch {
      return { success: false, error: 'Network error' };
    }
  },

  updateGroupAvatar: async (channelId, avatarUrl) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/chat/groups/${channelId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ avatar_url: avatarUrl }),
      });
      if (!res.ok) return false;
      set((s) => ({
        channels: s.channels.map((c) => (c.id === channelId ? { ...c, avatar_url: avatarUrl } : c)),
      }));
      return true;
    } catch {
      return false;
    }
  },

  uploadAvatar: async (avatarUrl) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/account/avatar`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ avatar_url: avatarUrl }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  resolveUsernames: async (userIds) => {
    if (!userIds.length) return {};
    try {
      const res = await fetch(`${getWorkerUrl()}/users/resolve?ids=${userIds.join(',')}`, { headers: authHeaders() });
      if (!res.ok) return {};
      const { usernames } = await res.json();
      return usernames || {};
    } catch {
      return {};
    }
  },

  refreshAllUsernames: async () => {
    const allMsgs = get().messages;
    // Collect all unique sender IDs across every loaded channel
    const uniqueIds = [...new Set(
      Object.values(allMsgs).flat().map((m) => m.sender_id).filter(Boolean)
    )];
    if (!uniqueIds.length) return;
    const resolved = await get().resolveUsernames(uniqueIds);
    if (!Object.keys(resolved).length) return;
    // Patch sender_username in all loaded messages
    set((s) => {
      const updated: Record<string, ChatMessage[]> = {};
      for (const [cid, msgs] of Object.entries(s.messages)) {
        updated[cid] = msgs.map((m) =>
          resolved[m.sender_id] ? { ...m, sender_username: resolved[m.sender_id] } : m
        );
      }
      return { messages: updated };
    });
  },

  respondToInvite: async (inviteId, messageId, accept) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/invites/${inviteId}/respond`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) return false;
      const { status } = await res.json();
      // Patch local message so the invite card instantly reflects the new status
      set((s) => {
        const updated: Record<string, ChatMessage[]> = {};
        for (const [cid, msgs] of Object.entries(s.messages)) {
          updated[cid] = msgs.map((m) => {
            if (m.id !== messageId) return m;
            try {
              const d = JSON.parse(m.attachment_data || '{}');
              return { ...m, attachment_data: JSON.stringify({ ...d, status }) };
            } catch { return m; }
          });
        }
        return { messages: updated };
      });

      if (accept) {
        try {
          const { useProjectStore } = await import('./useProjectStore');
          await useProjectStore.getState().fetchProjects();
          const projects = useProjectStore.getState().projects;
          await Promise.all(projects.map((project) => useProjectStore.getState().fetchProjectResources(project.id)));
        } catch {}

        try {
          await get().fetchChannels();
        } catch {}

        try {
          const token = useAuthStore.getState().token;
          if (token) {
            const cloudData = await loadFromCloud(token);
            if (cloudData) {
              await setAllAppData(cloudData);
            }
          }
        } catch {}
      }

      return true;
    } catch {
      return false;
    }
  },
}));
