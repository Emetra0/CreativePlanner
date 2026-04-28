-- ============================================================
-- Migration: Friend Requests & User Discriminator Tags
-- ============================================================

-- 1. Add discriminator column to users for unique tag display (e.g. alice#3847)
ALTER TABLE users ADD COLUMN discriminator TEXT NOT NULL DEFAULT '0000';

-- 2. Assign random 4-digit discriminators to every existing user
UPDATE users SET discriminator = printf('%04d', abs(random() % 10000));

-- 3. Create the friendships table
CREATE TABLE IF NOT EXISTS friendships (
  id           TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL,
  addressee_id TEXT NOT NULL,
  -- status: 'pending' | 'accepted' | 'rejected'
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER,
  UNIQUE(requester_id, addressee_id)
);

-- 4. Index for fast look-up by either party
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
