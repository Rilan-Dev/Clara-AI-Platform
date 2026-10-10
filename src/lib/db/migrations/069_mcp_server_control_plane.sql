-- 069_mcp_server_control_plane.sql
-- Platform-approved MCP servers, tenant-owned connections, and explicit
-- organisation/agent tool grants. Secrets are encrypted using the existing
-- server-side integration key and are never selected into API responses.

CREATE TABLE IF NOT EXISTS platform_mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_key TEXT NOT NULL UNIQUE CHECK (server_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '',
  transport_type TEXT NOT NULL DEFAULT 'streamable_http'
    CHECK (transport_type IN ('streamable_http')),
  endpoint_url TEXT NOT NULL CHECK (endpoint_url ~ '^https://'),
  auth_mode TEXT NOT NULL DEFAULT 'none' CHECK (auth_mode IN ('none','bearer')),
  platform_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_plans JSONB NOT NULL DEFAULT '["pro","enterprise"]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_mcp_tools (
  server_id UUID NOT NULL REFERENCES platform_mcp_servers(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL CHECK (length(trim(tool_name)) BETWEEN 1 AND 160),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_surfaces JSONB NOT NULL DEFAULT '["chat","realtime"]'::jsonb
    CHECK (jsonb_typeof(allowed_surfaces) = 'array'),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, tool_name)
);

CREATE TABLE IF NOT EXISTS organisation_mcp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES platform_mcp_servers(id) ON DELETE CASCADE,
  credentials_encrypted BYTEA,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected','error','disconnected','revoked')),
  connected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_error_code TEXT,
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, server_id),
  CHECK ((status = 'connected' AND (credentials_encrypted IS NOT NULL OR server_id IS NOT NULL))
      OR status <> 'connected')
);

CREATE TABLE IF NOT EXISTS organisation_mcp_tool_grants (
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES platform_mcp_servers(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, server_id, tool_name),
  FOREIGN KEY (server_id, tool_name)
    REFERENCES platform_mcp_tools(server_id, tool_name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_mcp_tool_grants (
  org_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES platform_mcp_servers(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, server_id, tool_name),
  FOREIGN KEY (agent_id, org_id) REFERENCES agents(id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, server_id, tool_name)
    REFERENCES organisation_mcp_tool_grants(org_id, server_id, tool_name) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS organisation_mcp_connections_scope_idx
  ON organisation_mcp_connections(org_id, server_id, status);
CREATE INDEX IF NOT EXISTS organisation_mcp_tool_grants_org_idx
  ON organisation_mcp_tool_grants(org_id, enabled, server_id);
CREATE INDEX IF NOT EXISTS agent_mcp_tool_grants_scope_idx
  ON agent_mcp_tool_grants(org_id, agent_id, enabled);

ALTER TABLE public.platform_mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_mcp_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_mcp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_mcp_tool_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_mcp_tool_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.platform_mcp_servers FROM anon;
    REVOKE ALL ON public.platform_mcp_tools FROM anon;
    REVOKE ALL ON public.organisation_mcp_connections FROM anon;
    REVOKE ALL ON public.organisation_mcp_tool_grants FROM anon;
    REVOKE ALL ON public.agent_mcp_tool_grants FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.platform_mcp_servers FROM authenticated;
    REVOKE ALL ON public.platform_mcp_tools FROM authenticated;
    REVOKE ALL ON public.organisation_mcp_connections FROM authenticated;
    REVOKE ALL ON public.organisation_mcp_tool_grants FROM authenticated;
    REVOKE ALL ON public.agent_mcp_tool_grants FROM authenticated;
  END IF;
END $$;
