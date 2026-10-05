-- 064_sarvam_realtime_streaming.sql
-- The Sarvam realtime voice agent now always streams (Saaras realtime STT
-- WebSocket + Bulbul streaming TTS WebSocket). The one-shot REST STT/TTS
-- pipeline moved to the chat window's Voice Chat.
--
-- • SARVAM_REALTIME_STT_ENABLED only chose between the streaming relay and
--   the REST fallback for the realtime agent — that fallback no longer
--   exists, so the setting is retired.
-- • New platform-admin tuning for realtime endpointing and speaking pace
--   (Settings → AI → Sarvam). Empty = documented defaults.

DELETE FROM platform_env_settings WHERE key = 'SARVAM_REALTIME_STT_ENABLED';

INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('SARVAM_REALTIME_VAD_THRESHOLD', '',
   'Realtime STT speech probability threshold (0.05–0.95, default 0.3)', 'ai', FALSE, FALSE),
  ('SARVAM_REALTIME_SILENCE_MS', '',
   'Silence that ends a caller turn in ms (100–3000, default 500)', 'ai', FALSE, FALSE),
  ('SARVAM_REALTIME_MIN_SPEECH_MS', '',
   'Shortest sound treated as speech in ms (50–2000, default 250)', 'ai', FALSE, FALSE),
  ('SARVAM_TTS_PACE', '',
   'Bulbul speaking pace for realtime voice and phone calls (0.5–2.0, default 1.0)', 'ai', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;
