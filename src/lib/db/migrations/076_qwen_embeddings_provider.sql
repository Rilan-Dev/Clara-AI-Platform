-- 076: Register the self-hosted Qwen embeddings provider.
--
-- The heavyweight multilingual-e5-large TEI service (clara-embeddings,
-- ~2 GB RAM on CPU, never enabled on this deployment) was retired from
-- docker-compose.yml in favour of the llama.cpp `qwen-embeddings` service
-- serving Qwen3-Embedding-0.6B (Q8_0, 1024-d, 100+ languages, 32k context)
-- through an OpenAI-compatible /v1/embeddings endpoint.
--
-- This migration registers the provider on the governance axis so it is:
--   • visible in Settings → AI Platform → Providers and the Embeddings
--     workspace alongside OpenAI and Gemini (the third embedding provider);
--   • selectable as the platform embedding default (opt-in — the default
--     stays on the incumbent provider until an admin switches it);
--   • reachable at runtime through ProviderFactory ("qwen") with the
--     optional QWEN_API_KEY credential and QWEN_EMBEDDINGS_BASE_URL endpoint.
--
-- Capability rows: "chat" is the bucket embedding models live under for
-- every provider (kind "embedding"); qwen serves no voice/realtime surface.
-- The bootstrap model row is a fresh-install fallback — the live catalogue
-- sync (syncQwen) reconciles it against the server's /v1/models list and
-- stamps it vendor_live, exactly like the OpenAI/Gemini cycles.

-- 040's CHECK constraint pins the provider axis to the original four;
-- widen it BEFORE inserting the qwen row (dropped/re-added idempotently so
-- re-running after a partial manual application cannot fail).
ALTER TABLE platform_ai_providers DROP CONSTRAINT IF EXISTS platform_ai_providers_provider_id_check;
ALTER TABLE platform_ai_providers ADD CONSTRAINT platform_ai_providers_provider_id_check
  CHECK (provider_id IN ('openai', 'gemini', 'sarvam', 'elevenlabs', 'qwen'));

-- 053's embedding-defaults axis was openai/gemini only; qwen is now a
-- selectable embedding backbone too.
ALTER TABLE platform_ai_embedding_defaults DROP CONSTRAINT IF EXISTS platform_ai_embedding_defaults_provider_id_check;
ALTER TABLE platform_ai_embedding_defaults ADD CONSTRAINT platform_ai_embedding_defaults_provider_id_check
  CHECK (provider_id IN ('openai', 'gemini', 'qwen'));

INSERT INTO platform_ai_providers (provider_id, display_name, description, enabled) VALUES
  ('qwen', 'Qwen (local)', 'Self-hosted Qwen3-Embedding-0.6B embeddings via the llama.cpp qwen-embeddings service — no vendor billing, no egress', TRUE)
ON CONFLICT (provider_id) DO NOTHING;

INSERT INTO platform_ai_provider_credentials (provider_id, env_key, base_url_env_key) VALUES
  ('qwen', 'QWEN_API_KEY', 'QWEN_EMBEDDINGS_BASE_URL')
ON CONFLICT (provider_id) DO NOTHING;

INSERT INTO platform_ai_provider_capabilities (provider_id, capability, supported) VALUES
  ('qwen', 'chat',           TRUE),
  ('qwen', 'voice_chat',     FALSE),
  ('qwen', 'realtime_voice', FALSE)
ON CONFLICT (provider_id, capability) DO NOTHING;

INSERT INTO platform_ai_provider_models (provider_id, capability, kind, model_id, display_name, is_default, metadata)
SELECT 'qwen', 'chat', 'embedding', 'Qwen/Qwen3-Embedding-0.6B', 'Qwen3 Embedding 0.6B (local)', TRUE,
       jsonb_build_object('dimension', 1024, 'inputUsdPerMTokens', 0, 'local', TRUE)
WHERE NOT EXISTS (
  SELECT 1
    FROM platform_ai_provider_models
   WHERE provider_id = 'qwen'
     AND capability = 'chat'
     AND kind = 'embedding'
     AND model_id = 'Qwen/Qwen3-Embedding-0.6B'
);
