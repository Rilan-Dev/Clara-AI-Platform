-- AI Platform Configuration (centralized for all orgs/projects/KBs)
-- This adds all AI provider, model, token limit, and feature flag settings
-- to the platform_env_settings table under the 'ai' category.

-- Ensure 'ai' category is allowed
ALTER TABLE platform_env_settings
  DROP CONSTRAINT IF EXISTS platform_env_settings_category_check;

ALTER TABLE platform_env_settings
  ADD CONSTRAINT platform_env_settings_category_check
  CHECK (category IN ('general','ai','phone','auth','billing','email','demo','platform','payments'));

-- OpenAI Configuration
INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('OPENAI_API_KEY', '', 'OpenAI API Key', 'ai', true, false),
  ('OPENAI_CHAT_MODEL', 'gpt-5.6-luna', 'OpenAI chat model', 'ai', false, false),
  ('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small', 'OpenAI embedding model', 'ai', false, false),
  ('OPENAI_REALTIME_MODEL', 'gpt-realtime-2.1-mini', 'OpenAI realtime model', 'ai', false, false),
  ('OPENAI_TRANSCRIPTION_MODEL', 'gpt-realtime-whisper', 'OpenAI transcription model', 'ai', false, false),
  ('OPENAI_DEFAULT_VOICE', 'alloy', 'OpenAI default voice', 'ai', false, false)
ON CONFLICT (key) DO NOTHING;

-- Gemini Configuration
INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('GEMINI_API_KEY', '', 'Gemini API Key', 'ai', true, false),
  ('GEMINI_CHAT_MODEL', 'gemini-3.7-flash', 'Gemini chat model', 'ai', false, false),
  ('GEMINI_EMBEDDING_MODEL', 'text-embedding-004', 'Gemini embedding model', 'ai', false, false),
  ('GEMINI_REALTIME_MODEL', 'gemini-3.7-flash-preview-tts', 'Gemini realtime model', 'ai', false, false),
  ('GEMINI_TRANSCRIPTION_MODEL', 'gemini-3.7-flash', 'Gemini transcription model', 'ai', false, false),
  ('GEMINI_DEFAULT_VOICE', 'Puck', 'Gemini default voice', 'ai', false, false)
ON CONFLICT (key) DO NOTHING;

-- AI Provider Selection
INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('AI_PROVIDER', 'openai', 'Active AI provider (openai|gemini)', 'ai', false, false)
ON CONFLICT (key) DO NOTHING;

-- AI Limits (apply globally)
INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('AI_MAX_CHAT_TOKENS', '4000', 'Maximum chat tokens per request', 'ai', false, false),
  ('AI_MAX_REALTIME_TOKENS', '1000', 'Maximum realtime tokens per request', 'ai', false, false),
  ('AI_MAX_TEMPERATURE', '1.0', 'Maximum temperature (0-1)', 'ai', false, false)
ON CONFLICT (key) DO NOTHING;

-- Phone Provider Configuration (already in 020, but ensuring complete)
INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('TWILIO_ACCOUNT_SID', '', 'Twilio Account SID', 'phone', true, false),
  ('TWILIO_AUTH_TOKEN', '', 'Twilio Auth Token', 'phone', true, false),
  ('TWILIO_PHONE_NUMBER', '', 'Default Twilio phone number', 'phone', false, false),
  ('VONAGE_API_KEY', '', 'Vonage API Key', 'phone', true, false),
  ('VONAGE_API_SECRET', '', 'Vonage API Secret', 'phone', true, false),
  ('VONAGE_PHONE_NUMBER', '', 'Default Vonage phone number', 'phone', false, false),
  ('PHONE_PROVIDER', 'twilio', 'Active phone provider (twilio|vonage)', 'phone', false, false)
ON CONFLICT (key) DO NOTHING;
