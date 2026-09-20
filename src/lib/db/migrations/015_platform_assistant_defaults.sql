-- ─────────────────────────────────────────────────────────────────────────────
-- 015_platform_assistant_defaults.sql
-- Clara AI Platform — platform-admin-managed default assistant persona
-- (Identity / Behaviour / Language / Voice).
--
-- These are the STARTING VALUES applied to newly onboarding agents / KBs
-- (persona seeded at creation time). Existing agent-owned rows are never
-- overwritten. Managed from Settings -> AI Configuration.
-- ─────────────────────────────────────────────────────────────────────────────

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
  'Platform-admin-managed default assistant persona (Identity/Behaviour/Language/Voice). Seeded onto newly created agents/KBs; existing organisation-owned values are never overwritten.';
