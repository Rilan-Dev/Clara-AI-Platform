-- 074_ai_sts_model_kind.sql
-- Speech-to-speech (STS) realtime models for the governance catalogue.
--
-- ElevenLabs ships conversational realtime models (e.g. eleven_v3_conversational)
-- that drive speech-to-speech sessions. Until now they could only be catalogued
-- as kind='tts', which hid them from the Realtime Voice half-canvas and made it
-- impossible for a platform admin to see/configure the STT + STS model pair the
-- realtime pipeline actually uses (scribe_v2_realtime + a conversational TTS/STS
-- model). Add a dedicated 'sts' kind to both kind-constrained tables.

ALTER TABLE platform_ai_provider_models
  DROP CONSTRAINT IF EXISTS platform_ai_provider_models_kind_check;

ALTER TABLE platform_ai_provider_models
  ADD CONSTRAINT platform_ai_provider_models_kind_check
  CHECK (kind IN ('chat', 'embedding', 'realtime', 'transcription', 'tts', 'stt', 'voice', 'sts'));

ALTER TABLE plan_ai_model_entitlements
  DROP CONSTRAINT IF EXISTS plan_ai_model_entitlements_kind_check;

ALTER TABLE plan_ai_model_entitlements
  ADD CONSTRAINT plan_ai_model_entitlements_kind_check
  CHECK (kind IN ('chat', 'embedding', 'realtime', 'transcription', 'tts', 'stt', 'voice', 'sts'));
