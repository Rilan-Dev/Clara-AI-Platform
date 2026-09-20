-- ─────────────────────────────────────────────────────────────────────────────
-- 004_analytics_events.sql
-- Clara AI Platform — query_events (raw usage signal) + config_snapshots.
-- All analytics dashboards aggregate from these tables — real usage only.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. query_events ──────────────────────────────────────────────────────────
-- One row per RAG search call. Powers every usage/analytics dashboard.

CREATE TABLE IF NOT EXISTS query_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id        UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  query_text   TEXT        NOT NULL,
  source_count INT         NOT NULL DEFAULT 0,  -- number of Qdrant hits returned
  latency_ms   INT,                             -- end-to-end RAG latency in ms
  session_id   TEXT,                            -- optional: ties voice turn to event
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS query_events_kb_id_idx          ON query_events (kb_id);
CREATE INDEX IF NOT EXISTS query_events_created_at_idx     ON query_events (kb_id, created_at DESC);
CREATE INDEX IF NOT EXISTS query_events_query_idx          ON query_events (kb_id, query_text);
CREATE INDEX IF NOT EXISTS query_events_global_created_at_idx
  ON query_events (created_at DESC);

-- ── 2. config_snapshots ──────────────────────────────────────────────────────
-- Immutable point-in-time copies of assistant_configs (max 5 retained per agent).

CREATE TABLE IF NOT EXISTS config_snapshots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  label       TEXT,                             -- optional human-readable label
  snapshot    JSONB       NOT NULL,             -- full config as JSON
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS config_snapshots_agent_id_idx     ON config_snapshots (agent_id);
CREATE INDEX IF NOT EXISTS config_snapshots_created_at_idx   ON config_snapshots (agent_id, created_at DESC);
