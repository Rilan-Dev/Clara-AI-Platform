-- ─────────────────────────────────────────────────────────────────────────────
-- 005_api_keys.sql
-- Clara RAG — Embed / Public Access Layer
-- API keys that let org websites embed the AI assistant with zero backend setup
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. api_keys ──────────────────────────────────────────────────────────────
-- One row per key. Multiple keys per KB allowed (staging / prod / partner etc.)
-- key_hash  : SHA-256 of the raw key — NEVER store the raw key in DB
-- key_prefix: first 16 chars of the raw key shown in UI for identification

CREATE TABLE IF NOT EXISTS api_keys (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id               UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  org_id              UUID        NOT NULL REFERENCES organisations(id)    ON DELETE CASCADE,
  name                TEXT        NOT NULL DEFAULT 'Default',
  key_prefix          TEXT        NOT NULL,           -- e.g. "clr_a1b2c3d4e5f6ef"
  key_hash            TEXT        NOT NULL UNIQUE,    -- SHA-256(full_key), hex
  allowed_origins     TEXT[]      NOT NULL DEFAULT '{}',   -- empty = allow any origin
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  rate_limit_per_hour INT         NOT NULL DEFAULT 500,    -- 0 = unlimited
  created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  last_used_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_kb_id_idx    ON api_keys (kb_id);
CREATE INDEX IF NOT EXISTS api_keys_org_id_idx   ON api_keys (org_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_active_idx   ON api_keys (is_active) WHERE is_active = TRUE;

-- ── 2. api_key_usage ─────────────────────────────────────────────────────────
-- Rolling hourly request counters — one row per (key, UTC-hour).
-- Old rows are irrelevant and can be pruned periodically.

CREATE TABLE IF NOT EXISTS api_key_usage (
  key_id  UUID        NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  hour    TIMESTAMPTZ NOT NULL,  -- date_trunc('hour', now() AT TIME ZONE 'UTC')
  count   INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, hour)
);

CREATE INDEX IF NOT EXISTS api_key_usage_hour_idx ON api_key_usage (hour);
