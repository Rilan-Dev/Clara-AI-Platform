-- ─────────────────────────────────────────────────────────────────────────────
-- 038_realtime_voice_provider.sql
-- Clara AI Platform — per-purpose voice provider selection.
--
-- Splits the voice axis into two purposes so a platform admin can express
-- BOTH of these configurations:
--
--   1. "Native by default" (unchanged): pick a chat provider and every
--      surface — chat, chat-window voice, realtime voice — uses that
--      provider's own models. Realised by leaving both voice columns NULL.
--
--   2. "Mixed on purpose": chat + chat-window voice-chat on one provider,
--      while the REALTIME voice assistant (floating voice modal, embed
--      voice surfaces, ElevenLabs Agents) runs on another. Example the
--      product asked for explicitly: chat + voice-chat = OpenAI,
--      real-time voice assistant = ElevenLabs Agents.
--
-- Resolution (voice-core/resolve.ts):
--   voice-chat purpose : kb.voice_provider → agent.voice_provider
--                        → org.voice_provider → brain provider (inherit)
--   realtime purpose   : kb.realtime_voice_provider → agent.realtime_voice_provider
--                        → org.realtime_voice_provider → voice-chat value (inherit)
--
-- realtime_voice_provider = NULL (the default for every existing tenant)
-- inherits the voice-chat axis, so all current behaviour is preserved
-- exactly; 'elevenlabs' routes realtime to Mode-B Agents (binding-gated,
-- pipeline fallback), 'openai' / 'gemini' route to their realtime APIs.
--
-- Purely additive: no existing column changes, no data backfill.
-- ─────────────────────────────────────────────────────────────────────────────

-- Org-level axis (the admin-facing surface; also settable per agent / per KB)
ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS realtime_voice_provider TEXT
    CHECK (realtime_voice_provider IS NULL
           OR realtime_voice_provider IN ('openai','gemini','elevenlabs','sarvam'));

COMMENT ON COLUMN org_ai_settings.realtime_voice_provider IS
  'Provider for the REALTIME voice assistant purpose (floating voice modal, embed voice surfaces, Agents/phone). NULL = inherit the voice-chat provider axis (voice_provider), which itself inherits the brain provider.';

-- Agent-level override
ALTER TABLE agent_ai_settings
  ADD COLUMN IF NOT EXISTS realtime_voice_provider TEXT
    CHECK (realtime_voice_provider IS NULL
           OR realtime_voice_provider IN ('openai','gemini','elevenlabs','sarvam'));

COMMENT ON COLUMN agent_ai_settings.realtime_voice_provider IS
  'Per-agent override of the realtime voice provider. NULL = inherit org / voice-chat axis.';

-- KB-level override
ALTER TABLE kb_ai_overrides
  ADD COLUMN IF NOT EXISTS realtime_voice_provider TEXT
    CHECK (realtime_voice_provider IS NULL
           OR realtime_voice_provider IN ('openai','gemini','elevenlabs','sarvam'));

COMMENT ON COLUMN kb_ai_overrides.realtime_voice_provider IS
  'Per-KB override of the realtime voice provider. NULL = inherit agent / org / voice-chat axis.';

-- Catalogue note: no new env keys — the realtime axis reuses the existing
-- provider keys and kill switches (ELEVENLABS_ENABLED, ELEVENLABS_API_KEY,
-- ELEVENLABS_CONVERSATIONAL_AI_ENABLED) already provisioned by 033/034.
