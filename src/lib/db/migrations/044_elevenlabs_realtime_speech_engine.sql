-- 044_elevenlabs_realtime_speech_engine.sql
-- Complete the ElevenLabs Realtime Voice capability catalogue.
-- Speech Engine is a realtime transport/voice layer; Clara remains the LLM/RAG brain.

INSERT INTO platform_ai_provider_capabilities (provider_id, capability, supported)
VALUES ('elevenlabs', 'realtime_voice', TRUE)
ON CONFLICT (provider_id, capability) DO UPDATE SET supported = TRUE;

INSERT INTO platform_ai_provider_models
  (provider_id, capability, kind, model_id, display_name, enabled, is_default, metadata)
VALUES
  ('elevenlabs', 'realtime_voice', 'realtime', 'elevenlabs-speech-engine',
   'ElevenLabs Speech Engine (Clara-controlled)', TRUE, TRUE,
   '{"transport":"speech_engine","brain":"clara","browserTransport":"webrtc","upstreamTransport":"wss"}'::jsonb),
  ('elevenlabs', 'realtime_voice', 'stt', 'scribe_v2_realtime',
   'Scribe v2 Realtime', TRUE, TRUE,
   '{"ownedBy":"elevenlabs-speech-engine"}'::jsonb),
  ('elevenlabs', 'realtime_voice', 'tts', 'eleven_flash_v2_5',
   'Eleven Flash v2.5', TRUE, TRUE,
   '{"ownedBy":"elevenlabs-speech-engine","latency":"low"}'::jsonb)
ON CONFLICT (provider_id, capability, kind, model_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    enabled = TRUE,
    metadata = EXCLUDED.metadata;

UPDATE platform_ai_provider_models
SET is_default = (model_id = 'elevenlabs-speech-engine')
WHERE provider_id = 'elevenlabs'
  AND capability = 'realtime_voice'
  AND kind = 'realtime';

UPDATE platform_ai_provider_models
SET is_default = (model_id = 'scribe_v2_realtime')
WHERE provider_id = 'elevenlabs'
  AND capability = 'realtime_voice'
  AND kind = 'stt';

UPDATE platform_ai_provider_models
SET is_default = (model_id = 'eleven_flash_v2_5')
WHERE provider_id = 'elevenlabs'
  AND capability = 'realtime_voice'
  AND kind = 'tts';
