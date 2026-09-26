-- 057_elevenlabs_realtime_defaults.sql
-- ElevenLabs current-model migration and independent realtime defaults.
-- Keeps Voice Chat and Realtime Voice settings separate while removing
-- deprecated Scribe v1 defaults from the active configuration surface.

-- Scribe v1 was removed by ElevenLabs in July 2026.
UPDATE platform_env_settings
   SET value = 'scribe_v2',
       description = 'ElevenLabs default Voice Chat STT model (Scribe v2).'
 WHERE key = 'ELEVENLABS_DEFAULT_STT_MODEL'
   AND value = 'scribe_v1';

INSERT INTO platform_env_settings
  (key, value, description, category, is_secret, requires_restart)
VALUES
  ('ELEVENLABS_REALTIME_STT_MODEL', 'scribe_v2_realtime',
   'Dedicated ElevenLabs Scribe v2 Realtime WebSocket model.', 'ai', FALSE, TRUE),
  ('ELEVENLABS_REALTIME_TTS_MODEL', 'eleven_flash_v2_5',
   'Dedicated low-latency ElevenLabs realtime TTS model.', 'ai', FALSE, TRUE)
ON CONFLICT (key) DO NOTHING;

-- Retire the removed model from the governance picker without deleting
-- historical configuration rows.
UPDATE platform_ai_provider_models
   SET enabled = FALSE,
       is_default = FALSE,
       updated_at = now()
 WHERE provider_id = 'elevenlabs'
   AND model_id = 'scribe_v1';

INSERT INTO platform_ai_provider_models
  (provider_id, capability, kind, model_id, display_name, enabled, is_default)
VALUES
  ('elevenlabs', 'voice_chat', 'stt', 'scribe_v2', 'Scribe v2', TRUE, TRUE),
  ('elevenlabs', 'realtime_voice', 'stt', 'scribe_v2_realtime', 'Scribe v2 Realtime', TRUE, TRUE),
  ('elevenlabs', 'realtime_voice', 'tts', 'eleven_flash_v2_5', 'Eleven Flash v2.5 (low latency)', TRUE, TRUE)
ON CONFLICT (provider_id, capability, kind, model_id) DO UPDATE
  SET enabled = TRUE,
      is_default = EXCLUDED.is_default,
      updated_at = now();

-- There must be only one default per provider/capability/kind. Clear stale
-- defaults before assigning the current model above.
UPDATE platform_ai_provider_models m
   SET is_default = FALSE,
       updated_at = now()
 WHERE m.provider_id = 'elevenlabs'
   AND m.capability = 'voice_chat'
   AND m.kind = 'stt'
   AND m.model_id <> 'scribe_v2';

UPDATE platform_ai_provider_models m
   SET is_default = FALSE,
       updated_at = now()
 WHERE m.provider_id = 'elevenlabs'
   AND m.capability = 'realtime_voice'
   AND m.kind = 'stt'
   AND m.model_id <> 'scribe_v2_realtime';

UPDATE platform_ai_provider_models m
   SET is_default = FALSE,
       updated_at = now()
 WHERE m.provider_id = 'elevenlabs'
   AND m.capability = 'realtime_voice'
   AND m.kind = 'tts'
   AND m.model_id <> 'eleven_flash_v2_5';
