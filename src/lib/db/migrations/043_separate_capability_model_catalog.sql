-- 043_separate_capability_model_catalog.sql
-- Keep Chat, Voice Chat and Realtime Voice as distinct model slots.
-- Sarvam realtime is a composed pipeline: conversational LLM + realtime STT + TTS.
-- The previous 041 migration stored the LLM rows as kind='chat', which made
-- them indistinguishable from the Chat capability in the resolver.

UPDATE platform_ai_provider_models
SET kind = 'realtime'
WHERE provider_id = 'sarvam'
  AND capability = 'realtime_voice'
  AND model_id IN ('sarvam-105b-conversations', 'sarvam-105b');

DELETE FROM platform_ai_provider_models
WHERE provider_id = 'sarvam'
  AND capability = 'realtime_voice'
  AND model_id IN ('gemma4', 'deepseekv4-flash', 'glm5.3');

INSERT INTO platform_ai_provider_models
  (provider_id, capability, kind, model_id, display_name, enabled, is_default)
VALUES
  ('sarvam', 'realtime_voice', 'realtime', 'sarvam-105b-conversations',
   'Sarvam 105B Conversations (32K)', TRUE, TRUE),
  ('sarvam', 'realtime_voice', 'realtime', 'sarvam-105b',
   'Sarvam 105B (128K)', TRUE, FALSE)
ON CONFLICT (provider_id, capability, kind, model_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    enabled = TRUE;

UPDATE platform_ai_provider_models
SET is_default = (model_id = 'sarvam-105b-conversations')
WHERE provider_id = 'sarvam'
  AND capability = 'realtime_voice'
  AND kind = 'realtime';

-- Realtime Voice gets its own speaker rows. The catalogue is shared data,
-- but the agent configuration slot is persisted independently.
INSERT INTO platform_ai_provider_models
  (provider_id, capability, kind, model_id, display_name, enabled, is_default)
SELECT
  'sarvam',
  'realtime_voice',
  'voice',
  model_id,
  display_name,
  TRUE,
  FALSE
FROM platform_ai_provider_models
WHERE provider_id = 'sarvam'
  AND capability = 'voice_chat'
  AND kind = 'voice'
ON CONFLICT (provider_id, capability, kind, model_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    enabled = TRUE;

UPDATE platform_ai_provider_models
SET is_default = (model_id = 'shubh')
WHERE provider_id = 'sarvam'
  AND capability = 'realtime_voice'
  AND kind = 'voice';

-- Realtime TTS is explicitly Bulbul v3.
INSERT INTO platform_ai_provider_models
  (provider_id, capability, kind, model_id, display_name, enabled, is_default)
VALUES
  ('sarvam', 'realtime_voice', 'tts', 'bulbul:v3', 'Bulbul v3', TRUE, TRUE)
ON CONFLICT (provider_id, capability, kind, model_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    enabled = TRUE;
