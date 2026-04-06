-- 010_kb_ai_overrides.sql
-- KB-specific AI routing overrides.

CREATE TABLE IF NOT EXISTS kb_ai_overrides (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id                UUID        NOT NULL UNIQUE REFERENCES knowledge_bases(id) ON DELETE CASCADE,

  provider             TEXT        CHECK (provider IN ('openai', 'gemini')),
  chat_model           TEXT,
  embedding_model      TEXT,
  realtime_model       TEXT,
  transcription_model  TEXT,

  disable_voice        BOOLEAN     NOT NULL DEFAULT FALSE,
  disable_public_embed BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_ai_overrides_kb_id_idx
  ON kb_ai_overrides (kb_id);

DO $$ BEGIN
  CREATE TRIGGER kb_ai_overrides_updated_at
    BEFORE UPDATE ON kb_ai_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
