-- 021_demo_ai_provider.sql
-- Demo AI runtime configuration managed from Platform Admin.
-- Visitors never choose provider, model, KB, or organisation.

-- Older migration 020 restricted categories before the Demo category was added.
ALTER TABLE platform_env_settings
  DROP CONSTRAINT IF EXISTS platform_env_settings_category_check;

ALTER TABLE platform_env_settings
  ADD CONSTRAINT platform_env_settings_category_check
  CHECK (category IN ('general','ai','phone','auth','billing','email','demo'));

INSERT INTO platform_env_settings
  (key, value, description, category, is_secret, requires_restart)
VALUES
  -- ('DEMO_AI_PROVIDER', 'openai',
  --  'AI provider used by the public Demo visitor experience (openai|gemini). Visitors cannot change this.',
  --  'demo', FALSE, FALSE),
  -- ('DEMO_OPENAI_API_KEY', '',
  --  'OpenAI API key used only by the public Demo experience.',
  --  'demo', TRUE, FALSE),
  -- ('DEMO_OPENAI_CHAT_MODEL', 'gpt-5.4-mini',
  --  'OpenAI chat model used for Demo RAG answer generation.',
  --  'demo', FALSE, FALSE),
  -- ('DEMO_OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small',
  --  'OpenAI embedding model used by Demo RAG retrieval. Must match the indexed Demo KB vectors.',
  --  'demo', FALSE, FALSE),
  -- ('DEMO_OPENAI_REALTIME_MODEL', 'gpt-realtime-mini',
  --  'OpenAI realtime model used by Demo voice.',
  --  'demo', FALSE, FALSE),
  -- ('DEMO_OPENAI_TRANSCRIPTION_MODEL', 'gpt-4o-mini-transcribe',
  --  'OpenAI transcription model used by Demo voice.',
  --  'demo', FALSE, FALSE),
  -- ('DEMO_OPENAI_VOICE', 'alloy',
  --  'OpenAI voice used by Demo realtime conversations.',
  --  'demo', FALSE, FALSE),
  -- ('DEMO_GEMINI_API_KEY', '',
  --  'Optional Gemini API key for a future Demo provider switch. Leave empty when using OpenAI.',
  --  'demo', TRUE, FALSE),
  -- ('DEMO_GEMINI_CHAT_MODEL', 'gemini-3.6-flash',
  --  'Gemini chat model used if Demo provider is switched to Gemini.',
  --  'demo', FALSE, FALSE),
  -- ('DEMO_GEMINI_LIVE_MODEL', '',
  --  'Gemini realtime model used if Demo provider is switched to Gemini.',
  --  'demo', FALSE, FALSE),
  -- ('DEMO_GEMINI_LIVE_VOICE', 'Aoede',
  --  'Gemini voice used if Demo provider is switched to Gemini.',
  --  'demo', FALSE, FALSE),

  ('DEMO_CLARA_API_KEY', 'clr_463c2914ca2872807a82189a0d0b30d0d8c68322eed688c3',
   'Clara API key for Demo environment for Landing Page.',
   'demo', FALSE, FALSE)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_secret = EXCLUDED.is_secret,
  requires_restart = EXCLUDED.requires_restart;

-- -- If an older deployment already has a Gemini demo provider configured but no
-- -- Gemini credential, make OpenAI the safe production default.
-- UPDATE platform_env_settings
-- SET value = 'openai', updated_at = now()
-- WHERE key = 'DEMO_AI_PROVIDER'
--   AND COALESCE(value, '') = 'gemini'
--   AND NOT EXISTS (
--     SELECT 1
--     FROM platform_env_settings s
--     WHERE s.key = 'DEMO_GEMINI_API_KEY' AND length(trim(s.value)) > 0
--   );
