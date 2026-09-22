-- 054_platform_health_alerting.sql
-- Persistent platform-health incidents and super-admin notification delivery.
-- An incident is keyed by a stable check key so polling /system-status does not
-- spam administrators while a failure remains unresolved.

CREATE TABLE IF NOT EXISTS platform_health_incidents (
  check_key       TEXT PRIMARY KEY,
  service_name    TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('healthy', 'failing')),
  severity        TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  message         TEXT NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  last_notified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS platform_health_incidents_status_idx
  ON platform_health_incidents (status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS platform_admin_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_key    TEXT NOT NULL REFERENCES platform_health_incidents(check_key) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        INT NOT NULL DEFAULT 0,
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_admin_notifications_created_idx
  ON platform_admin_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS platform_admin_notifications_incident_idx
  ON platform_admin_notifications (incident_key, created_at DESC);
