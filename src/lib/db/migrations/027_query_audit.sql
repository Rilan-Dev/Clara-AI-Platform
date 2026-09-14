-- ─────────────────────────────────────────────────────────────────────────────
-- 027_query_audit.sql
-- Clara AI Platform — full query audit trail.
--
-- query_events previously stored only the raw question (query_text) plus
-- retrieval telemetry. Platform admins had no way to audit what the AI
-- actually answered, and org dashboards could not show a Q&A feed.
--
-- This migration upgrades query_events into a complete audit record:
--   • org_id     — denormalised org (fast platform-admin queries, no joins)
--   • user_id    — who asked (NULL for anonymous embed visitors)
--   • answer_text— the AI-generated answer (persisted after streaming ends)
--   • surface   — where it came from: workspace | embed | voice | search
--   • status    — pending (stream started) | ok (answered) | error (failed)
--
-- Rows are inserted at request time with status='pending' so daily request
-- quotas count immediately (no bypass via aborted streams), then finalised
-- with the answer once the stream completes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New columns ───────────────────────────────────────────────────────────

ALTER TABLE query_events ADD COLUMN IF NOT EXISTS org_id      UUID REFERENCES organisations(id) ON DELETE CASCADE;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS user_id     UUID REFERENCES users(id)         ON DELETE SET NULL;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS answer_text TEXT;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS surface     TEXT NOT NULL DEFAULT 'workspace'
  CHECK (surface IN ('workspace','embed','voice','search'));
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'ok'
  CHECK (status IN ('pending','ok','error'));

-- ── 2. Backfill org_id for existing rows (kb → agent → org) ──────────────────

UPDATE query_events qe
   SET org_id = a.org_id
  FROM knowledge_bases kb
  JOIN agents a ON a.id = kb.agent_id
 WHERE kb.id = qe.kb_id
   AND qe.org_id IS NULL;

-- ── 3. Indexes ───────────────────────────────────────────────────────────────
-- (org_id, created_at) powers the per-org daily-request quota check, the org
-- dashboard "queries today" KPI and the platform-admin audit feed.

CREATE INDEX IF NOT EXISTS query_events_org_created_idx  ON query_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS query_events_user_id_idx     ON query_events (user_id);
CREATE INDEX IF NOT EXISTS query_events_status_idx      ON query_events (status);
