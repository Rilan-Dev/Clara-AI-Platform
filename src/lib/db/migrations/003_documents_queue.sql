-- ─────────────────────────────────────────────────────────────────────────────
-- 003_documents_queue.sql
-- Clara RAG — Phase 2: documents table + ingest_jobs worker queue
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. documents ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id             UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL,
  original_filename TEXT        NOT NULL,
  source_type       TEXT        NOT NULL DEFAULT 'upload'
                                  CHECK (source_type IN ('upload', 'url', 'api')),
  mime_type         TEXT,
  file_size         BIGINT,
  chunk_count       INT,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','processing','ready','failed')),
  error_message     TEXT,
  uploaded_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_kb_id_idx     ON documents (kb_id);
CREATE INDEX IF NOT EXISTS documents_status_idx    ON documents (status);
CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx ON documents (uploaded_by);

-- ── 2. ingest_jobs ────────────────────────────────────────────────────────────
-- Lightweight worker queue backed by PostgreSQL.
-- No Redis, no separate broker required.
-- Worker polls for 'pending' jobs, claims one atomically via SELECT FOR UPDATE SKIP LOCKED.

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  kb_id          UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','running','done','failed')),
  attempts       INT         NOT NULL DEFAULT 0,
  max_attempts   INT         NOT NULL DEFAULT 3,
  -- file_payload stores base64-encoded file content temporarily during processing.
  -- Cleared (set to NULL) once the job completes to reclaim storage.
  file_payload   JSONB,
  error_message  TEXT,
  scheduled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingest_jobs_status_idx        ON ingest_jobs (status);
CREATE INDEX IF NOT EXISTS ingest_jobs_scheduled_at_idx  ON ingest_jobs (scheduled_at);
CREATE INDEX IF NOT EXISTS ingest_jobs_document_id_idx   ON ingest_jobs (document_id);

-- ── 3. updated_at triggers ───────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TRIGGER documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
