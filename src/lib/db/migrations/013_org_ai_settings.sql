-- ─────────────────────────────────────────────────────────────────────────────
-- 013_org_ai_settings.sql
-- Clara AI Platform — org-level assistant persona (Identity / Behaviour /
-- Language / Voice). AI model/provider/token limits stay centralised at
-- platform level (012); these are the org-owned persona overrides.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_ai_settings (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID        NOT NULL UNIQUE REFERENCES organisations(id) ON DELETE CASCADE,

  default_provider            TEXT        CHECK (default_provider IN ('openai', 'gemini')),
  allowed_providers           TEXT[]      NOT NULL DEFAULT ARRAY['openai', 'gemini']
                                            CHECK (allowed_providers <@ ARRAY['openai', 'gemini']::TEXT[])
                                            CHECK (cardinality(allowed_providers) > 0),
  allowed_chat_models         JSONB       NOT NULL DEFAULT '{}'::jsonb
                                            CHECK (jsonb_typeof(allowed_chat_models) = 'object'),
  allowed_embedding_models    JSONB       NOT NULL DEFAULT '{}'::jsonb
                                            CHECK (jsonb_typeof(allowed_embedding_models) = 'object'),
  allowed_realtime_models     JSONB       NOT NULL DEFAULT '{}'::jsonb
                                            CHECK (jsonb_typeof(allowed_realtime_models) = 'object'),
  allowed_voices              JSONB       NOT NULL DEFAULT '{}'::jsonb
                                            CHECK (jsonb_typeof(allowed_voices) = 'object'),
  default_chat_model          TEXT,
  default_embedding_model     TEXT,
  default_realtime_model      TEXT,
  default_transcription_model TEXT,
  max_chat_tokens             INT         CHECK (max_chat_tokens IS NULL OR max_chat_tokens BETWEEN 50 AND 16000),
  max_realtime_tokens         INT         CHECK (max_realtime_tokens IS NULL OR max_realtime_tokens BETWEEN 50 AND 4000),
  max_temperature             NUMERIC(3,2) CHECK (max_temperature IS NULL OR max_temperature BETWEEN 0.00 AND 1.00),
  enable_public_embed         BOOLEAN     NOT NULL DEFAULT TRUE,
  enable_voice                BOOLEAN     NOT NULL DEFAULT TRUE,
  enable_realtime             BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Identity
  assistant_name              TEXT,
  avatar_url                  TEXT,

  -- Behaviour
  system_prompt               TEXT,
  welcome_message             TEXT,
  out_of_scope_reply          TEXT,
  rules                       JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Language
  default_language            TEXT,
  allowed_languages           TEXT[]      NOT NULL DEFAULT ARRAY['en'],
  always_respond_in           TEXT,

  -- Voice
  voice_id                    TEXT,
  speed                       NUMERIC(4,2) CHECK (speed IS NULL OR speed BETWEEN 0.25 AND 4.0),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_ai_settings_org_id_idx ON org_ai_settings (org_id);

COMMENT ON COLUMN org_ai_settings.assistant_name IS 'Organization-level assistant name override (Identity)';
COMMENT ON COLUMN org_ai_settings.system_prompt IS 'Organization-level system prompt override (Behaviour)';
COMMENT ON COLUMN org_ai_settings.default_language IS 'Organization-level default language (Language)';
COMMENT ON COLUMN org_ai_settings.voice_id IS 'Organization-level default voice (Voice)';

DO $$ BEGIN
  CREATE TRIGGER org_ai_settings_updated_at
    BEFORE UPDATE ON org_ai_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
