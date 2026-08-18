-- 027_demo_voice_provider.sql
-- Demo voice provider is controlled by Platform Admin -> Demo.
-- Visitors never select a provider; the server resolves it from these settings.

INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('DEMO_AI_PROVIDER', 'gemini',
   'AI provider used by the public visitor demo. Visitors never choose this value.',
   'demo', FALSE, FALSE),
  ('DEMO_GEMINI_API_KEY', '',
   'Gemini API key used exclusively by the public visitor demo voice/chat. Stored server-side.',
   'demo', TRUE, FALSE),
  ('DEMO_GEMINI_LIVE_MODEL', 'gemini-2.5-flash-native-audio-preview-12-2025',
   'Gemini Live model used by the public visitor demo voice.',
   'demo', FALSE, FALSE),
  ('DEMO_GEMINI_LIVE_VOICE', 'Aoede',
   'Gemini Live voice used by the public visitor demo.',
   'demo', FALSE, FALSE)
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_secret = EXCLUDED.is_secret,
    requires_restart = EXCLUDED.requires_restart;
