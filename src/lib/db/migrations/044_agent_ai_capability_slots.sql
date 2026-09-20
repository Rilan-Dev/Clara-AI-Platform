-- 044_agent_ai_capability_slots.sql
-- Persist independent agent-level model/voice selections for each runtime
-- capability. Existing columns remain for backward compatibility.

ALTER TABLE agent_ai_settings
  ADD COLUMN IF NOT EXISTS voice_chat_stt_model TEXT,
  ADD COLUMN IF NOT EXISTS voice_chat_tts_model TEXT,
  ADD COLUMN IF NOT EXISTS voice_chat_voice_id TEXT,
  ADD COLUMN IF NOT EXISTS realtime_llm_model TEXT,
  ADD COLUMN IF NOT EXISTS realtime_stt_model TEXT,
  ADD COLUMN IF NOT EXISTS realtime_tts_model TEXT,
  ADD COLUMN IF NOT EXISTS realtime_voice_id TEXT;

COMMENT ON COLUMN agent_ai_settings.voice_chat_stt_model IS 'Independent Voice Chat STT model.';
COMMENT ON COLUMN agent_ai_settings.voice_chat_tts_model IS 'Independent Voice Chat TTS model.';
COMMENT ON COLUMN agent_ai_settings.voice_chat_voice_id IS 'Independent Voice Chat speaker/voice.';
COMMENT ON COLUMN agent_ai_settings.realtime_llm_model IS 'Independent Realtime Voice LLM.';
COMMENT ON COLUMN agent_ai_settings.realtime_stt_model IS 'Independent Realtime Voice STT model.';
COMMENT ON COLUMN agent_ai_settings.realtime_tts_model IS 'Independent Realtime Voice TTS model.';
COMMENT ON COLUMN agent_ai_settings.realtime_voice_id IS 'Independent Realtime Voice speaker/voice.';
