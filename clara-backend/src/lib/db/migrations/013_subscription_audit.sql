-- ─────────────────────────────────────────────────────────────────────────────
-- 013_subscription_audit.sql
-- Clara AI — Subscription audit log, admin notes, extended org_subscriptions
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extend org_subscriptions ──────────────────────────────────────────────────
ALTER TABLE org_subscriptions
  ADD COLUMN IF NOT EXISTS paused_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_extended_count   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pause_reason           TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason          TEXT;

-- Fix status check to include 'paused'
DO $$ BEGIN
  ALTER TABLE org_subscriptions
    DROP CONSTRAINT IF EXISTS org_subscriptions_status_check;
  ALTER TABLE org_subscriptions
    ADD CONSTRAINT org_subscriptions_status_check
    CHECK (status IN ('active','trialing','paused','past_due','canceled'));
EXCEPTION WHEN others THEN NULL; END $$;

-- ── subscription_audit_log ────────────────────────────────────────────────────
-- Append-only record of every admin or system action on a subscription.

CREATE TABLE IF NOT EXISTS subscription_audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  actor_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_label  TEXT        NOT NULL DEFAULT 'system',   -- display name / 'system'
  action       TEXT        NOT NULL,
    -- e.g. plan_changed, status_changed, trial_extended, trial_converted,
    --      subscription_cancelled, subscription_paused, subscription_resumed,
    --      note_added, billing_event
  old_value    JSONB,
  new_value    JSONB,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_audit_org_id_idx    ON subscription_audit_log (org_id);
CREATE INDEX IF NOT EXISTS sub_audit_created_idx   ON subscription_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS sub_audit_action_idx    ON subscription_audit_log (action);

-- ── subscription_notes ────────────────────────────────────────────────────────
-- Admin-authored free-text notes attached to an org's subscription.

CREATE TABLE IF NOT EXISTS subscription_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  author_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT        NOT NULL DEFAULT 'Admin',
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_notes_org_id_idx ON subscription_notes (org_id);
CREATE INDEX IF NOT EXISTS sub_notes_created_idx ON subscription_notes (created_at DESC);
