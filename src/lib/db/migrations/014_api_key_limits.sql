-- ─────────────────────────────────────────────────────────────────────────────
-- 014_api_key_limits.sql
-- Clara AI — Add max_api_keys column to subscription_plans
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_api_keys INTEGER NOT NULL DEFAULT 0;

-- Free:       0  keys  (no API access)
-- Starter:    3  keys
-- Pro:       10  keys
-- Enterprise: -1 keys  (-1 = unlimited)
UPDATE subscription_plans SET max_api_keys = 0  WHERE id = 'free';
UPDATE subscription_plans SET max_api_keys = 3  WHERE id = 'starter';
UPDATE subscription_plans SET max_api_keys = 10 WHERE id = 'pro';
UPDATE subscription_plans SET max_api_keys = -1 WHERE id = 'enterprise';
