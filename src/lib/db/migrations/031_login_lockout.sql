-- 031_login_lockout.sql
-- Phase 6.1 authentication hardening: account lockout after repeated failed
-- logins. The login handler increments failed_login_attempts on every bad
-- password and locks the account (locked_until) when the counter reaches 10.
-- A successful login resets both fields. Platform super-admins can unlock
-- early via POST /api/platform/users/:id/unlock (audited).

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_locked_until_idx ON users (locked_until) WHERE locked_until IS NOT NULL;
