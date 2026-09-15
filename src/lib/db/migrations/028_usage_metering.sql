-- ─────────────────────────────────────────────────────────────────────────────
-- 028_usage_metering.sql
-- Clara AI Platform — WS-1.1: the usage-event spine.
--
-- Phase 1 gap: the platform counted *requests* but never *what those requests
-- cost*. Token counts, the model called and estimated spend were invisible,
-- so meters could not answer "how much of our bill did this org cause?".
--
-- Two changes:
--   1. query_events (the de-facto CHAT usage event) gains the metering
--      columns: model, provider, prompt_tokens, completion_tokens,
--      cost_usd_micros, cancelled. Written at finalise time from the
--      provider's own usage report (stream_options.include_usage).
--   2. A new append-only usage_events table records NON-chat billable
--      invocations — embedding batches during ingestion first, TTS/OCR
--      later. Corrections are compensating rows, never UPDATE/DELETE.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. query_events metering columns ─────────────────────────────────────────

ALTER TABLE query_events ADD COLUMN IF NOT EXISTS model              TEXT;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS provider            TEXT;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS prompt_tokens       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS completion_tokens   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS cost_usd_micros     BIGINT  NOT NULL DEFAULT 0;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS cancelled           BOOLEAN NOT NULL DEFAULT FALSE;

-- Token/cost analytics: per-model spend, per-org token totals.
CREATE INDEX IF NOT EXISTS query_events_model_idx ON query_events (model);

-- ── 2. usage_events: append-only metering for non-chat invocations ───────────

CREATE TABLE IF NOT EXISTS usage_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID REFERENCES organisations(id) ON DELETE CASCADE,
  -- CHAT events live in query_events (they are the query audit trail too);
  -- usage_events covers everything else.
  kind               TEXT NOT NULL CHECK (kind IN ('EMBEDDING','TTS','OCR','TRANSCRIPTION')),
  agent_id           UUID,
  kb_id              UUID,
  document_id        UUID,
  model              TEXT NOT NULL,
  provider           TEXT,
  prompt_tokens      INTEGER NOT NULL DEFAULT 0,
  completion_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd_micros    BIGINT  NOT NULL DEFAULT 0,
  latency_ms         INTEGER,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_org_created_idx ON usage_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_kind_idx        ON usage_events (kind);
CREATE INDEX IF NOT EXISTS usage_events_kb_idx          ON usage_events (kb_id);

COMMENT ON TABLE usage_events IS 'Append-only metering for non-chat billable AI invocations. No UPDATE/DELETE paths are exposed; corrections are compensating rows.';
