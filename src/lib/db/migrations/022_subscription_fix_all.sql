-- 022_subscription_fix_all.sql
-- Comprehensive repair for subscription-related tables and columns
-- Ensuring idempotent application of columns from migrations 011 and 013

-- ── org_subscriptions ────────────────────────────────────────────────────────
ALTER TABLE org_subscriptions
  ADD COLUMN IF NOT EXISTS paused_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_extended_days    INT         DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end   BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_note             TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id          TEXT,
  ADD COLUMN IF NOT EXISTS gateway                  TEXT DEFAULT 'manual';

-- Ensure gateway check constraint (best effort, ignore if already exists)
DO $$ BEGIN
  ALTER TABLE org_subscriptions 
    ADD CONSTRAINT org_subscriptions_gateway_check 
    CHECK (gateway IN ('stripe', 'razorpay', 'manual'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── subscription_audit_log ───────────────────────────────────────────────────
-- If the table exists but is missing columns (as seen with actor_user_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'subscription_audit_log') THEN
    CREATE TABLE subscription_audit_log (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id        UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      actor_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
      actor_label   TEXT        NOT NULL DEFAULT 'system',
      action        TEXT        NOT NULL,
      old_plan_id   TEXT        REFERENCES subscription_plans(id),
      new_plan_id   TEXT        REFERENCES subscription_plans(id),
      old_status    TEXT,
      new_status    TEXT,
      note          TEXT,
      metadata      JSONB       NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  ELSE
    ALTER TABLE subscription_audit_log ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE subscription_audit_log ADD COLUMN IF NOT EXISTS actor_label   TEXT NOT NULL DEFAULT 'system';
    ALTER TABLE subscription_audit_log ADD COLUMN IF NOT EXISTS action        TEXT; -- will update to NOT NULL if needed, but ADD COLUMN IF NOT EXISTS doesn't support NOT NULL if table has rows without default
    ALTER TABLE subscription_audit_log ADD COLUMN IF NOT EXISTS old_plan_id   TEXT REFERENCES subscription_plans(id);
    ALTER TABLE subscription_audit_log ADD COLUMN IF NOT EXISTS new_plan_id   TEXT REFERENCES subscription_plans(id);
    ALTER TABLE subscription_audit_log ADD COLUMN IF NOT EXISTS old_status    TEXT;
    ALTER TABLE subscription_audit_log ADD COLUMN IF NOT EXISTS new_status    TEXT;
    ALTER TABLE subscription_audit_log ADD COLUMN IF NOT EXISTS note          TEXT;
    ALTER TABLE subscription_audit_log ADD COLUMN IF NOT EXISTS metadata      JSONB NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- ── subscription_notifications ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'subscription_notifications') THEN
    CREATE TABLE subscription_notifications (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id        UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      recipient_email TEXT      NOT NULL,
      notification_type TEXT    NOT NULL,
      subject       TEXT        NOT NULL,
      body_html     TEXT        NOT NULL,
      body_text     TEXT        NOT NULL,
      status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
      attempts      INT         NOT NULL DEFAULT 0,
      sent_at       TIMESTAMPTZ,
      error_message TEXT,
      metadata      JSONB       NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  ELSE
    ALTER TABLE subscription_notifications ADD COLUMN IF NOT EXISTS recipient_email TEXT;
    ALTER TABLE subscription_notifications ADD COLUMN IF NOT EXISTS notification_type TEXT;
    ALTER TABLE subscription_notifications ADD COLUMN IF NOT EXISTS subject       TEXT;
    ALTER TABLE subscription_notifications ADD COLUMN IF NOT EXISTS body_html     TEXT;
    ALTER TABLE subscription_notifications ADD COLUMN IF NOT EXISTS body_text     TEXT;
    ALTER TABLE subscription_notifications ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE subscription_notifications ADD COLUMN IF NOT EXISTS attempts      INT NOT NULL DEFAULT 0;
    ALTER TABLE subscription_notifications ADD COLUMN IF NOT EXISTS sent_at       TIMESTAMPTZ;
    ALTER TABLE subscription_notifications ADD COLUMN IF NOT EXISTS error_message TEXT;
    ALTER TABLE subscription_notifications ADD COLUMN IF NOT EXISTS metadata      JSONB NOT NULL DEFAULT '{}';
  END IF;
END $$;
