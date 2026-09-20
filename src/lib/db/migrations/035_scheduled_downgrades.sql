-- ─────────────────────────────────────────────────────────────────────────────
-- 035_scheduled_downgrades.sql
-- Clara AI Platform — scheduled downgrades (WS-1.3)
--
-- Self-serve downgrades (Pro → Starter, Starter → Free, Pro → Free) are not
-- applied immediately: the org keeps its current plan's features until the
-- current billing period ends (no refund for unused time), then the
-- downgrade sweep (subscription-expiry.ts) flips `plan_id` to
-- `scheduled_plan_id` and clears both columns.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE org_subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_plan_id TEXT REFERENCES subscription_plans(id),
  ADD COLUMN IF NOT EXISTS scheduled_at      TIMESTAMPTZ;

COMMENT ON COLUMN org_subscriptions.scheduled_plan_id IS 'Plan to switch to at scheduled_at. NULL when no downgrade is scheduled.';
COMMENT ON COLUMN org_subscriptions.scheduled_at      IS 'When the scheduled downgrade takes effect (usually current_period_end). NULL when no downgrade is scheduled.';
