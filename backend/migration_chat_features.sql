-- ─── Chat feature extensions ───────────────────────────────────
-- Run once against the remote D1 database:
--   npx wrangler d1 execute creative-planner-db --remote --file=migration_chat_features.sql

-- Emoji reactions on messages
CREATE TABLE IF NOT EXISTS message_reactions (
  id          TEXT    PRIMARY KEY,
  message_id  TEXT    NOT NULL,
  user_id     TEXT    NOT NULL,
  username    TEXT    NOT NULL,
  emoji       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE(message_id, user_id, emoji),
  FOREIGN KEY(message_id) REFERENCES chat_messages(id)
);

-- Group chat member list
CREATE TABLE IF NOT EXISTS chat_group_members (
  channel_id  TEXT    NOT NULL,
  user_id     TEXT    NOT NULL,
  username    TEXT    NOT NULL,
  added_at    INTEGER NOT NULL,
  PRIMARY KEY(channel_id, user_id),
  FOREIGN KEY(channel_id) REFERENCES chat_channels(id)
);
