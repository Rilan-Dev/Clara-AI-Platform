-- A graph is accepted only for the exact Qdrant collection, not just kb_id.
-- Fail closed: no row and any index mutation imply state other than ready.
CREATE TABLE IF NOT EXISTS rag_graph_snapshot_readiness (
  kb_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  collection_name TEXT NOT NULL,
  graph_scope_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stale'
    CHECK (status IN ('stale','verified')),
  extractor_version TEXT NOT NULL,
  source_chunks INTEGER NOT NULL DEFAULT 0 CHECK (source_chunks >= 0),
  graph_documents INTEGER NOT NULL DEFAULT 0 CHECK (graph_documents >= 0),
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kb_id, collection_name),
  CONSTRAINT graph_verified_has_evidence CHECK (
    status <> 'verified' OR (verified_at IS NOT NULL AND source_chunks > 0 AND graph_documents > 0)
  )
);
CREATE INDEX IF NOT EXISTS rag_graph_snapshot_status_idx
  ON rag_graph_snapshot_readiness(kb_id,status);
