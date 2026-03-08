-- ─────────────────────────────────────────────────────────────────────────────
-- 002_users_rbac.sql
-- Clara RAG — Production-grade users, roles, RBAC, sessions, audit logs
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. users ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT        NOT NULL UNIQUE,
  password_hash     TEXT        NOT NULL,
  full_name         TEXT        NOT NULL,
  avatar_url        TEXT,
  status            TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','suspended','pending_verification')),
  email_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_super_admin    BOOLEAN     NOT NULL DEFAULT FALSE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx  ON users (email);
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

-- ── 2. roles ─────────────────────────────────────────────────────────────────
-- Hierarchy (highest first):
--   org_admin > project_manager > kb_editor > kb_viewer

CREATE TABLE IF NOT EXISTS roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed roles (idempotent)
INSERT INTO roles (name, description) VALUES
  ('org_admin',        'Full control over an organisation and all its resources'),
  ('project_manager',  'Can create/manage knowledge bases within assigned projects'),
  ('kb_editor',        'Can upload documents and edit KB configuration'),
  ('kb_viewer',        'Read-only access to KBs and documents')
ON CONFLICT (name) DO NOTHING;

-- ── 3. permissions ────────────────────────────────────────────────────────────
-- resource:action pairs

CREATE TABLE IF NOT EXISTS permissions (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource TEXT NOT NULL,
  action   TEXT NOT NULL,
  UNIQUE (resource, action)
);

INSERT INTO permissions (resource, action) VALUES
  -- organisations
  ('org', 'read'),
  ('org', 'update'),
  ('org', 'delete'),
  ('org', 'manage_members'),
  -- projects
  ('project', 'create'),
  ('project', 'read'),
  ('project', 'update'),
  ('project', 'delete'),
  ('project', 'manage_members'),
  -- knowledge bases
  ('kb', 'create'),
  ('kb', 'read'),
  ('kb', 'update'),
  ('kb', 'delete'),
  -- documents
  ('document', 'create'),
  ('document', 'read'),
  ('document', 'delete'),
  -- assistant config
  ('config', 'read'),
  ('config', 'update'),
  -- users (within org)
  ('user', 'invite'),
  ('user', 'remove'),
  ('user', 'read')
ON CONFLICT (resource, action) DO NOTHING;

-- ── 4. role_permissions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Assign permissions to roles (idempotent via ON CONFLICT DO NOTHING)
DO $$
DECLARE
  r_org_admin       UUID;
  r_proj_manager    UUID;
  r_kb_editor       UUID;
  r_kb_viewer       UUID;
BEGIN
  SELECT id INTO r_org_admin     FROM roles WHERE name = 'org_admin';
  SELECT id INTO r_proj_manager  FROM roles WHERE name = 'project_manager';
  SELECT id INTO r_kb_editor     FROM roles WHERE name = 'kb_editor';
  SELECT id INTO r_kb_viewer     FROM roles WHERE name = 'kb_viewer';

  -- org_admin: everything
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_org_admin, id FROM permissions
    ON CONFLICT DO NOTHING;

  -- project_manager: project + kb + document + config, no org management
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_proj_manager, id FROM permissions
    WHERE (resource, action) IN (
      ('org',      'read'),
      ('project',  'create'), ('project', 'read'), ('project', 'update'),
      ('project',  'manage_members'),
      ('kb',       'create'), ('kb', 'read'), ('kb', 'update'), ('kb', 'delete'),
      ('document', 'create'), ('document', 'read'), ('document', 'delete'),
      ('config',   'read'),   ('config', 'update'),
      ('user',     'read'),   ('user', 'invite')
    )
    ON CONFLICT DO NOTHING;

  -- kb_editor: read org/project, full kb/doc/config access, no deletion of KBs
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_kb_editor, id FROM permissions
    WHERE (resource, action) IN (
      ('org',      'read'),
      ('project',  'read'),
      ('kb',       'read'),   ('kb', 'update'),
      ('document', 'create'), ('document', 'read'), ('document', 'delete'),
      ('config',   'read'),   ('config', 'update'),
      ('user',     'read')
    )
    ON CONFLICT DO NOTHING;

  -- kb_viewer: read only
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT r_kb_viewer, id FROM permissions
    WHERE (resource, action) IN (
      ('org',      'read'),
      ('project',  'read'),
      ('kb',       'read'),
      ('document', 'read'),
      ('config',   'read'),
      ('user',     'read')
    )
    ON CONFLICT DO NOTHING;
END $$;

-- ── 5. org_members ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     UUID        NOT NULL REFERENCES roles(id),
  invited_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_members_org_id_idx  ON org_members (org_id);
CREATE INDEX IF NOT EXISTS org_members_user_id_idx ON org_members (user_id);

-- ── 6. project_members ───────────────────────────────────────────────────────
-- Optional fine-grained access at project level.
-- If a user has org_members row they inherit access to all projects in that org.

CREATE TABLE IF NOT EXISTS project_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     UUID        NOT NULL REFERENCES roles(id),
  granted_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_members_project_id_idx ON project_members (project_id);
CREATE INDEX IF NOT EXISTS project_members_user_id_idx    ON project_members (user_id);

-- ── 7. sessions ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);

-- ── 8. audit_logs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
  org_id        UUID        REFERENCES organisations(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   TEXT,
  old_data      JSONB,
  new_data      JSONB,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx   ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_org_id_idx    ON audit_logs (org_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx    ON audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);

-- ── 9. updated_at triggers for new tables ────────────────────────────────────

DO $$ BEGIN
  CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
