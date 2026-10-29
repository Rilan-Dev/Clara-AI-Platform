-- 077: Qwen is an embeddings-only provider — remove it from the chat capability.
--
-- 076 registered the qwen provider with chat capability TRUE, reasoning that
-- "chat is the bucket embedding models live under for every provider". That
-- conflated two different axes:
--
--   • the MODEL-ROW capability axis (schema convention: embedding rows are
--     stored with capability='chat', kind='embedding' — unchanged), and
--   • the ADAPTER-capability matrix (platform_ai_provider_capabilities),
--     which gates which providers are OFFERED on each surface.
--
-- The consequence in production: the local Qwen provider appeared in the
-- Chat provider picker even though Qwen3-Embedding-0.6B cannot generate a
-- single token (QwenEmbeddingProvider.chatStream() throws). An operator
-- could select it as the agent's chat brain and get a broken assistant.
--
-- The capability row must reflect what the adapter can actually SERVE on the
-- surface. Qwen serves embeddings only: chat → FALSE. Embedding availability
-- is unaffected — it is driven by platform_ai_embedding_defaults (qwen is a
-- selectable embedding backbone; the CHECK constraint from 076 stays) and the
-- Embeddings workspace, neither of which reads this row. Runtime chat model
-- resolution was already kind-scoped ('chat'), so nothing else changes.

UPDATE platform_ai_provider_capabilities
   SET supported = FALSE
 WHERE provider_id = 'qwen'
   AND capability = 'chat';
