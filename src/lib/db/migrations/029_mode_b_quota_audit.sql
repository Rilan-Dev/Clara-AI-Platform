-- ─────────────────────────────────────────────────────────────────────────────
-- 029_mode_b_quota_audit.sql
-- Clara AI Platform — WS-1.2: close the legacy Mode-B bypass.
--
-- Legacy document-scoped chat (POST /api/chat with documentId instead of
-- kbId) previously skipped BOTH the daily request quota and the query audit
-- trail — an enforcement hole. Workspace chat is authenticated, so the
-- caller's org membership supplies quota attribution; but legacy documents
-- live in the Qdrant catalog, not in a knowledge_bases row, so their audit
-- rows have no kb_id.
--
-- kb_id becomes nullable: Mode-B rows are inserted with kb_id NULL and
-- org_id set, so they count toward the org's rolling-24h quota (the quota
-- filters on org_id, never kb_id) and appear in the Q&A audit feeds.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE query_events ALTER COLUMN kb_id DROP NOT NULL;

COMMENT ON COLUMN query_events.kb_id IS 'NULL for legacy document-scoped chat (Mode B) — org attribution still applies via org_id.';
