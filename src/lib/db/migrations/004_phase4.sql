-- ─────────────────────────────────────────────────────────────────────────────
-- 004_phase4.sql
-- Clara RAG — Phase 4: config versioning + usage analytics
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. config_snapshots ───────────────────────────────────────────────────────
-- Immutable point-in-time copies of assistant_configs.
-- At most 5 snapshots per KB are retained (oldest pruned automatically).

CREATE TABLE IF NOT EXISTS config_snapshots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id       UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  label       TEXT,                             -- optional human-readable label
  snapshot    JSONB       NOT NULL,             -- full config as JSON
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS config_snapshots_kb_id_idx     ON config_snapshots (kb_id);
CREATE INDEX IF NOT EXISTS config_snapshots_created_at_idx ON config_snapshots (kb_id, created_at DESC);

-- ── 2. query_events ──────────────────────────────────────────────────────────
-- One row per RAG search call in Mode A (kbId path).
-- Powers the per-KB analytics dashboard.

CREATE TABLE IF NOT EXISTS query_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id        UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  query_text   TEXT        NOT NULL,
  source_count INT         NOT NULL DEFAULT 0,  -- number of Qdrant hits returned
  latency_ms   INT,                             -- end-to-end RAG latency in ms
  session_id   TEXT,                            -- optional: ties voice turn to event
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS query_events_kb_id_idx    ON query_events (kb_id);
CREATE INDEX IF NOT EXISTS query_events_created_at_idx ON query_events (kb_id, created_at DESC);
-- Enables fast "top queries" aggregation
CREATE INDEX IF NOT EXISTS query_events_query_idx    ON query_events (kb_id, query_text);
