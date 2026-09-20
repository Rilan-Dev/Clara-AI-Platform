-- 041_sarvam_realtime_model_catalog.sql
-- Complete the governance catalogue for the Sarvam realtime pipeline.
-- Migration 040 seeded Saaras realtime STT but omitted the conversational LLM
-- and Bulbul TTS entries from the realtime_voice capability.

INSERT INTO platform_ai_provider_models
  (provider_id, capability, kind, model_id, display_name, enabled, is_default)
VALUES
  ('sarvam', 'realtime_voice', 'chat', 'sarvam-105b-conversations',
   'Sarvam 105B Conversations (32K)', TRUE, TRUE),
  ('sarvam', 'realtime_voice', 'chat', 'sarvam-105b',
   'Sarvam 105B (128K)', TRUE, FALSE),
  ('sarvam', 'realtime_voice', 'chat', 'gemma4',
   'Gemma 4 31B (beta)', TRUE, FALSE),
  ('sarvam', 'realtime_voice', 'chat', 'deepseekv4-flash',
   'DeepSeek V4 Flash (beta)', TRUE, FALSE),
  ('sarvam', 'realtime_voice', 'chat', 'glm5.3',
   'GLM 5.3 (beta, reasons)', TRUE, FALSE),
  ('sarvam', 'realtime_voice', 'tts', 'bulbul:v3',
   'Bulbul v3', TRUE, TRUE)
ON CONFLICT (provider_id, capability, kind, model_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    enabled = TRUE;

UPDATE platform_ai_provider_models
SET is_default = FALSE
WHERE provider_id = 'sarvam'
  AND capability = 'realtime_voice'
  AND kind = 'chat'
  AND model_id <> 'sarvam-105b-conversations';

UPDATE platform_ai_provider_models
SET is_default = TRUE
WHERE provider_id = 'sarvam'
  AND capability = 'realtime_voice'
  AND kind = 'chat'
  AND model_id = 'sarvam-105b-conversations';
