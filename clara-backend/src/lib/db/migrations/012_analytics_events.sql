-- ─────────────────────────────────────────────────────────────────────────────
-- 012_analytics_events.sql
-- Clara AI — Enhanced analytics: daily aggregates, top-query tracking,
--             global indexes for time-series queries
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Global created_at index on query_events ───────────────────────────────────
-- The existing index is (kb_id, created_at DESC). We need a bare created_at
-- index for cross-org time-series aggregations.
CREATE INDEX IF NOT EXISTS query_events_global_created_at_idx
  ON query_events (created_at DESC);

-- ── daily_query_stats ─────────────────────────────────────────────────────────
-- Pre-aggregated per-day counts + avg latency per KB.
-- Populated by a background upsert; analytics API can fall back to live query
-- if this table is empty (fresh install).

CREATE TABLE IF NOT EXISTS daily_query_stats (
  stat_date   DATE        NOT NULL,
  kb_id       UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  query_count INT         NOT NULL DEFAULT 0,
  avg_latency NUMERIC(10,2),
  PRIMARY KEY (stat_date, kb_id)
);

CREATE INDEX IF NOT EXISTS daily_query_stats_date_idx ON daily_query_stats (stat_date DESC);
CREATE INDEX IF NOT EXISTS daily_query_stats_kb_idx   ON daily_query_stats (kb_id);

-- ── top_queries ───────────────────────────────────────────────────────────────
-- Aggregated "most asked" queries per KB, refreshed periodically.
-- Falls back to live GROUP BY when empty.

CREATE TABLE IF NOT EXISTS top_queries (
  kb_id         UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  query_text    TEXT        NOT NULL,
  query_count   INT         NOT NULL DEFAULT 1,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kb_id, query_text)
);

CREATE INDEX IF NOT EXISTS top_queries_kb_id_idx ON top_queries (kb_id);
CREATE INDEX IF NOT EXISTS top_queries_count_idx ON top_queries (query_count DESC);

-- ── platform_events ───────────────────────────────────────────────────────────
-- Lightweight structured event log for non-query analytics signals
-- (e.g. doc ingested, KB created, user login, subscription activated).

CREATE TABLE IF NOT EXISTS platform_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        REFERENCES organisations(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT        NOT NULL,   -- e.g. 'kb.created', 'doc.ingested', 'user.login'
  resource_id TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_events_org_id_idx    ON platform_events (org_id);
CREATE INDEX IF NOT EXISTS platform_events_type_idx      ON platform_events (event_type);
CREATE INDEX IF NOT EXISTS platform_events_created_at_idx ON platform_events (created_at DESC);
