-- 063_payment_settings_category.sql
-- Repair platform payment setting metadata.
--
-- Migration 012 seeded Stripe/Razorpay credentials and NEXT_PUBLIC_APP_URL
-- under the payments category. Some existing installations have these rows
-- persisted as "general", which makes the Settings → Payments projection hide
-- configured values and render a misleading "Not configured" state.
--
-- Metadata-only correction: credential values are never changed.

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
  'RAZORPAY_WEBHOOK_SECRET',
  'NEXT_PUBLIC_APP_URL'
)
  AND category <> 'payments';
