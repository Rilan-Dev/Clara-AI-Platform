-- 053_platform_embedding_defaults.sql
-- Dedicated platform embedding backbone used by document ingestion/scraping.
-- Embeddings are intentionally separate from chat/realtime model defaults.

CREATE TABLE IF NOT EXISTS platform_ai_embedding_defaults (
  id          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  provider_id TEXT NOT NULL REFERENCES platform_ai_providers(provider_id),
  model_id    TEXT NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (provider_id IN ('openai', 'gemini'))
);

INSERT INTO platform_ai_embedding_defaults (id, provider_id, model_id)
VALUES (TRUE, 'openai', 'text-embedding-3-small')
ON CONFLICT (id) DO NOTHING;
