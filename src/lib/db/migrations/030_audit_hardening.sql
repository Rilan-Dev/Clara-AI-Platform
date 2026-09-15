-- ─────────────────────────────────────────────────────────────────────────────
-- 030_audit_hardening.sql
-- Clara AI Platform — WS-1.4: tamper-evident, privacy-preserving audit trail.
--
-- The Q&A audit (query_events) stored raw prompts and answers. Two gaps:
--   1. PII (emails, phone numbers, payment identifiers) sat in plaintext in
--      a table every platform admin can read.
--   2. Rows were mutable (finalise UPDATEs answer_text) with no integrity
--      guarantee — a silent DB edit would be undetectable.
--
-- This migration adds:
--   • redactions JSONB — what was masked in this row, by type and count
--   • query_raw / answer_raw — the original text, kept ONLY when redaction
--     occurred, revealed solely through the super-admin justify-and-reveal
--     endpoint (each reveal is itself audited)
--   • prev_hash / row_hash — a per-org hash chain computed when a row reaches
--     its terminal state (finalise). Each row hashes its canonical content
--     together with the previous row's hash, so after-the-fact modification
--     breaks the chain visibly. /api/analytics/audit/verify recomputes it.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE query_events ADD COLUMN IF NOT EXISTS redactions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS query_raw  TEXT;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS answer_raw TEXT;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS prev_hash  TEXT;
ALTER TABLE query_events ADD COLUMN IF NOT EXISTS row_hash   TEXT;

-- Chain verification scans an org's hashed rows in created_at order.
CREATE INDEX IF NOT EXISTS query_events_chain_idx
  ON query_events (org_id, created_at)
  WHERE row_hash IS NOT NULL;

COMMENT ON COLUMN query_events.redactions IS 'Array of {type, count} entries listing what PII was masked in query_text/answer_text.';
COMMENT ON COLUMN query_events.query_raw  IS 'Original prompt BEFORE redaction — populated only when redaction occurred; access via audited super-admin reveal only.';
COMMENT ON COLUMN query_events.answer_raw IS 'Original answer BEFORE redaction — same restricted-access contract as query_raw.';
COMMENT ON COLUMN query_events.prev_hash  IS 'Hash of the previous finalised row in the org chain (NULL for the first row).';
COMMENT ON COLUMN query_events.row_hash   IS 'SHA-256 over prev_hash + canonical row content — recomputed by /api/analytics/audit/verify.';
