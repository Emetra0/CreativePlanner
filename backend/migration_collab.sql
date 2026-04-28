-- ============================================================
-- Collaboration Feature Migration
-- Run: wrangler d1 execute creative-planner-db --file=./migration_collab.sql
-- ============================================================

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Project members (invited collaborators)
CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Viewer',
  permission TEXT NOT NULL DEFAULT 'view', -- 'view' | 'edit' | 'request_edit'
  joined_at INTEGER NOT NULL,
  UNIQUE(project_id, user_id)
);

-- Resources linked to a project (mindmaps / todo-lists / calendar / documents)
CREATE TABLE IF NOT EXISTS project_resources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'mindmap' | 'todo_list' | 'calendar' | 'document'
  resource_id TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  added_at INTEGER NOT NULL
);

-- Shared project-level todos
CREATE TABLE IF NOT EXISTS project_todos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_by_username TEXT NOT NULL,
  assigned_to TEXT,
  assigned_to_username TEXT,
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'medium',
  due_date TEXT,
  created_at INTEGER NOT NULL
);

-- Chat channels  (type: 'global' | 'project' | 'dm')
CREATE TABLE IF NOT EXISTS chat_channels (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  project_id TEXT,
  name TEXT,
  created_at INTEGER NOT NULL
);

-- Participants for DM channels
CREATE TABLE IF NOT EXISTS chat_dm_participants (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  PRIMARY KEY(channel_id, user_id)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_username TEXT NOT NULL,
  content TEXT NOT NULL,
  attachment_type TEXT,   -- 'mindmap' | 'project' | 'todo' | 'document'
  attachment_id TEXT,
  attachment_data TEXT,   -- JSON blob for preview
  sent_at INTEGER NOT NULL,
  deleted_at INTEGER      -- soft-delete
);

-- Seed the global channel (run once; IF NOT EXISTS logic handles re-runs)
INSERT OR IGNORE INTO chat_channels (id, type, name, created_at)
VALUES ('channel-global', 'global', 'Global', 0);
