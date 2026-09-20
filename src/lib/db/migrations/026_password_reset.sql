-- ─────────────────────────────────────────────────────────────────────────────
-- 026_password_reset.sql
-- Clara AI Platform — self-service password reset tokens + org member
-- invitations reuse the same token table (purpose column).
--
-- Security model:
--   * Token is 32 random bytes, sent to the user by email.
--   * Only the HMAC-SHA256 hash is stored (token_hash) — DB breach never
--     exposes usable tokens.
--   * Tokens are single-use (used_at) and expire (expires_at).
--   * A successful reset revokes every active session for the user.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  purpose     TEXT        NOT NULL DEFAULT 'password_reset'
                            CHECK (purpose IN ('password_reset', 'org_invitation')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  request_ip  TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx    ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx ON password_reset_tokens (expires_at);
