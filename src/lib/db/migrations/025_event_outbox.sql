-- 025_event_outbox.sql
-- Durable application-to-broker event handoff.

CREATE TABLE IF NOT EXISTS event_outbox (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id   TEXT NOT NULL,
  dedupe_key     TEXT,
  routing_key    TEXT NOT NULL,
  payload        JSONB NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','publishing','published','failed')),
  attempts       INT NOT NULL DEFAULT 0,
  available_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at      TIMESTAMPTZ,
  published_at   TIMESTAMPTZ,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_outbox_dedupe_idx
  ON event_outbox (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_outbox_pending_idx
  ON event_outbox (available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS event_outbox_publishing_idx
  ON event_outbox (locked_at)
  WHERE status = 'publishing';

CREATE INDEX IF NOT EXISTS event_outbox_type_idx
  ON event_outbox (event_type, created_at DESC);
