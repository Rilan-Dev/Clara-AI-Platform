-- 068_whatsapp_connection_health.sql
-- Keep health-probe scheduling separate from user-facing updated_at.
ALTER TABLE whatsapp_business_connections
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS whatsapp_connections_health_check_idx
  ON whatsapp_business_connections(last_health_check_at ASC NULLS FIRST, created_at ASC)
  WHERE status = 'active';
