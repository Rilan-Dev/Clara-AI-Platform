-- ─────────────────────────────────────────────────────────────────────────────
-- 016_scrape_url_retries.sql
-- Persistent retry scheduler for failed scrape URLs.
--
-- Design:
--   • scrape_url_retries  — one row per retry attempt, full history preserved
--   • scrape_urls gets 3 new columns for fast retry-status queries
--
-- Retry schedule (exponential back-off):
--   Attempt 1 → 5 min,  Attempt 2 → 30 min,  Attempt 3 → 2 hr
--   After 3 retries (4 total attempts) → permanently_failed
--
-- Error classification:
--   Transient  (retryable): http-fetch-failed, playwright-failed, spa-shell,
--                            empty-content, soft-block, structured-empty
--   Permanent (no retry):   hard-block   (CAPTCHA / auth wall / IP ban)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add retry tracking columns to scrape_urls ──────────────────────────────

ALTER TABLE scrape_urls
  ADD COLUMN IF NOT EXISTS retry_count     INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_status    TEXT         DEFAULT NULL
    CHECK (retry_status IS NULL OR retry_status IN (
      'scheduled',         -- a retry job is queued in BullMQ
      'retrying',          -- worker is currently processing
      'succeeded',         -- retry succeeded, URL now completed
      'permanently_failed' -- max retries exhausted or hard-block
    )),
  ADD COLUMN IF NOT EXISTS next_retry_at   TIMESTAMPTZ  DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_scrape_urls_retry_status
  ON scrape_urls (session_id, retry_status)
  WHERE retry_status IS NOT NULL;

-- ── 2. scrape_url_retries — full attempt history ──────────────────────────────

CREATE TABLE IF NOT EXISTS scrape_url_retries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_url_id   UUID        NOT NULL REFERENCES scrape_urls(id)     ON DELETE CASCADE,
  session_id      UUID        NOT NULL REFERENCES scrape_sessions(id)  ON DELETE CASCADE,
  kb_id           UUID        NOT NULL REFERENCES knowledge_bases(id)  ON DELETE CASCADE,
  url             TEXT        NOT NULL,

  -- Which numbered retry this is (1 = first retry, 2 = second, 3 = third)
  attempt_number  INT         NOT NULL,

  -- Outcome
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN (
                                'scheduled',   -- BullMQ job enqueued, not started
                                'running',     -- worker picked up the job
                                'succeeded',   -- page loaded + ingested
                                'failed'       -- this attempt failed (may schedule next)
                              )),

  -- Failure details (populated on failure)
  error_code      TEXT        DEFAULT NULL,   -- WebLoadErrorCode
  error_message   TEXT        DEFAULT NULL,

  -- Timing
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ DEFAULT NULL,
  completed_at    TIMESTAMPTZ DEFAULT NULL,

  -- Next retry pointer (null if this is the final attempt or it succeeded)
  next_retry_at   TIMESTAMPTZ DEFAULT NULL,

  -- BullMQ job tracking
  job_id          TEXT        DEFAULT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_url_retries_scrape_url_id
  ON scrape_url_retries (scrape_url_id);

CREATE INDEX IF NOT EXISTS idx_url_retries_session_id
  ON scrape_url_retries (session_id);

CREATE INDEX IF NOT EXISTS idx_url_retries_job_id
  ON scrape_url_retries (job_id)
  WHERE job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_url_retries_url_attempt
  ON scrape_url_retries (scrape_url_id, attempt_number);

-- ── 3. updated_at trigger ─────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_scrape_url_retries_updated_at'
  ) THEN
    CREATE TRIGGER trg_scrape_url_retries_updated_at
      BEFORE UPDATE ON scrape_url_retries
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
