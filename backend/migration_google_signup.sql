-- Migration for Google Signup Flow and 2FA

CREATE TABLE IF NOT EXISTS pending_signups (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    created_at INTEGER,
    expires_at INTEGER
);

-- temp_store moved to schema.sql but we keep it here just in case for old instances if needed,
-- or we can assume schema.sql is the source of truth now.
-- Since the user complained about errors, let's remove potential duplicates if they run this manually.
-- But standard practice is CREATE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS temp_store (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER
);
