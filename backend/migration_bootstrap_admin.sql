-- Migration: Add is_bootstrap column to users table.
-- Run this against existing databases that were created before this schema update.
--
-- Local dev:
--   npx wrangler d1 execute creative-planner-db --local --file=migration_bootstrap_admin.sql
--
-- Production:
--   npx wrangler d1 execute creative-planner-db --remote --file=migration_bootstrap_admin.sql

ALTER TABLE users ADD COLUMN is_bootstrap INTEGER DEFAULT 0;
