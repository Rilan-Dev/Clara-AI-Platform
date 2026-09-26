-- 059_multilingual_embeddings.sql
-- Multilingual knowledge index (ElevenLabs-style RAG index per embedding model).
--
--   • Platform admin: MULTILINGUAL_EMBEDDINGS_* runtime settings (endpoint,
--     key, model) — any Text Embeddings Inference / OpenAI-compatible
--     /v1/embeddings server (self-hosted on the VPS, or a hosted endpoint for
--     Vercel). Default model: intfloat/multilingual-e5-large-instruct — the
--     model ElevenLabs exposes as multilingual_e5_large_instruct.
--   • Subscription plans: multilingual_embeddings entitlement (plan + version).
--   • Knowledge bases: which index they should use (standard | multilingual)
--     and an org default for new knowledge bases.
--   • kb_vector_collections: which embedding model built each Qdrant
--     collection, so search and ingestion always embed with THAT model.
--   • kb_reindex_jobs: resumable re-index jobs (status, progress, cursor).
--
-- Purely additive: existing collections keep serving exactly as before.

-- ── Plan entitlement ────────────────────────────────────────────────────────
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS multilingual_embeddings BOOLEAN NOT NULL DEFAULT FALSE;
-- Versions override the plan when set; NULL inherits the plan value.
ALTER TABLE subscription_plan_versions
  ADD COLUMN IF NOT EXISTS multilingual_embeddings BOOLEAN;

UPDATE subscription_plans
   SET multilingual_embeddings = TRUE
 WHERE id IN ('pro', 'enterprise');

-- ── Knowledge base index choice + org default ───────────────────────────────
ALTER TABLE knowledge_bases
  ADD COLUMN IF NOT EXISTS embedding_index TEXT NOT NULL DEFAULT 'standard'
    CHECK (embedding_index IN ('standard', 'multilingual'));

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS default_embedding_index TEXT
    CHECK (default_embedding_index IS NULL OR default_embedding_index IN ('standard', 'multilingual'));

-- ── Collection → embedding model registry ───────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_vector_collections (
  collection_name    TEXT PRIMARY KEY,
  kb_id              UUID REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  embedding_index    TEXT NOT NULL DEFAULT 'standard'
                       CHECK (embedding_index IN ('standard', 'multilingual')),
  embedding_provider TEXT NOT NULL,
  embedding_model    TEXT NOT NULL,
  dimension          INT  NOT NULL CHECK (dimension > 0),
  role               TEXT NOT NULL DEFAULT 'live'
                       CHECK (role IN ('live', 'building', 'retired', 'snapshot')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_vector_collections_kb_idx
  ON kb_vector_collections (kb_id, role);

-- ── Re-index jobs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_reindex_jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id              UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  source_collection  TEXT NOT NULL,
  target_collection  TEXT NOT NULL,
  target_index       TEXT NOT NULL CHECK (target_index IN ('standard', 'multilingual')),
  embedding_provider TEXT NOT NULL,
  embedding_model    TEXT NOT NULL,
  dimension          INT  NOT NULL,
  status             TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  cursor             JSONB,
  points_total       INT  NOT NULL DEFAULT 0,
  points_done        INT  NOT NULL DEFAULT 0,
  error_message      TEXT,
  lease_until        TIMESTAMPTZ,
  requested_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);

-- At most one active job per knowledge base.
CREATE UNIQUE INDEX IF NOT EXISTS kb_reindex_jobs_active_uidx
  ON kb_reindex_jobs (kb_id) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS kb_reindex_jobs_kb_idx
  ON kb_reindex_jobs (kb_id, created_at DESC);

-- ── Platform admin runtime settings ─────────────────────────────────────────
INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('MULTILINGUAL_EMBEDDINGS_ENABLED',  'false',
   'Offer the multilingual knowledge index to entitled plans', 'ai', FALSE, FALSE),
  ('MULTILINGUAL_EMBEDDINGS_BASE_URL', '',
   'Text Embeddings Inference / OpenAI-compatible embeddings endpoint (e.g. http://embeddings:80)', 'ai', FALSE, FALSE),
  ('MULTILINGUAL_EMBEDDINGS_API_KEY',  '',
   'Bearer token for the multilingual embeddings endpoint (optional when self-hosted)', 'ai', TRUE, FALSE),
  ('MULTILINGUAL_EMBEDDINGS_MODEL',    'intfloat/multilingual-e5-large-instruct',
   'Multilingual embedding model id served by the endpoint', 'ai', FALSE, FALSE),
  ('MULTILINGUAL_EMBEDDINGS_DIMENSION', '',
   'Vector size — only needed for a model the platform does not know', 'ai', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;
