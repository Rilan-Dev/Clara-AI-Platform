-- ─────────────────────────────────────────────────────────────────────────────
-- 007_scraping.sql
-- Clara AI Platform — web crawl + scrape pipeline.
--   scrape_sessions     — lifecycle of a crawl+scrape operation
--   scrape_urls         — URLs discovered/selected within a session
--   scrape_url_retries  — full retry attempt history (exponential back-off)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. scrape_sessions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scrape_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id           UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  root_url        TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'discovering'
                              CHECK (status IN (
                                'discovering',           -- crawler is running
                                'awaiting_confirmation', -- URLs found, waiting for user
                                'scraping',              -- user confirmed, worker running
                                'ingesting',             -- scraped docs entering the KB
                                'completed',             -- all selected URLs scraped
                                'failed'                 -- fatal error
                              )),
  max_depth       INT         NOT NULL DEFAULT 3,
  total_urls      INT         NOT NULL DEFAULT 0,   -- discovered URL count
  selected_urls   INT         NOT NULL DEFAULT 0,   -- user-included URL count
  scraped_urls    INT         NOT NULL DEFAULT 0,   -- successfully scraped count
  failed_urls     INT         NOT NULL DEFAULT 0,   -- errored URL count
  cancel_requested BOOLEAN    NOT NULL DEFAULT FALSE,
  job_id          TEXT,                             -- BullMQ job id (crawl progress)
  error_message   TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_sessions_kb_id    ON scrape_sessions (kb_id);
CREATE INDEX IF NOT EXISTS idx_scrape_sessions_status   ON scrape_sessions (status);

-- ── 2. scrape_urls ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scrape_urls (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES scrape_sessions(id) ON DELETE CASCADE,
  url             TEXT        NOT NULL,
  title           TEXT,
  depth           INT         NOT NULL DEFAULT 0,
  parent_url      TEXT,
  included        BOOLEAN     NOT NULL DEFAULT TRUE,  -- user include/exclude toggle
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
  retry_count     INT         NOT NULL DEFAULT 0,
  retry_status    TEXT        DEFAULT NULL
                              CHECK (retry_status IS NULL OR retry_status IN (
                                'scheduled',         -- retry job queued
                                'retrying',          -- worker processing
                                'succeeded',         -- retry succeeded
                                'permanently_failed' -- retries exhausted / hard-block
                              )),
  next_retry_at   TIMESTAMPTZ DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_urls_session_id  ON scrape_urls (session_id);
CREATE INDEX IF NOT EXISTS idx_scrape_urls_status      ON scrape_urls (session_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scrape_urls_session_url ON scrape_urls (session_id, url);
CREATE INDEX IF NOT EXISTS idx_scrape_urls_retry_status
  ON scrape_urls (session_id, retry_status)
  WHERE retry_status IS NOT NULL;

-- Link documents back to the session that produced them.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS created_by_scrape_session_id UUID REFERENCES scrape_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS documents_created_by_scrape_session_id_idx
  ON documents (created_by_scrape_session_id);

-- ── 3. scrape_url_retries ────────────────────────────────────────────────────
-- Retry schedule (exponential back-off):
--   Attempt 1 → 5 min,  Attempt 2 → 30 min,  Attempt 3 → 2 hr
--   After 3 retries (4 total attempts) → permanently_failed

CREATE TABLE IF NOT EXISTS scrape_url_retries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_url_id   UUID        NOT NULL REFERENCES scrape_urls(id)     ON DELETE CASCADE,
  session_id      UUID        NOT NULL REFERENCES scrape_sessions(id)  ON DELETE CASCADE,
  kb_id           UUID        NOT NULL REFERENCES knowledge_bases(id)  ON DELETE CASCADE,
  url             TEXT        NOT NULL,
  attempt_number  INT         NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled', 'running', 'succeeded', 'failed')),
  error_code      TEXT        DEFAULT NULL,   -- WebLoadErrorCode
  error_message   TEXT        DEFAULT NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ DEFAULT NULL,
  completed_at    TIMESTAMPTZ DEFAULT NULL,
  next_retry_at   TIMESTAMPTZ DEFAULT NULL,
  job_id          TEXT        DEFAULT NULL,   -- BullMQ job tracking
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_url_retries_scrape_url_id ON scrape_url_retries (scrape_url_id);
CREATE INDEX IF NOT EXISTS idx_url_retries_session_id    ON scrape_url_retries (session_id);
CREATE INDEX IF NOT EXISTS idx_url_retries_job_id        ON scrape_url_retries (job_id) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_url_retries_url_attempt ON scrape_url_retries (scrape_url_id, attempt_number);

-- ── 4. updated_at triggers ───────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_scrape_sessions_updated_at') THEN
    CREATE TRIGGER trg_scrape_sessions_updated_at
      BEFORE UPDATE ON scrape_sessions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_scrape_urls_updated_at') THEN
    CREATE TRIGGER trg_scrape_urls_updated_at
      BEFORE UPDATE ON scrape_urls
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_scrape_url_retries_updated_at') THEN
    CREATE TRIGGER trg_scrape_url_retries_updated_at
      BEFORE UPDATE ON scrape_url_retries
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
