-- Increment a per-snapshot generation on every vector mutation.
-- Graph verification must compare the generation before marking any graph ready.
ALTER TABLE rag_graph_snapshot_readiness
  ADD COLUMN IF NOT EXISTS mutation_generation BIGINT NOT NULL DEFAULT 0;
