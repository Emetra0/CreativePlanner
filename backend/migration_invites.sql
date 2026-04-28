-- ============================================================
-- Share Invites Migration
-- Run: wrangler d1 execute creative-planner-db --file=./migration_invites.sql --remote
-- ============================================================

-- Share invite records (one row per invite sent via DM)
CREATE TABLE IF NOT EXISTS share_invites (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  from_username TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,   -- 'mindmap' | 'moodboard' | 'document'
  resource_name TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'edit',    -- 'edit' | 'view' | 'request_edit'
  role TEXT NOT NULL DEFAULT 'Editor',        -- human-readable role label
  status TEXT NOT NULL DEFAULT 'pending',     -- 'pending' | 'accepted' | 'rejected'
  message_id TEXT,    -- the DM chat_messages.id carrying the invite card
  channel_id TEXT,    -- the DM chat_channels.id
  created_at INTEGER NOT NULL
);
