-- ─────────────────────────────────────────────────────────────────────────────
-- 036_agents.sql
-- ElevenLabs-style Agents built on top of Projects.
--
-- Model:
--   organisations ──< agents          (org owns a reusable library of agents)
--   projects      ──< project_agents >─ agents
--   (many-to-many junction with an is_active flag; a partial unique index
--    enforces at most ONE active agent per project, while one agent can
--    power many projects)
--
-- Field types and CHECK constraints deliberately mirror assistant_configs
-- (001_foundation.sql) and org_ai_settings (034) so the runtime AI config
-- resolution chain stays consistent.
-- Purely additive: no changes to existing tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. agents ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  -- Labelling & lifecycle
  name        TEXT        NOT NULL,                          -- internal label
  description TEXT,                                          -- what this agent is for
  status      TEXT        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'published', 'archived')),

  -- Identity (customer-facing)
  assistant_name TEXT      NOT NULL DEFAULT 'Clara',
  avatar_url      TEXT,

  -- Behaviour
  system_prompt     TEXT   NOT NULL DEFAULT
    'You are Clara, a helpful voice assistant. Answer ONLY using the context provided.',
  welcome_message   TEXT   NOT NULL DEFAULT
    'Hello! How can I help you today?',
  out_of_scope_reply TEXT  NOT NULL DEFAULT
    'I can only answer questions about the topics I have been set up for.',
  rules             JSONB  NOT NULL DEFAULT '[]'::jsonb,

  -- Language
  default_language  TEXT   NOT NULL DEFAULT 'en',
  allowed_languages TEXT[] NOT NULL DEFAULT ARRAY['en'],
  always_respond_in TEXT,

  -- Voice
  voice_provider    TEXT   CHECK (voice_provider IN ('openai', 'gemini')),
  voice_id          TEXT,
  speed             NUMERIC(4,2) NOT NULL DEFAULT 1.0
                       CHECK (speed BETWEEN 0.25 AND 4.0),

  -- Model / generation
  chat_model    TEXT,
  temperature   NUMERIC(3,2) NOT NULL DEFAULT 0.7
                   CHECK (temperature BETWEEN 0.0 AND 1.0),
  max_tokens    INT         NOT NULL DEFAULT 500
                   CHECK (max_tokens BETWEEN 50 AND 4000),
  cite_sources  BOOLEAN     NOT NULL DEFAULT TRUE,
  strict_mode   BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Audit
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (id, org_id),                       -- composite FK target (tenant isolation)
  UNIQUE (org_id, name)                       -- no duplicate agent names within an org
);

CREATE INDEX IF NOT EXISTS agents_org_idx        ON agents (org_id, status);
CREATE INDEX IF NOT EXISTS agents_created_by_idx ON agents (created_by);

-- ── 2. project_agents (junction) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_agents (
  project_id  UUID        NOT NULL,
  agent_id    UUID        NOT NULL,
  org_id      UUID        NOT NULL,

  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  assigned_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (project_id, agent_id),
  FOREIGN KEY (project_id, org_id)
    REFERENCES projects(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id, org_id)
    REFERENCES agents(id, org_id) ON DELETE CASCADE
);

-- One active agent per project (the "1 agent per project" business rule),
-- while keeping the table itself many-to-many for history / future use.
CREATE UNIQUE INDEX IF NOT EXISTS project_agents_one_active_per_project
  ON project_agents (project_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS project_agents_org_idx
  ON project_agents (org_id, project_id);
CREATE INDEX IF NOT EXISTS project_agents_agent_idx
  ON project_agents (agent_id) WHERE is_active;

-- ── 3. updated_at triggers ───────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TRIGGER agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER project_agents_updated_at
    BEFORE UPDATE ON project_agents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. RBAC: agent permissions ───────────────────────────────────────────────

INSERT INTO permissions (resource, action) VALUES
  ('agent', 'read'),
  ('agent', 'create'),
  ('agent', 'update'),
  ('agent', 'delete')
ON CONFLICT (resource, action) DO NOTHING;

DO $$
DECLARE
  r_org_admin    UUID;
  r_proj_manager UUID;
  r_kb_editor    UUID;
  r_kb_viewer    UUID;
BEGIN
  SELECT id INTO r_org_admin    FROM roles WHERE name = 'org_admin';
  SELECT id INTO r_proj_manager FROM roles WHERE name = 'project_manager';
  SELECT id INTO r_kb_editor    FROM roles WHERE name = 'kb_editor';
  SELECT id INTO r_kb_viewer    FROM roles WHERE name = 'kb_viewer';

  -- org_admin: everything (includes new agent perms automatically)
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_org_admin, id FROM permissions WHERE resource = 'agent'
    ON CONFLICT DO NOTHING;

  -- project_manager: full agent management
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_proj_manager, id FROM permissions WHERE resource = 'agent'
    ON CONFLICT DO NOTHING;

  -- kb_editor: view + configure
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_kb_editor, id FROM permissions
    WHERE (resource, action) IN (('agent','read'), ('agent','update'))
    ON CONFLICT DO NOTHING;

  -- kb_viewer: read only
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_kb_viewer, id FROM permissions
    WHERE (resource, action) IN (('agent','read'))
    ON CONFLICT DO NOTHING;
END $$;
