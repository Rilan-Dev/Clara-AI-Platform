-- ─────────────────────────────────────────────────────────────────────────────
-- 001_foundation.sql
-- Clara RAG — Phase 1 schema: organisations, projects, knowledge_bases,
--             assistant_configs
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. organisations ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organisations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organisations_slug_idx ON organisations (slug);

-- ── 2. projects ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_org_id_idx ON projects (org_id);

-- ── 3. knowledge_bases ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  description        TEXT,
  qdrant_collection  TEXT        NOT NULL UNIQUE,
  status             TEXT        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','archived')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_bases_project_id_idx ON knowledge_bases (project_id);
CREATE INDEX IF NOT EXISTS knowledge_bases_status_idx     ON knowledge_bases (status);

-- ── 4. assistant_configs ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assistant_configs (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id              UUID         NOT NULL UNIQUE REFERENCES knowledge_bases(id) ON DELETE CASCADE,

  -- Identity
  assistant_name     TEXT         NOT NULL DEFAULT 'Clara',
  avatar_url         TEXT,

  -- Behaviour
  system_prompt      TEXT         NOT NULL DEFAULT
    'You are Clara, a helpful voice assistant. Answer ONLY using the context provided.',
  welcome_message    TEXT         NOT NULL DEFAULT
    'Hello! How can I help you with this knowledge base today?',
  out_of_scope_reply TEXT         NOT NULL DEFAULT
    'I can only answer questions about the documents in this knowledge base.',
  rules              JSONB        NOT NULL DEFAULT '[]'::jsonb,

  -- Language
  default_language   TEXT         NOT NULL DEFAULT 'en',
  allowed_languages  TEXT[]       NOT NULL DEFAULT ARRAY['en'],
  always_respond_in  TEXT,

  -- Voice
  voice_id           TEXT         NOT NULL DEFAULT 'alloy',
  speed              NUMERIC(4,2) NOT NULL DEFAULT 1.0
                                    CHECK (speed BETWEEN 0.25 AND 4.0),

  -- Generation
  temperature        NUMERIC(3,2) NOT NULL DEFAULT 0.7
                                    CHECK (temperature BETWEEN 0.0 AND 1.0),
  max_tokens         INT          NOT NULL DEFAULT 500
                                    CHECK (max_tokens BETWEEN 50 AND 4000),
  cite_sources       BOOLEAN      NOT NULL DEFAULT TRUE,
  strict_mode        BOOLEAN      NOT NULL DEFAULT TRUE,

  -- Branding
  primary_colour     TEXT         NOT NULL DEFAULT '#6366f1',
  accent_colour      TEXT         NOT NULL DEFAULT '#a5b4fc',

  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── 5. updated_at auto-trigger ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER organisations_updated_at
    BEFORE UPDATE ON organisations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER knowledge_bases_updated_at
    BEFORE UPDATE ON knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER assistant_configs_updated_at
    BEFORE UPDATE ON assistant_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
