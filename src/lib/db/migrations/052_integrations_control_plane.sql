-- 052_integrations_control_plane.sql
-- Clara AI Platform — platform/org/agent integration access control.
-- Integration credentials are encrypted at rest. This migration does NOT add
-- billable usage kinds; execution telemetry remains operational/audit-only.

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_integrations INTEGER NOT NULL DEFAULT 0;

UPDATE subscription_plans SET max_integrations = CASE id
  WHEN 'free' THEN 0
  WHEN 'starter' THEN 3
  WHEN 'pro' THEN 10
  WHEN 'enterprise' THEN -1
  ELSE max_integrations
END;

CREATE TABLE IF NOT EXISTS platform_integrations (
  integration_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_plans JSONB NOT NULL DEFAULT '["starter","pro","enterprise"]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organisation_integrations (
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL REFERENCES platform_integrations(integration_id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, integration_id)
);

CREATE TABLE IF NOT EXISTS agent_integrations (
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL REFERENCES platform_integrations(integration_id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, integration_id)
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  integration_id TEXT NOT NULL REFERENCES platform_integrations(integration_id) ON DELETE CASCADE,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth2','secret_text','custom_auth','basic_auth','none')),
  credentials_encrypted BYTEA NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','expired','revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_connections_scope_idx
  ON integration_connections(org_id, integration_id, agent_id, status);

CREATE TABLE IF NOT EXISTS integration_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  integration_id TEXT NOT NULL,
  action_name TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_usage_log_org_created_idx
  ON integration_usage_log(org_id, created_at DESC);

INSERT INTO platform_integrations (integration_id)
SELECT id FROM (VALUES
  ('discord'),('microsoft_teams'),('telegram_bot'),('whatsapp'),('mattermost'),
  ('googlechat'),('line'),('gmail'),('microsoft_outlook'),('sendgrid'),('resend'),
  ('twilio'),('crisp'),('intercom'),('front'),('pushover'),('ntfy'),('pushbullet'),('gotify')
) AS v(id)
ON CONFLICT (integration_id) DO NOTHING;

-- Keep the reference catalog available to the control plane. Platform admins
-- can disable any entry without deleting the registry definition.
