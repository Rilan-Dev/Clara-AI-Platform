-- 051_plan_availability.sql
-- Platform-controlled plan availability. Free is disabled by default; paid plans remain available.

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE subscription_plans
   SET enabled = CASE WHEN id = 'free' THEN FALSE ELSE TRUE END
 WHERE id IN ('free','starter','pro','enterprise');

CREATE INDEX IF NOT EXISTS subscription_plans_enabled_idx
  ON subscription_plans (enabled, price_usd);
