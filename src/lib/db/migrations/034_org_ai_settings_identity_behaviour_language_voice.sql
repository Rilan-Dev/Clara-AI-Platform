-- 034_org_ai_settings_identity_behaviour_language_voice.sql
-- Add Identity, Behaviour, Language, Voice fields to org_ai_settings
-- These are org-level overrides that organizations can configure
-- while AI model/provider/token limits remain centralized at platform level

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS assistant_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS welcome_message TEXT,
  ADD COLUMN IF NOT EXISTS out_of_scope_reply TEXT,
  ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_language TEXT,
  ADD COLUMN IF NOT EXISTS allowed_languages TEXT[] NOT NULL DEFAULT ARRAY['en'],
  ADD COLUMN IF NOT EXISTS always_respond_in TEXT,
  ADD COLUMN IF NOT EXISTS voice_id TEXT,
  ADD COLUMN IF NOT EXISTS speed NUMERIC(4,2) CHECK (speed IS NULL OR speed BETWEEN 0.25 AND 4.0);

-- Add comments
COMMENT ON COLUMN org_ai_settings.assistant_name IS 'Organization-level assistant name override (Identity)';
COMMENT ON COLUMN org_ai_settings.avatar_url IS 'Organization-level assistant avatar URL (Identity)';
COMMENT ON COLUMN org_ai_settings.system_prompt IS 'Organization-level system prompt override (Behaviour)';
COMMENT ON COLUMN org_ai_settings.welcome_message IS 'Organization-level welcome message override (Behaviour)';
COMMENT ON COLUMN org_ai_settings.out_of_scope_reply IS 'Organization-level out of scope reply override (Behaviour)';
COMMENT ON COLUMN org_ai_settings.rules IS 'Organization-level rules override (Behaviour)';
COMMENT ON COLUMN org_ai_settings.default_language IS 'Organization-level default language (Language)';
COMMENT ON COLUMN org_ai_settings.allowed_languages IS 'Organization-level allowed languages (Language)';
COMMENT ON COLUMN org_ai_settings.always_respond_in IS 'Organization-level forced response language (Language)';
COMMENT ON COLUMN org_ai_settings.voice_id IS 'Organization-level default voice (Voice)';
COMMENT ON COLUMN org_ai_settings.speed IS 'Organization-level voice speed (Voice)';
