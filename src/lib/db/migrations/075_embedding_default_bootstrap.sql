-- 075: The platform embedding default must always be resolvable.
--
-- Seen in production: the admin set the platform embedding default to
-- gemini/gemini-embedding-2-preview (shown Active in the UI). Google's
-- ListModels discovery does not advertise preview models, and a successful
-- sync disables rows that are missing from the discovery response — so the
-- default's row went stale/disabled, the resolver silently fell back to
-- gemini-embedding-001, and the automatic re-index built NEW indexes with a
-- different model than the migration notice promised. Query-time embeddings
-- resolved the same way only by luck.
--
-- This migration:
--   1. seeds a bootstrap row for gemini-embedding-2-preview (the static
--      catalogue ships its dimension/pricing contract) so fresh installs and
--      discovery-less environments can select it;
--   2. re-enables the row that IS the currently configured platform
--      embedding default when a prior discovery pass disabled it.

INSERT INTO platform_ai_provider_models (provider_id, capability, kind, model_id, display_name, is_default)
SELECT 'gemini', 'chat', 'embedding', 'gemini-embedding-2-preview', 'Gemini Embedding 2 Preview', FALSE
WHERE NOT EXISTS (
  SELECT 1
    FROM platform_ai_provider_models
   WHERE provider_id = 'gemini'
     AND capability = 'chat'
     AND kind = 'embedding'
     AND model_id = 'gemini-embedding-2-preview'
);

-- Re-enable the configured default's row (a discovery pass may have flagged
-- it stale). Does NOT touch any other row — vendor-live reconciliation stays
-- authoritative for everything the operator did not explicitly choose.
UPDATE platform_ai_provider_models m
   SET enabled = TRUE,
       metadata = m.metadata - 'stale' - 'staleAt',
       updated_at = now()
  FROM platform_ai_embedding_defaults d
 WHERE d.id IS TRUE
   AND d.provider_id = m.provider_id
   AND d.model_id = m.model_id
   AND m.kind = 'embedding'
   AND m.enabled = FALSE;
