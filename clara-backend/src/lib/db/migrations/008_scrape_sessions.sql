-- ─────────────────────────────────────────────────────────────────────────────
-- 008_scrape_sessions.sql
-- Web scraping session management for the Clara RAG pipeline.
--
-- Tables:
--   scrape_sessions  — tracks the full lifecycle of a crawl+scrape operation
--   scrape_urls      — individual URLs discovered/selected within a session
-- ─────────────────────────────────────────────────────────────────────────────

-- ── scrape_sessions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrape_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id           UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  root_url        TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'discovering'
                              CHECK (status IN (
                                'discovering',       -- crawler is running
                                'awaiting_confirmation', -- URLs found, waiting for user
                                'scraping',          -- user confirmed, worker running
                                'completed',         -- all selected URLs scraped
                                'failed'             -- fatal error
                              )),
  max_depth       INT         NOT NULL DEFAULT 3,
  total_urls      INT         NOT NULL DEFAULT 0,   -- discovered URL count
  selected_urls   INT         NOT NULL DEFAULT 0,   -- user-included URL count
  scraped_urls    INT         NOT NULL DEFAULT 0,   -- successfully scraped count
  failed_urls     INT         NOT NULL DEFAULT 0,   -- errored URL count
  error_message   TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_sessions_kb_id
  ON scrape_sessions (kb_id);

CREATE INDEX IF NOT EXISTS idx_scrape_sessions_status
  ON scrape_sessions (status);

-- ── scrape_urls ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrape_urls (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES scrape_sessions(id) ON DELETE CASCADE,
  url             TEXT        NOT NULL,
  title           TEXT,
  depth           INT         NOT NULL DEFAULT 0,
  parent_url      TEXT,
  included        BOOLEAN     NOT NULL DEFAULT true,  -- user include/exclude toggle
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN (
                                'pending',    -- awaiting scrape
                                'scraping',   -- currently being scraped
                                'completed',  -- scraped + ingested successfully
                                'failed',     -- scrape/ingest error
                                'excluded'    -- user excluded this URL
                              )),
  document_id     UUID        REFERENCES documents(id) ON DELETE SET NULL,
  content_length  INT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_urls_session_id
  ON scrape_urls (session_id);

CREATE INDEX IF NOT EXISTS idx_scrape_urls_status
  ON scrape_urls (session_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scrape_urls_session_url
  ON scrape_urls (session_id, url);

-- ── updated_at trigger ────────────────────────────────────────────────────────
-- Reuse the same trigger pattern used in other tables in this project.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_scrape_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_scrape_sessions_updated_at
      BEFORE UPDATE ON scrape_sessions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_scrape_urls_updated_at'
  ) THEN
    CREATE TRIGGER trg_scrape_urls_updated_at
      BEFORE UPDATE ON scrape_urls
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
