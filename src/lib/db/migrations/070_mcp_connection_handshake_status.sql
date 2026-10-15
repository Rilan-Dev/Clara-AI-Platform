-- 070_mcp_connection_handshake_status.sql
-- Distinguish saved credentials from a server that has completed MCP discovery.
-- A connected row must still retain encrypted credentials; disconnect clears them.

DO $$
DECLARE constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = to_regclass('organisation_mcp_connections')
       AND contype = 'c'
       AND (
         pg_get_constraintdef(oid) ILIKE '%status%'
         OR pg_get_constraintdef(oid) ILIKE '%credentials_encrypted%'
       )
  LOOP
    EXECUTE format(
      'ALTER TABLE organisation_mcp_connections DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END $$;

ALTER TABLE organisation_mcp_connections
  ADD CONSTRAINT organisation_mcp_connections_status_check
  CHECK (status IN ('configured','connected','error','disconnected','revoked'));

ALTER TABLE organisation_mcp_connections
  ADD CONSTRAINT organisation_mcp_connections_credentials_check
  CHECK (
    (status IN ('configured','connected') AND credentials_encrypted IS NOT NULL)
    OR status NOT IN ('configured','connected')
  );
