-- 062_integrations_data_api_hardening.sql
-- Keep I-2 integration control-plane data server-only. These tables contain
-- encrypted credentials, connection metadata, and integration state.
-- Clara's Node/Postgres runtime performs authorization and uses a privileged
-- database connection; the Supabase Data API must not expose these tables.
--
-- Self-hosted PostgreSQL deployments do not necessarily create the Supabase
-- Data API roles (anon/authenticated). Keep this migration portable: revoke
-- access when those roles exist, while still enforcing RLS everywhere.

ALTER TABLE platform_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_store ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON platform_integrations FROM anon;
    REVOKE ALL ON organisation_integrations FROM anon;
    REVOKE ALL ON agent_integrations FROM anon;
    REVOKE ALL ON integration_connections FROM anon;
    REVOKE ALL ON integration_usage_log FROM anon;
    REVOKE ALL ON integration_store FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON platform_integrations FROM authenticated;
    REVOKE ALL ON organisation_integrations FROM authenticated;
    REVOKE ALL ON agent_integrations FROM authenticated;
    REVOKE ALL ON integration_connections FROM authenticated;
    REVOKE ALL ON integration_usage_log FROM authenticated;
    REVOKE ALL ON integration_store FROM authenticated;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS integration_connections_agent_org_idx
  ON integration_connections(agent_id, org_id);
