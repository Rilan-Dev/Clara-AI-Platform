-- 043 — Immutable knowledge-base snapshots for published agent versions.
CREATE TABLE IF NOT EXISTS agent_deployment_kb_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES agent_deployments(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  kb_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE RESTRICT,
  collection_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, kb_id)
);

CREATE INDEX IF NOT EXISTS agent_deployment_kb_snapshots_lookup_idx
  ON agent_deployment_kb_snapshots (agent_id, kb_id, created_at DESC);
