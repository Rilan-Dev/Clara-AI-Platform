-- 056: Managed FAQ items on the assistant config.
-- The FAQ tab (ElevenLabs-style) stores canonical Q/A pairs on the agent's
-- assistant config; they ride the draft → version → publish pipeline and are
-- injected into the composed system prompt at session time. JSONB keeps the
-- list shape flexible (id/question/answer) without a join table.

ALTER TABLE assistant_configs
  ADD COLUMN IF NOT EXISTS faq_items jsonb NOT NULL DEFAULT '[]'::jsonb;
