-- 037_platform_assistant_defaults.sql
-- Platform-level assistant defaults: Identity, Behaviour, Language & Voice.
--
-- Ownership change (vs. migration 034): these settings are NO LONGER
-- organisation-level. They live here, managed by the platform admin in
-- Settings -> AI Configuration, and act as the STARTING VALUES applied to
-- newly onboarding projects / knowledge bases / agents (assistant persona
-- seeded at creation time). Existing organisation-owned rows are never
-- overwritten — each project, knowledge base and agent keeps its own stored
-- values.
--
-- Seed values intentionally mirror the previous SQL column defaults of
-- assistant_configs (001) and agents (036), so onboarding behaviour is
-- unchanged until the platform admin edits these defaults.

CREATE TABLE IF NOT EXISTS platform_assistant_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  assistant_name TEXT NOT NULL DEFAULT 'Clara',
  avatar_url     TEXT,

  -- Behaviour
  system_prompt      TEXT NOT NULL DEFAULT
    'You are Clara, a helpful voice assistant. Answer ONLY using the context provided.',
  welcome_message    TEXT NOT NULL DEFAULT
    'Hello! How can I help you today?',
  out_of_scope_reply TEXT NOT NULL DEFAULT
    'I can only answer questions about the topics I have been set up for.',
  rules              JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Language
  default_language   TEXT NOT NULL DEFAULT 'en',
  allowed_languages  TEXT[] NOT NULL DEFAULT ARRAY['en'],
  always_respond_in  TEXT,

  -- Voice
  voice_id    TEXT,
  voice_speed NUMERIC(4,2) CHECK (voice_speed IS NULL OR voice_speed BETWEEN 0.25 AND 4.0),

  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Singleton row — fixed id so every environment converges on the same row.
INSERT INTO platform_assistant_defaults (id)
VALUES ('30000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE platform_assistant_defaults IS
  'Platform-admin-managed default assistant persona (Identity/Behaviour/Language/Voice). Seeded onto newly created projects/KBs/agents; existing organisation-owned values are never overwritten.';
COMMENT ON COLUMN platform_assistant_defaults.assistant_name IS 'Default assistant name for newly onboarding projects/agents (Identity)';
COMMENT ON COLUMN platform_assistant_defaults.avatar_url IS 'Default assistant avatar URL (Identity)';
COMMENT ON COLUMN platform_assistant_defaults.system_prompt IS 'Default system prompt (Behaviour)';
COMMENT ON COLUMN platform_assistant_defaults.welcome_message IS 'Default welcome message (Behaviour)';
COMMENT ON COLUMN platform_assistant_defaults.out_of_scope_reply IS 'Default out-of-scope reply (Behaviour)';
COMMENT ON COLUMN platform_assistant_defaults.rules IS 'Default behaviour rules (Behaviour)';
COMMENT ON COLUMN platform_assistant_defaults.default_language IS 'Default language code (Language)';
COMMENT ON COLUMN platform_assistant_defaults.allowed_languages IS 'Default allowed language codes (Language)';
COMMENT ON COLUMN platform_assistant_defaults.always_respond_in IS 'Default forced response language (Language)';
COMMENT ON COLUMN platform_assistant_defaults.voice_id IS 'Default voice id, NULL = provider fallback (Voice)';
COMMENT ON COLUMN platform_assistant_defaults.voice_speed IS 'Default voice speed, NULL = 1.0 (Voice)';
