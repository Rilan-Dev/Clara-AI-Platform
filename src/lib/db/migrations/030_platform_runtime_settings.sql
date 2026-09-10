-- Platform runtime configuration managed by the platform administrator.
-- Values may initially be blank and fall back to process.env until saved in DB.

ALTER TABLE platform_env_settings
  DROP CONSTRAINT IF EXISTS platform_env_settings_category_check;

ALTER TABLE platform_env_settings
  ADD CONSTRAINT platform_env_settings_category_check
  CHECK (category IN ('general','ai','phone','auth','billing','email','demo','platform','payments'));

INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('NEXT_PUBLIC_LANDING_EMBED_API_KEY', '', 'Public landing-page embed API key. DB value overrides environment value.', 'platform', false, false),
  ('STRIPE_SECRET_KEY', '', 'Stripe server secret key.', 'payments', true, false),
  ('STRIPE_WEBHOOK_SECRET', '', 'Stripe webhook signing secret.', 'payments', true, false),
  ('STRIPE_PRICE_STARTER', '', 'Stripe recurring price ID for Starter.', 'payments', false, false),
  ('STRIPE_PRICE_PRO', '', 'Stripe recurring price ID for Pro.', 'payments', false, false),
  ('RAZORPAY_KEY_ID', '', 'Razorpay key ID.', 'payments', false, false),
  ('RAZORPAY_KEY_SECRET', '', 'Razorpay server secret.', 'payments', true, false),
  ('RAZORPAY_WEBHOOK_SECRET', '', 'Razorpay webhook signing secret.', 'payments', true, false),
  ('NEXT_PUBLIC_RAZORPAY_KEY_ID', '', 'Browser-safe Razorpay key ID.', 'payments', false, false),
  ('NEXT_PUBLIC_APP_URL', '', 'Public application base URL used by payment redirects.', 'payments', false, false)
ON CONFLICT (key) DO NOTHING;
