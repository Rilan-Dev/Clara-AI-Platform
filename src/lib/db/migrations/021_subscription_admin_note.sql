-- 021_subscription_admin_note.sql
-- Ensure admin_note column exists in org_subscriptions

ALTER TABLE org_subscriptions
  ADD COLUMN IF NOT EXISTS admin_note TEXT;
