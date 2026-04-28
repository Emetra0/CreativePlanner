-- Add presence + last_seen_at columns to users table
-- Run: wrangler d1 execute creative-planner-db --remote --file ./migration_presence.sql

ALTER TABLE users ADD COLUMN presence TEXT DEFAULT 'offline';
ALTER TABLE users ADD COLUMN last_seen_at INTEGER DEFAULT 0;
