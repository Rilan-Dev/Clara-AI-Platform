-- 066_integration_oauth_states.sql
-- Short-lived, one-time OAuth state records. Raw state is never persisted;
-- the caller stores only its SHA-256 digest. PKCE verifiers are encrypted.
CREATE TABLE IF NOT EXISTS integration_oauth_states (
  state_hash text PRIMARY KEY,
  integration_id text NOT NULL REFERENCES platform_integrations(integration_id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id uuid,
  redirect_uri text NOT NULL,
  code_verifier_encrypted bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT integration_oauth_states_hash_sha256 CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT integration_oauth_states_redirect_nonempty CHECK (length(trim(redirect_uri)) > 0),
  CONSTRAINT integration_oauth_states_expiry CHECK (expires_at > created_at),
  CONSTRAINT integration_oauth_states_agent_org_fk
    FOREIGN KEY (agent_id, org_id) REFERENCES agents(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS integration_oauth_states_expiry_idx
  ON integration_oauth_states(expires_at);

-- OAuth state is server-only even on Supabase deployments; browser roles must
-- never read or consume state records or encrypted PKCE material.
ALTER TABLE integration_oauth_states ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON integration_oauth_states FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON integration_oauth_states FROM authenticated;
  END IF;
END
$$;
