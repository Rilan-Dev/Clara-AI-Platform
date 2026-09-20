-- ─────────────────────────────────────────────────────────────────────────────
-- 008_org_ai_catalog.sql
-- Clara AI Platform — organisation-owned AI catalog:
--   organisation_languages / organisation_voices — org-owned catalog entries
--   agent_ai_settings / agent_language_assignments / agent_voice_assignments
--   — agent-scoped selections, always tenant-isolated via composite keys
--     on (id, org_id).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organisation_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  native_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, code),
  UNIQUE (id, org_id)
);
CREATE INDEX IF NOT EXISTS organisation_languages_org_idx ON organisation_languages (org_id, enabled);

CREATE TABLE IF NOT EXISTS organisation_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'gemini')),
  voice_id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider, voice_id),
  UNIQUE (id, org_id)
);
CREATE INDEX IF NOT EXISTS organisation_voices_org_idx ON organisation_voices (org_id, provider, enabled);

CREATE TABLE IF NOT EXISTS agent_ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  org_id UUID NOT NULL,
  provider TEXT CHECK (provider IN ('openai', 'gemini')),
  chat_model TEXT,
  embedding_model TEXT,
  realtime_model TEXT,
  transcription_model TEXT,
  default_language_id UUID,
  default_voice_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id),
  UNIQUE (agent_id, org_id),
  FOREIGN KEY (agent_id, org_id)
    REFERENCES agents(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (default_language_id, org_id)
    REFERENCES organisation_languages(id, org_id) ON DELETE RESTRICT,
  FOREIGN KEY (default_voice_id, org_id)
    REFERENCES organisation_voices(id, org_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS agent_ai_settings_org_idx ON agent_ai_settings (org_id);

CREATE TABLE IF NOT EXISTS agent_language_assignments (
  agent_id UUID NOT NULL,
  org_id UUID NOT NULL,
  language_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, language_id),
  FOREIGN KEY (agent_id, org_id)
    REFERENCES agents(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (language_id, org_id)
    REFERENCES organisation_languages(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_language_assignments_org_idx ON agent_language_assignments (org_id, agent_id);

CREATE TABLE IF NOT EXISTS agent_voice_assignments (
  agent_id UUID NOT NULL,
  org_id UUID NOT NULL,
  voice_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, voice_id),
  FOREIGN KEY (agent_id, org_id)
    REFERENCES agents(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (voice_id, org_id)
    REFERENCES organisation_voices(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_voice_assignments_org_idx ON agent_voice_assignments (org_id, agent_id);

DO $$ BEGIN
  CREATE TRIGGER organisation_languages_updated_at BEFORE UPDATE ON organisation_languages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER organisation_voices_updated_at BEFORE UPDATE ON organisation_voices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER agent_ai_settings_updated_at BEFORE UPDATE ON agent_ai_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
