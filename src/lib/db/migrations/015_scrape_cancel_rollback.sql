ALTER TABLE scrape_sessions
  ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS created_by_scrape_session_id UUID REFERENCES scrape_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_created_by_scrape_session_id_idx
  ON documents (created_by_scrape_session_id);
