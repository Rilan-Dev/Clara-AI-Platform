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
SELECT
  TRUE,
  'openai',
  COALESCE(
    (
      SELECT pes.value
      FROM platform_env_settings pes
      JOIN platform_ai_provider_models pam
        ON pam.provider_id = 'openai'
       AND pam.capability = 'chat'
       AND pam.kind = 'embedding'
       AND pam.model_id = pes.value
       AND pam.enabled = TRUE
      WHERE pes.key = 'OPENAI_EMBEDDING_MODEL'
        AND pes.value IS NOT NULL
        AND pes.value <> ''
      LIMIT 1
    ),
    'text-embedding-3-small'
  )
ON CONFLICT (id) DO NOTHING;
