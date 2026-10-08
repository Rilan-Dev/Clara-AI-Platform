-- 060_payment_settings_category.sql
-- Repair platform payment setting metadata.
--
-- Migration 012 seeded Stripe/Razorpay settings under the payments category.
-- Some existing installations have those rows persisted as "general" (the
-- value itself remained correct), which makes Settings → Payments filter them
-- out and incorrectly renders the gateway as "Not configured".
--
-- This is metadata-only: credential values are never changed.

UPDATE platform_env_settings
SET category = 'payments'
WHERE key IN (
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_PRO',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  'RAZORPAY_WEBHOOK_SECRET'
)
  AND category <> 'payments';
