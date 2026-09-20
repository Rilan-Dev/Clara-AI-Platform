-- 041_sarvam_realtime_settings.sql
-- Explicit, manageable Sarvam realtime voice-agent configuration.
-- Keep batch/chat defaults separate from realtime transport defaults.

INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('SARVAM_REALTIME_STT_MODEL',  'saaras:v3-realtime',         'Exact Saaras realtime WebSocket model (saaras:v3-realtime or saaras:v4).', 'ai', FALSE, TRUE),
  ('SARVAM_REALTIME_LLM_MODEL', 'sarvam-105b-conversations', 'LLM used by Sarvam realtime phone voice-agent sessions.', 'ai', FALSE, FALSE),
  ('SARVAM_REALTIME_TTS_ENABLED','true',                     'Enable streaming Bulbul WebSocket TTS for realtime voice sessions.', 'ai', FALSE, TRUE)
ON CONFLICT (key) DO NOTHING;
