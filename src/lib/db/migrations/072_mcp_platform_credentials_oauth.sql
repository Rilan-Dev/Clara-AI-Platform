-- 072_mcp_platform_credentials_oauth.sql
-- Platform-managed MCP server credentials + MCP-spec OAuth 2.1 support.
--
-- The platform can now store ONE credential per MCP server (encrypted with the
-- existing server-side integration key):
--   auth_mode 'bearer' -> { type: 'bearer', bearerToken }
--   auth_mode 'oauth'  -> { type: 'oauth', accessToken, refreshToken?, expiresAt?,
--                           clientId, clientSecret?, tokenEndpoint, resource? }
-- The credential is used for admin connection tests and as the default
-- credential for organisation connections (tenants may still bring their own
-- bearer token). Secrets are never selected into API responses.
--
-- platform_mcp_oauth_states mirrors integration_oauth_states (migration 066):
-- short-lived, one-time OAuth state rows. Raw state is never persisted — only
-- its SHA-256 digest. PKCE verifiers and dynamic-client secrets are encrypted.

ALTER TABLE platform_mcp_servers
  ADD COLUMN IF NOT EXISTS platform_credentials_encrypted BYTEA;
ALTER TABLE platform_mcp_servers
  ADD COLUMN IF NOT EXISTS oauth_status TEXT NOT NULL DEFAULT 'not_connected'
    CHECK (oauth_status IN ('not_connected','connected','error'));
ALTER TABLE platform_mcp_servers
  ADD COLUMN IF NOT EXISTS oauth_error TEXT;
ALTER TABLE platform_mcp_servers
  ADD COLUMN IF NOT EXISTS oauth_connected_at TIMESTAMPTZ;

-- auth_mode gains 'oauth' (MCP authorization: OAuth 2.1 with dynamic client
-- registration). Idempotent: re-running replaces the constraint in place.
ALTER TABLE platform_mcp_servers
  DROP CONSTRAINT IF EXISTS platform_mcp_servers_auth_mode_check;
ALTER TABLE platform_mcp_servers
  ADD CONSTRAINT platform_mcp_servers_auth_mode_check
    CHECK (auth_mode IN ('none','bearer','oauth'));

CREATE TABLE IF NOT EXISTS platform_mcp_oauth_states (
  state_hash TEXT PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  server_id UUID NOT NULL REFERENCES platform_mcp_servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL CHECK (length(trim(redirect_uri)) > 0),
  code_verifier_encrypted BYTEA NOT NULL,
  client_id TEXT NOT NULL CHECK (length(client_id) BETWEEN 1 AND 512),
  client_secret_encrypted BYTEA,
  scopes TEXT,
  resource TEXT,
  authorization_endpoint TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CONSTRAINT platform_mcp_oauth_states_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS platform_mcp_oauth_states_expiry_idx
  ON platform_mcp_oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS platform_mcp_oauth_states_server_idx
  ON platform_mcp_oauth_states(server_id, created_at DESC);

-- OAuth state is server-only even on Supabase deployments; browser roles must
-- never read or consume state records or encrypted PKCE material.
ALTER TABLE public.platform_mcp_oauth_states ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.platform_mcp_oauth_states FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.platform_mcp_oauth_states FROM authenticated;
  END IF;
END
$$;

-- Bearer-mode servers registered before this migration keep working exactly as
-- before (tenant-supplied tokens); no data migration is required.
