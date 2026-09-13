-- ─────────────────────────────────────────────────────────────────────────────
-- 038_projects_to_agents.sql
-- Consolidation: Projects ARE Agents (one entity).
--
-- The separate agents module (036_agents.sql: agents + project_agents) is
-- removed. The `projects` table is renamed to `agents` and enriched with the
-- agent persona columns (Identity / Behaviour / Language / Voice / generation)
-- taken from the old agents schema, so a project-turned-agent carries its own
-- assistant configuration at runtime.
--
-- Data migration: each project's ACTIVE agent (project_agents.is_active)
-- persona is copied into the project row BEFORE the old tables are dropped,
-- so live assistant behaviour is preserved exactly.
--
-- Internal plumbing notes:
--  * RBAC permission resources stay `project:*` (requireProjectPermission) —
--    invisible resource strings, kept stable to avoid role re-grants.
--  * The old module's `agent:*` permission rows are deleted below.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add the agent persona columns to projects ─────────────────────────────
--    (types / defaults / CHECKs mirror the old agents table from 036)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  ADD COLUMN IF NOT EXISTS assistant_name TEXT NOT NULL DEFAULT 'Clara',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS system_prompt TEXT NOT NULL DEFAULT
    'You are Clara, a helpful voice assistant. Answer ONLY using the context provided.',
  ADD COLUMN IF NOT EXISTS welcome_message TEXT NOT NULL DEFAULT
    'Hello! How can I help you today?',
  ADD COLUMN IF NOT EXISTS out_of_scope_reply TEXT NOT NULL DEFAULT
    'I can only answer questions about the topics I have been set up for.',
  ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS allowed_languages TEXT[] NOT NULL DEFAULT ARRAY['en'],
  ADD COLUMN IF NOT EXISTS always_respond_in TEXT,
  ADD COLUMN IF NOT EXISTS voice_provider TEXT
    CHECK (voice_provider IS NULL OR voice_provider IN ('openai', 'gemini')),
  ADD COLUMN IF NOT EXISTS voice_id TEXT,
  ADD COLUMN IF NOT EXISTS speed NUMERIC(4,2) NOT NULL DEFAULT 1.0
    CHECK (speed BETWEEN 0.25 AND 4.0),
  ADD COLUMN IF NOT EXISTS chat_model TEXT,
  ADD COLUMN IF NOT EXISTS temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7
    CHECK (temperature BETWEEN 0.0 AND 1.0),
  ADD COLUMN IF NOT EXISTS max_tokens INT NOT NULL DEFAULT 500
    CHECK (max_tokens BETWEEN 50 AND 4000),
  ADD COLUMN IF NOT EXISTS cite_sources BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS strict_mode BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 2. Carry each project's active agent persona into the project row ───────

UPDATE projects p SET
  status              = a.status,
  assistant_name      = a.assistant_name,
  avatar_url          = a.avatar_url,
  system_prompt       = a.system_prompt,
  welcome_message     = a.welcome_message,
  out_of_scope_reply  = a.out_of_scope_reply,
  rules               = a.rules,
  default_language    = a.default_language,
  allowed_languages   = a.allowed_languages,
  always_respond_in   = a.always_respond_in,
  voice_provider      = a.voice_provider,
  voice_id            = a.voice_id,
  speed               = a.speed,
  chat_model          = a.chat_model,
  temperature         = a.temperature,
  max_tokens          = a.max_tokens,
  cite_sources        = a.cite_sources,
  strict_mode         = a.strict_mode,
  updated_at          = now()
FROM project_agents pa
JOIN agents a ON a.id = pa.agent_id
WHERE pa.project_id = p.id AND pa.is_active;

-- ── 3. Remove the old agents module tables ───────────────────────────────────

DROP TABLE IF EXISTS project_agents;
DROP TABLE IF EXISTS agents;

-- ── 4. Rename the projects table to agents ───────────────────────────────────
--    (FK constraints in other tables follow the rename automatically)

ALTER TABLE projects RENAME TO agents;

-- ── 5. Rename child tables + their project_id columns to agent_id ────────────

ALTER TABLE knowledge_bases RENAME COLUMN project_id TO agent_id;
ALTER INDEX IF EXISTS knowledge_bases_project_id_idx RENAME TO knowledge_bases_agent_id_idx;

ALTER TABLE project_members RENAME TO agent_members;
ALTER TABLE agent_members RENAME COLUMN project_id TO agent_id;
ALTER INDEX IF EXISTS project_members_project_id_idx RENAME TO agent_members_agent_id_idx;

ALTER TABLE project_ai_settings RENAME TO agent_ai_settings;
ALTER TABLE agent_ai_settings RENAME COLUMN project_id TO agent_id;
ALTER INDEX IF EXISTS project_ai_settings_project_id_idx RENAME TO agent_ai_settings_agent_id_idx;

ALTER TABLE project_language_assignments RENAME TO agent_language_assignments;
ALTER TABLE agent_language_assignments RENAME COLUMN project_id TO agent_id;
ALTER INDEX IF EXISTS project_language_assignments_org_idx RENAME TO agent_language_assignments_org_idx;

ALTER TABLE project_voice_assignments RENAME TO agent_voice_assignments;
ALTER TABLE agent_voice_assignments RENAME COLUMN project_id TO agent_id;
ALTER INDEX IF EXISTS project_voice_assignments_org_idx RENAME TO agent_voice_assignments_org_idx;

-- Main-table indexes / trigger (names follow the rename; relabel for clarity)
ALTER INDEX IF EXISTS projects_org_id_idx RENAME TO agents_org_idx;
ALTER TRIGGER projects_updated_at ON agents RENAME TO agents_updated_at;

-- ── 6. Drop the removed module's agent:* permissions ─────────────────────────

DELETE FROM role_permissions
 WHERE permission_id IN (SELECT id FROM permissions WHERE resource = 'agent');
DELETE FROM permissions WHERE resource = 'agent';
