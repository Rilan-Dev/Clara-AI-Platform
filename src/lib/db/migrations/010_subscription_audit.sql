-- ─────────────────────────────────────────────────────────────────────────────
-- 010_subscription_audit.sql
-- Clara AI Platform — subscription audit trail + notification queue.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── subscription_audit_log ───────────────────────────────────────────────────
-- Immutable record of every admin/system-initiated subscription change.

CREATE TABLE IF NOT EXISTS subscription_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  actor_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT        NOT NULL DEFAULT 'system',  -- 'admin', 'system', 'webhook'
  action        TEXT        NOT NULL,
  old_plan_id   TEXT        REFERENCES subscription_plans(id),
  new_plan_id   TEXT        REFERENCES subscription_plans(id),
  old_status    TEXT,
  new_status    TEXT,
  note          TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_audit_org_id_idx  ON subscription_audit_log (org_id);
CREATE INDEX IF NOT EXISTS sub_audit_created_idx ON subscription_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS sub_audit_action_idx  ON subscription_audit_log (action);

-- ── subscription_notifications ───────────────────────────────────────────────
-- Outbound email/notification queue, picked up by a background worker.

CREATE TABLE IF NOT EXISTS subscription_notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  recipient_email TEXT      NOT NULL,
  notification_type TEXT    NOT NULL,
  subject       TEXT        NOT NULL,
  body_html     TEXT        NOT NULL,
  body_text     TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
  attempts      INT         NOT NULL DEFAULT 0,
  sent_at       TIMESTAMPTZ,
  error_message TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_notif_org_id_idx  ON subscription_notifications (org_id);
CREATE INDEX IF NOT EXISTS sub_notif_status_idx ON subscription_notifications (status);
CREATE INDEX IF NOT EXISTS sub_notif_created_idx ON subscription_notifications (created_at DESC);
