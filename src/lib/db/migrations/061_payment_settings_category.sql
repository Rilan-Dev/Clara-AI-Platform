-- 060: repair payment setting category drift
-- PaymentGatewayPanel intentionally reads only category = 'payments'.
-- Older rows can drift to 'general'/'billing'. Normalize the authoritative
-- payment keys back to their owning category so saved credentials remain
-- visible to the Payment settings UI.
UPDATE platform_env_settings
SET category = 'payments'
WHERE key IN (
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_PRO',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  'NEXT_PUBLIC_APP_URL'
)
AND category <> 'payments';
