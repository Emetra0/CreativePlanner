-- ============================================================
-- Migration: Chat profiles, message editing, DM hide/delete,
--            group ownership, banner colors, avatars
-- ============================================================

-- 1. Users: profile avatar + banner accent color
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN banner_color TEXT DEFAULT '#6366f1';
ALTER TABLE users ADD COLUMN banner_image TEXT;

-- 2. Chat channels: group avatar, group type (private/public), owner
ALTER TABLE chat_channels ADD COLUMN avatar_url  TEXT;
ALTER TABLE chat_channels ADD COLUMN group_type  TEXT NOT NULL DEFAULT 'private';
ALTER TABLE chat_channels ADD COLUMN owner_id    TEXT;

-- 3. Group members: role (owner | member)
ALTER TABLE chat_group_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

-- 4. DM participants: track per-user hide timestamp
ALTER TABLE chat_dm_participants ADD COLUMN hidden_at INTEGER;

-- 5. Messages: system flag + edit tracking
ALTER TABLE chat_messages ADD COLUMN is_system INTEGER DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN edited_at  INTEGER;
