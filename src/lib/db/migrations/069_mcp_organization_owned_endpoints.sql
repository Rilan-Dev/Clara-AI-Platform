-- 069_mcp_organization_owned_endpoints.sql
-- Clara AI Platform — organization-owned MCP connections, plan MCP
-- entitlements, platform governance, usage metering and audit.
--
-- Ownership model:
--   * Organizations own their custom MCP connections, endpoints, encrypted
--     credentials, discovered tools, approvals and agent permissions.
--   * Organization-owned connections never require platform_mcp_* registry
--     rows (no such registry exists; the optional platform catalog is a
--     separate, independent concern).
--   * Platform admins control plan entitlements, global security policy and
--     emergency disablement via mcp_platform_settings + plan columns.
--
-- This migration is purely additive: no existing table is dropped or reset.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. Plan MCP entitlements ────────────────────────────────────────────────
-- One validated JSONB document per plan (see src/modules/mcp/entitlements.ts
-- for the authoritative Zod schema). Kept in sync on both the live plan row
-- and every plan version snapshot so version history stays meaningful.

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS mcp_entitlements JSONB;

ALTER TABLE subscription_plan_versions
  ADD COLUMN IF NOT EXISTS mcp_entitlements JSONB;

-- Reference-data defaults: free/starter disabled initially so the platform
-- admin explicitly opts each plan in. Enterprise/pro/starter seeds follow the
-- roadmap defaults; admins can change them in the plan editor at any time.
UPDATE subscription_plans
   SET mcp_entitlements = CASE id
     WHEN 'free' THEN '{"enabled":false,"customEndpoints":false,"maxConnections":0,"maxToolsPerConnection":0,"maxAgentAssignments":0,"toolCallsPerPeriod":0,"toolCallsPerMinute":0,"allowedAuthMethods":["none"],"allowedTransports":["streamable_http"],"platformCatalog":false,"privateNetwork":false,"usagePolicy":"deny","notes":""}'::jsonb
     WHEN 'starter' THEN '{"enabled":true,"customEndpoints":true,"maxConnections":2,"maxToolsPerConnection":25,"maxAgentAssignments":50,"toolCallsPerPeriod":5000,"toolCallsPerMinute":30,"allowedAuthMethods":["none","bearer_token","basic_auth","api_key_header"],"allowedTransports":["streamable_http"],"platformCatalog":true,"privateNetwork":false,"usagePolicy":"deny","notes":""}'::jsonb
     WHEN 'pro' THEN '{"enabled":true,"customEndpoints":true,"maxConnections":10,"maxToolsPerConnection":100,"maxAgentAssignments":500,"toolCallsPerPeriod":100000,"toolCallsPerMinute":120,"allowedAuthMethods":["none","bearer_token","basic_auth","api_key_header"],"allowedTransports":["streamable_http"],"platformCatalog":true,"privateNetwork":false,"usagePolicy":"meter","notes":""}'::jsonb
     WHEN 'enterprise' THEN '{"enabled":true,"customEndpoints":true,"maxConnections":-1,"maxToolsPerConnection":-1,"maxAgentAssignments":-1,"toolCallsPerPeriod":-1,"toolCallsPerMinute":600,"allowedAuthMethods":["none","bearer_token","basic_auth","api_key_header"],"allowedTransports":["streamable_http"],"platformCatalog":true,"privateNetwork":false,"usagePolicy":"deny","notes":""}'::jsonb
     ELSE '{"enabled":false,"customEndpoints":false,"maxConnections":0,"maxToolsPerConnection":0,"maxAgentAssignments":0,"toolCallsPerPeriod":0,"toolCallsPerMinute":0,"allowedAuthMethods":["none"],"allowedTransports":["streamable_http"],"platformCatalog":false,"privateNetwork":false,"usagePolicy":"deny","notes":""}'::jsonb
   END
 WHERE mcp_entitlements IS NULL;

UPDATE subscription_plan_versions v
   SET mcp_entitlements = sp.mcp_entitlements
  FROM subscription_plans sp
 WHERE sp.id = v.plan_id
   AND v.mcp_entitlements IS NULL;

-- ─── 2. Global platform governance (singleton row) ───────────────────────────

CREATE TABLE IF NOT EXISTS mcp_platform_settings (
  id                     BOOLEAN      PRIMARY KEY DEFAULT TRUE CHECK (id),
  mcp_enabled            BOOLEAN      NOT NULL DEFAULT FALSE,
  emergency_disabled     BOOLEAN      NOT NULL DEFAULT FALSE,
  security_policy        JSONB        NOT NULL DEFAULT '{"requireHttps":true,"blockPrivateNetworks":true,"maxRedirects":0,"requestTimeoutMs":15000,"tlsVerify":true}'::jsonb,
  platform_catalog_enabled BOOLEAN    NOT NULL DEFAULT FALSE,
  clara_hosted_enabled   BOOLEAN      NOT NULL DEFAULT FALSE,
  updated_by             UUID         REFERENCES users(id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO mcp_platform_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- ─── 3. Organization-owned MCP connections ───────────────────────────────────
-- No FK to any platform registry: organization ownership is self-contained.

CREATE TABLE IF NOT EXISTS org_mcp_connections (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name                  TEXT        NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description           TEXT        NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  endpoint_url          TEXT        NOT NULL CHECK (length(endpoint_url) <= 2048),
  transport             TEXT        NOT NULL DEFAULT 'streamable_http'
                                    CHECK (transport IN ('streamable_http')),
  auth_type             TEXT        NOT NULL DEFAULT 'none'
                                    CHECK (auth_type IN ('none','bearer_token','basic_auth','api_key_header')),
  credentials_encrypted BYTEA,
  display_name          TEXT,
  status                TEXT        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','disabled','error','expired','testing')),
  last_error            TEXT,
  last_checked_at       TIMESTAMPTZ,
  handshake_protocol    TEXT,
  handshake_server_info JSONB,
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS org_mcp_connections_org_idx
  ON org_mcp_connections (org_id, status, updated_at DESC);

-- ─── 4. Discovered tools per connection ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_mcp_tools (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID        NOT NULL REFERENCES org_mcp_connections(id) ON DELETE CASCADE,
  org_id          UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  tool_name       TEXT        NOT NULL CHECK (length(tool_name) BETWEEN 1 AND 200),
  title           TEXT,
  description     TEXT        NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  input_schema    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  approved        BOOLEAN     NOT NULL DEFAULT FALSE,
  approved_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  last_seen_at    TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'discovered'
                              CHECK (status IN ('discovered','approved','revoked','stale')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, tool_name)
);

CREATE INDEX IF NOT EXISTS org_mcp_tools_connection_idx
  ON org_mcp_tools (connection_id, status);

CREATE INDEX IF NOT EXISTS org_mcp_tools_org_idx
  ON org_mcp_tools (org_id, status);

-- ─── 5. Agent-to-tool grants ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_mcp_agent_grants (
  agent_id     UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_id      UUID        NOT NULL REFERENCES org_mcp_tools(id) ON DELETE CASCADE,
  org_id       UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  granted_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ,
  PRIMARY KEY (agent_id, tool_id)
);

CREATE INDEX IF NOT EXISTS org_mcp_agent_grants_tool_idx
  ON org_mcp_agent_grants (tool_id, enabled);

CREATE INDEX IF NOT EXISTS org_mcp_agent_grants_org_idx
  ON org_mcp_agent_grants (org_id, enabled);

-- ─── 6. Usage metering (billing period + rate window) ───────────────────────
-- One row per invocation attempt (success and failure). period_start is the
-- billing-period anchor date; the per-minute window is derived from metered_at.

CREATE TABLE IF NOT EXISTS mcp_tool_usage_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id       UUID        REFERENCES agents(id) ON DELETE SET NULL,
  connection_id  UUID        REFERENCES org_mcp_connections(id) ON DELETE SET NULL,
  tool_id        UUID        REFERENCES org_mcp_tools(id) ON DELETE SET NULL,
  tool_name      TEXT        NOT NULL,
  user_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  surface        TEXT        NOT NULL DEFAULT 'chat'
                             CHECK (surface IN ('chat','realtime','embed','api')),
  success        BOOLEAN     NOT NULL,
  duration_ms    INTEGER     NOT NULL DEFAULT 0,
  error_code     TEXT,
  error_message  TEXT,
  period_start   DATE        NOT NULL,
  metered_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_tool_usage_log_org_period_idx
  ON mcp_tool_usage_log (org_id, period_start, metered_at DESC);

CREATE INDEX IF NOT EXISTS mcp_tool_usage_log_org_minute_idx
  ON mcp_tool_usage_log (org_id, metered_at DESC);

CREATE INDEX IF NOT EXISTS mcp_tool_usage_log_connection_idx
  ON mcp_tool_usage_log (connection_id, metered_at DESC);

-- ─── 7. Organization entitlement overrides (audited, expiring) ───────────────

CREATE TABLE IF NOT EXISTS org_mcp_overrides (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL UNIQUE REFERENCES organisations(id) ON DELETE CASCADE,
  entitlements  JSONB       NOT NULL,
  reason        TEXT        NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_by    UUID        NOT NULL REFERENCES users(id),
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 8. Audit trails ────────────────────────────────────────────────────────
-- Details are safe projections: actor, entity, changed setting and sanitized
-- before/after values. Credential values are never written to these tables.

CREATE TABLE IF NOT EXISTS org_mcp_audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  actor_user_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT        NOT NULL,
  entity_type    TEXT        NOT NULL,
  entity_id      TEXT,
  details        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_mcp_audit_log_org_idx
  ON org_mcp_audit_log (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mcp_platform_audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT        NOT NULL,
  entity_type    TEXT        NOT NULL,
  entity_id      TEXT,
  details        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_platform_audit_log_created_idx
  ON mcp_platform_audit_log (created_at DESC);
