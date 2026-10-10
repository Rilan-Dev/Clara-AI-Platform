-- 071_platform_integration_credentials.sql
-- Platform-managed non-OAuth integration credentials (secret_text, basic_auth,
-- custom_auth) plus the default-disabled reset for the integration catalog.
--
-- Mirrors the doable-source control plane: an integration is only toggleable
-- (enable/disable) after the platform admin has configured it. "Configured"
-- means a platform_integration_oauth_apps row exists (oauth2) or a
-- platform_integration_credentials row exists (non-OAuth auth types).
-- authType "none" needs nothing and is always considered configured.
--
-- Secrets are encrypted with pgp_sym_encrypt + the server ENCRYPTION_KEY —
-- the same scheme as platform_integration_oauth_apps — and are never selected
-- into API responses.

CREATE TABLE IF NOT EXISTS platform_integration_credentials (
  integration_id text PRIMARY KEY REFERENCES platform_integrations(integration_id) ON DELETE CASCADE,
  auth_type text NOT NULL CHECK (auth_type IN ('secret_text','basic_auth','custom_auth')),
  credentials_encrypted bytea NOT NULL,
  display_hint text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- New rows inserted into platform_integrations from now on default to
-- disabled; enabling is an explicit platform-admin action.
ALTER TABLE platform_integrations ALTER COLUMN enabled SET DEFAULT FALSE;

-- Reset rows that were enabled by the 060 seed default (enabled=TRUE) rather
-- than by deliberate configuration. No platform credential storage existed
-- before this migration, so any currently-enabled integration without a
-- saved OAuth app was never actually configured. OAuth-configured integrations
-- keep their state — the admin deliberately set those up.
UPDATE platform_integrations pi
   SET enabled = FALSE,
       updated_at = now()
 WHERE pi.enabled = TRUE
   AND NOT EXISTS (
     SELECT 1 FROM platform_integration_oauth_apps oa
      WHERE oa.integration_id = pi.integration_id
   );
