-- 021_demo_ai_settings.sql
-- Platform Admin -> Demo runtime configuration.
-- Demo visitors never choose KB/provider/model; these settings are authoritative.

ALTER TABLE platform_env_settings
  DROP CONSTRAINT IF EXISTS platform_env_settings_category_check;

ALTER TABLE platform_env_settings
  ADD CONSTRAINT platform_env_settings_category_check
  CHECK (category IN ('general','ai','phone','auth','billing','email','demo'));

INSERT INTO platform_env_settings
  (key, value, description, category, is_secret, requires_restart)
VALUES
  ('DEMO_ENABLED', 'true',
   'Enable the public Demo landing experience.', 'demo', FALSE, FALSE),
  ('DEMO_CHAT_ENABLED', 'true',
   'Enable public Demo text chat.', 'demo', FALSE, FALSE),
  ('DEMO_VOICE_ENABLED', 'true',
   'Enable public Demo voice conversation.', 'demo', FALSE, FALSE),
  ('DEMO_ORG_ID', '10000000-0000-0000-0000-000000000001',
   'Organisation used by the public Demo.', 'demo', FALSE, FALSE),
  ('DEMO_KB_ID', '30000000-0000-0000-0000-000000000001',
   'Knowledge base automatically used by Demo visitors. Visitors never select this.', 'demo', FALSE, FALSE),
  ('DEMO_KB_NAME', 'Home Insurance Policies',
   'Display name for the Demo knowledge base.', 'demo', FALSE, FALSE),
  ('DEMO_AI_PROVIDER', 'openai',
   'AI provider for public Demo chat, RAG retrieval, and voice (openai|gemini).', 'demo', FALSE, FALSE),
  ('DEMO_OPENAI_API_KEY', '',
   'OpenAI API key used exclusively by the public Demo. Enter this in Platform Admin.', 'demo', TRUE, FALSE),
  ('DEMO_OPENAI_CHAT_MODEL', 'gpt-4o-mini',
   'OpenAI chat model used by public Demo RAG answers.', 'demo', FALSE, FALSE),
  ('DEMO_OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small',
   'OpenAI embedding model used by public Demo retrieval. Must match indexed vector dimensions.', 'demo', FALSE, FALSE),
  ('DEMO_OPENAI_REALTIME_MODEL', 'gpt-realtime-mini',
   'OpenAI Realtime model used by public Demo voice.', 'demo', FALSE, FALSE),
  ('DEMO_OPENAI_VOICE', 'alloy',
   'OpenAI Realtime voice used by public Demo.', 'demo', FALSE, FALSE),
  ('DEMO_OPENAI_TRANSCRIPTION_MODEL', 'gpt-4o-mini-transcribe',
   'OpenAI transcription model used by public Demo voice.', 'demo', FALSE, FALSE),
  ('DEMO_RATE_LIMIT_PER_HOUR', '120',
   'Maximum Demo requests per hour.', 'demo', FALSE, FALSE),
  ('DEMO_MAX_REQUESTS_PER_DAY', '2000',
   'Maximum Demo requests per day.', 'demo', FALSE, FALSE),
  ('DEMO_GEMINI_API_KEY', '',
   'Optional Gemini API key when Demo provider is switched to Gemini.', 'demo', TRUE, FALSE),
  ('DEMO_GEMINI_CHAT_MODEL', 'gemini-3.6-flash',
   'Gemini chat model used when Demo provider is Gemini.', 'demo', FALSE, FALSE),
  ('DEMO_GEMINI_LIVE_MODEL', '',
   'Gemini Live model used when Demo provider is Gemini.', 'demo', FALSE, FALSE),
  ('DEMO_GEMINI_LIVE_VOICE', 'Aoede',
   'Gemini Live voice used when Demo provider is Gemini.', 'demo', FALSE, FALSE)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_secret = EXCLUDED.is_secret,
  requires_restart = EXCLUDED.requires_restart;

UPDATE platform_env_settings
SET value = 'openai'
WHERE key = 'DEMO_AI_PROVIDER' AND COALESCE(value, '') = '';
