-- ─────────────────────────────────────────────────────────────────────────────
-- 037_phone_elevenlabs_engine.sql
-- Clara AI Platform — phone calls powered by ElevenLabs Agents.
--
-- Adds a per-KB voice ENGINE selector to phone_call_configs:
--   • 'openai'     (default) — existing bridge: Twilio Media Streams ⇄
--                             Clara WS relay ⇄ OpenAI Realtime (unchanged)
--   • 'elevenlabs'           — Twilio webhook returns the vendor's TwiML
--                             from POST /v1/convai/twilio/register-call;
--                             audio flows Twilio ⇄ ElevenLabs directly and
--                             the agent grounds answers through the Mode-B
--                             RAG server tool (real sub-second turns).
--
-- The 'elevenlabs' engine additionally requires an enabled, acknowledged
-- elevenlabs_agents binding for the KB's agent (enforced at call time,
-- not by schema). Purely additive — every existing config stays 'openai'
-- and behaves identically after this migration.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE phone_call_configs
  ADD COLUMN IF NOT EXISTS voice_engine TEXT NOT NULL DEFAULT 'openai'
    CHECK (voice_engine IN ('openai', 'elevenlabs'));

COMMENT ON COLUMN phone_call_configs.voice_engine IS
  'Realtime engine for live calls: openai (Clara relay ⇄ OpenAI Realtime) or elevenlabs (vendor Agents via register-call TwiML).';

-- Catalogue note: no new env keys. The engine reuses ELEVENLABS_API_KEY and
-- the Mode-B gates (ELEVENLABS_ENABLED, ELEVENLABS_CONVERSATIONAL_AI_ENABLED,
-- ELEVENLABS_TOOL_HMAC_SECRET) already provisioned by migration 034.
