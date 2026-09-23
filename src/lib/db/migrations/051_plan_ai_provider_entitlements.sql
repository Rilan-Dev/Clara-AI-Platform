-- 051_plan_ai_provider_entitlements.sql
-- Clara AI Platform — enforce subscription-level AI provider access.
--
-- Product entitlement contract:
--   Starter: OpenAI + Gemini
--   Pro: OpenAI + Gemini + Sarvam + ElevenLabs
--   Enterprise: all four
--
-- Migration 040 initially seeded every provider on every plan. This migration
-- corrects that data without editing an already-applied migration.
--
-- Organisation allow-lists remain a tenant-level administrative control.
-- Existing rows created before Sarvam was added to the voice axis received the
-- legacy [openai, gemini, elevenlabs] default; append Sarvam so Pro/Enterprise
-- tenants can actually select it. Starter remains blocked by plan entitlement.

INSERT INTO plan_ai_provider_entitlements (plan_id, provider_id, allowed)
VALUES
  ('free',      'openai',      TRUE),
  ('free',      'gemini',      TRUE),
  ('free',      'sarvam',     FALSE),
  ('free',      'elevenlabs', FALSE),
  ('starter',   'openai',      TRUE),
  ('starter',   'gemini',      TRUE),
  ('starter',   'sarvam',     FALSE),
  ('starter',   'elevenlabs', FALSE),
  ('pro',       'openai',      TRUE),
  ('pro',       'gemini',      TRUE),
  ('pro',       'sarvam',      TRUE),
  ('pro',       'elevenlabs',  TRUE),
  ('enterprise','openai',      TRUE),
  ('enterprise','gemini',      TRUE),
  ('enterprise','sarvam',      TRUE),
  ('enterprise','elevenlabs',  TRUE)
ON CONFLICT (plan_id, provider_id)
DO UPDATE SET allowed = EXCLUDED.allowed;

-- Existing organisation rows were created with the pre-Sarvam voice default.
-- Do not overwrite custom allow-lists; only extend the exact legacy default.
UPDATE org_ai_settings
   SET allowed_voice_providers = ARRAY['openai','gemini','elevenlabs','sarvam']::TEXT[],
       updated_at = now()
 WHERE allowed_voice_providers = ARRAY['openai','gemini','elevenlabs']::TEXT[];

-- Keep plan capability gates explicit for all tiers. Provider entitlements
-- are the fine-grained provider restriction; capabilities control whether
-- the whole voice surface exists on the plan.
INSERT INTO plan_ai_capabilities (plan_id, capability, enabled)
VALUES
  ('free', 'chat', TRUE),
  ('free', 'voice_chat', FALSE),
  ('free', 'realtime_voice', FALSE),
  ('starter', 'chat', TRUE),
  ('starter', 'voice_chat', TRUE),
  ('starter', 'realtime_voice', TRUE),
  ('pro', 'chat', TRUE),
  ('pro', 'voice_chat', TRUE),
  ('pro', 'realtime_voice', TRUE),
  ('enterprise', 'chat', TRUE),
  ('enterprise', 'voice_chat', TRUE),
  ('enterprise', 'realtime_voice', TRUE)
ON CONFLICT (plan_id, capability)
DO UPDATE SET enabled = EXCLUDED.enabled;
