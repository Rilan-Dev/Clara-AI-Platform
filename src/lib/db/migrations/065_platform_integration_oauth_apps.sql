-- Platform-managed OAuth application configuration for integrations.
-- Client secrets are encrypted at rest and never returned by API reads.
CREATE TABLE IF NOT EXISTS platform_integration_oauth_apps (
  integration_id text PRIMARY KEY REFERENCES platform_integrations(integration_id) ON DELETE CASCADE,
  client_id text NOT NULL,
  client_secret_encrypted bytea NOT NULL,
  redirect_uri text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_integration_oauth_apps_client_id_nonempty CHECK (length(trim(client_id)) > 0),
  CONSTRAINT platform_integration_oauth_apps_redirect_uri_nonempty CHECK (length(trim(redirect_uri)) > 0),
  CONSTRAINT platform_integration_oauth_apps_scopes_array CHECK (jsonb_typeof(scopes) = 'array')
);
