-- 055_plan_ai_provider_entitlements.sql
-- Subscription AI provider matrix:
-- Starter: OpenAI + Gemini
-- Pro: OpenAI + Gemini + Sarvam + ElevenLabs
-- Enterprise: OpenAI + Gemini + Sarvam + ElevenLabs
--
-- Migration 040 seeded all providers for all plans. Correct the persisted
-- entitlement data without modifying an already-applied migration.

INSERT INTO plan_ai_provider_entitlements (plan_id, provider_id, allowed)
VALUES
  ('free','openai',TRUE),('free','gemini',TRUE),('free','sarvam',FALSE),('free','elevenlabs',FALSE),
  ('starter','openai',TRUE),('starter','gemini',TRUE),('starter','sarvam',FALSE),('starter','elevenlabs',FALSE),
  ('pro','openai',TRUE),('pro','gemini',TRUE),('pro','sarvam',TRUE),('pro','elevenlabs',TRUE),
  ('enterprise','openai',TRUE),('enterprise','gemini',TRUE),('enterprise','sarvam',TRUE),('enterprise','elevenlabs',TRUE)
ON CONFLICT (plan_id, provider_id)
DO UPDATE SET allowed = EXCLUDED.allowed;

-- Migrate only the known legacy default; custom organisation allow-lists remain untouched.
UPDATE org_ai_settings
SET allowed_voice_providers = ARRAY['openai','gemini','elevenlabs','sarvam']::TEXT[],
    updated_at = now()
WHERE allowed_voice_providers = ARRAY['openai','gemini','elevenlabs']::TEXT[];

-- Provider entitlements are the fine-grained provider gate. Surface capability
-- gates remain explicit so subscription behavior is deterministic.
INSERT INTO plan_ai_capabilities (plan_id, capability, enabled)
VALUES
  ('free','chat',TRUE),('free','voice_chat',FALSE),('free','realtime_voice',FALSE),
  ('starter','chat',TRUE),('starter','voice_chat',TRUE),('starter','realtime_voice',TRUE),
  ('pro','chat',TRUE),('pro','voice_chat',TRUE),('pro','realtime_voice',TRUE),
  ('enterprise','chat',TRUE),('enterprise','voice_chat',TRUE),('enterprise','realtime_voice',TRUE)
ON CONFLICT (plan_id, capability)
DO UPDATE SET enabled = EXCLUDED.enabled;
