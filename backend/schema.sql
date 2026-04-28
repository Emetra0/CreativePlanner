DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT,
  created_at INTEGER,
  deleted_at INTEGER,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'pending',
  subscription_status TEXT DEFAULT 'free',
  two_factor_enabled BOOLEAN DEFAULT 0,
  two_factor_secret TEXT,
  backup_email TEXT,
  auth_provider TEXT DEFAULT 'local',
  -- Marks the one-time bootstrap admin created via /bootstrap-admin.
  -- This account has no real domain and should be deleted once real admins are promoted.
  is_bootstrap INTEGER DEFAULT 0
);

DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  expires_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

DROP TABLE IF EXISTS data;
CREATE TABLE data (
  user_id TEXT PRIMARY KEY,
  content TEXT,
  updated_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

DROP TABLE IF EXISTS temp_store;
CREATE TABLE temp_store (
  id TEXT PRIMARY KEY,
  data TEXT,
  expires_at INTEGER
);
