-- 050_billing_onboarding_gate.sql
-- Paid-plan onboarding must never become active before email verification/payment.

ALTER TABLE org_subscriptions
  DROP CONSTRAINT IF EXISTS org_subscriptions_status_check;

ALTER TABLE org_subscriptions
  ADD CONSTRAINT org_subscriptions_status_check
  CHECK (status IN (
    'active','trialing','past_due','canceled','cancelled','paused',
    'pending_email','payment_required','payment_pending','payment_failed',
    'payment_cancelled','payment_review'
  ));

ALTER TABLE org_subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_id TEXT REFERENCES subscription_plans(id),
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (payment_status IN ('not_started','pending','paid','failed','cancelled','review')),
  ADD COLUMN IF NOT EXISTS payment_order_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_session_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_review_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_onboarding_reminder_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS org_subscriptions_onboarding_status_idx
  ON org_subscriptions(status)
  WHERE status IN ('pending_email','payment_required','payment_pending','payment_failed','payment_cancelled','payment_review');

CREATE UNIQUE INDEX IF NOT EXISTS org_subscriptions_gateway_order_idx
  ON org_subscriptions(gateway, payment_order_id)
  WHERE payment_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION clara_guard_paid_subscription_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  paid_plan BOOLEAN;
  verified BOOLEAN;
BEGIN
  SELECT sp.price_usd > 0 INTO paid_plan
    FROM subscription_plans sp WHERE sp.id = NEW.plan_id;

  IF COALESCE(paid_plan, FALSE) THEN
    SELECT EXISTS (
      SELECT 1
        FROM org_members om
        JOIN users u ON u.id = om.user_id
        JOIN roles r ON r.id = om.role_id
       WHERE om.org_id = NEW.org_id
         AND r.name = 'org_admin'
         AND u.email_verified = TRUE
    ) INTO verified;

    IF NOT verified AND NEW.status IN ('active','trialing') THEN
      NEW.status := 'pending_email';
      NEW.payment_status := 'not_started';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clara_guard_paid_subscription_insert ON org_subscriptions;
CREATE TRIGGER clara_guard_paid_subscription_insert
BEFORE INSERT OR UPDATE OF plan_id, status ON org_subscriptions
FOR EACH ROW EXECUTE FUNCTION clara_guard_paid_subscription_insert();

CREATE OR REPLACE FUNCTION clara_email_verified_moves_onboarding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email_verified = TRUE AND COALESCE(OLD.email_verified, FALSE) = FALSE THEN
    UPDATE org_subscriptions os
       SET status = CASE
         WHEN os.payment_status = 'paid' THEN 'active'
         ELSE 'payment_required'
       END,
       updated_at = now()
      WHERE os.org_id IN (
        SELECT om.org_id
          FROM org_members om
         WHERE om.user_id = NEW.id
      )
        AND os.plan_id IN (
          SELECT id FROM subscription_plans WHERE price_usd > 0
        )
        AND os.status = 'pending_email';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clara_email_verified_moves_onboarding ON users;
CREATE TRIGGER clara_email_verified_moves_onboarding
AFTER UPDATE OF email_verified ON users
FOR EACH ROW EXECUTE FUNCTION clara_email_verified_moves_onboarding();

-- Existing paid rows created by the old signup flow are classified safely.
UPDATE org_subscriptions os
   SET status = CASE
     WHEN EXISTS (
       SELECT 1
         FROM org_members om
         JOIN users u ON u.id = om.user_id
        WHERE om.org_id = os.org_id
          AND u.email_verified = TRUE
     ) THEN 'payment_required'
     ELSE 'pending_email'
   END,
   payment_status = 'not_started',
   updated_at = now()
 WHERE EXISTS (
   SELECT 1
     FROM subscription_plans sp
    WHERE sp.id = os.plan_id
      AND sp.price_usd > 0
 )
   AND os.status IN ('active','trialing')
   AND NOT EXISTS (
     SELECT 1 FROM billing_events be
      WHERE be.org_id = os.org_id
        AND be.plan_id = os.plan_id
        AND be.status = 'paid'
        AND be.event_type IN ('payment.captured','invoice.payment_succeeded','invoice.paid','payment_intent.succeeded')
   );
