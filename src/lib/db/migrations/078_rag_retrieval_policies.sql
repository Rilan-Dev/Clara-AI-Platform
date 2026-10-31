-- RAG retrieval policy control plane. The current user/request may NEVER
-- raise retrieval capability; policies are bound to server-resolved org+agent.
-- Published agent modes remain vector by default until graph readiness and
-- published KB snapshot parity have been verified.
CREATE TABLE IF NOT EXISTS org_rag_policies (
  org_id UUID PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  default_mode TEXT NOT NULL DEFAULT 'vector' CHECK (default_mode IN ('vector','hybrid','graph')),
  allowed_modes TEXT[] NOT NULL DEFAULT ARRAY['vector']::TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_rag_modes_valid CHECK (
    array_length(allowed_modes,1) BETWEEN 1 AND 3
    AND allowed_modes <@ ARRAY['vector','hybrid','graph']::TEXT[]
    AND allowed_modes @> ARRAY['vector']::TEXT[]
    AND default_mode = ANY(allowed_modes)
  )
);
CREATE TABLE IF NOT EXISTS agent_rag_policies (
  agent_id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  draft_mode TEXT NOT NULL DEFAULT 'vector' CHECK (draft_mode IN ('vector','hybrid','graph')),
  published_mode TEXT NOT NULL DEFAULT 'vector' CHECK (published_mode IN ('vector','hybrid','graph')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (agent_id,org_id) REFERENCES agents(id,org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_rag_policies_org_idx ON agent_rag_policies(org_id);
DO $$ BEGIN
  CREATE TRIGGER org_rag_policies_updated_at BEFORE UPDATE ON org_rag_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER agent_rag_policies_updated_at BEFORE UPDATE ON agent_rag_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
