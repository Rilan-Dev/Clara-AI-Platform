-- 061_integrations_tenant_hardening.sql
-- Tenant hardening for the I-2 integration runtime.
-- Re-key legacy FLOW store entries with their owning organisation and enforce
-- agent/org consistency at the database boundary.

UPDATE integration_store
SET scope_key = 'flow:' || org_id::text || ':' || substring(scope_key FROM 6)
WHERE scope_key ~ '^flow:[^:]+:[^:]+$'
  AND scope_key NOT LIKE 'flow:' || org_id::text || ':%';

DO $$ BEGIN
  ALTER TABLE integration_connections
    ADD CONSTRAINT integration_connections_agent_org_fk
    FOREIGN KEY (agent_id, org_id)
    REFERENCES agents(id, org_id)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE agent_integrations
    ADD CONSTRAINT agent_integrations_agent_exists_fk
    FOREIGN KEY (agent_id)
    REFERENCES agents(id)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
