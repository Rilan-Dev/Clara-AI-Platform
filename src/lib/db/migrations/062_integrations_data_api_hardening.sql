-- 062_integrations_data_api_hardening.sql
-- Keep I-2 integration control-plane data server-only. These tables contain
-- encrypted credentials, connection metadata, and integration state.
-- Clara's Node/Postgres runtime performs authorization and uses a privileged
-- database connection; the Supabase Data API must not expose these tables.

ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_store ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_integrations FROM anon, authenticated;
REVOKE ALL ON public.organisation_integrations FROM anon, authenticated;
REVOKE ALL ON public.agent_integrations FROM anon, authenticated;
REVOKE ALL ON public.integration_connections FROM anon, authenticated;
REVOKE ALL ON public.integration_usage_log FROM anon, authenticated;
REVOKE ALL ON public.integration_store FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS integration_connections_agent_org_idx
  ON public.integration_connections(agent_id, org_id);
