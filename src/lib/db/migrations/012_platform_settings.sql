-- ─────────────────────────────────────────────────────────────────────────────
-- 012_platform_settings.sql
-- Clara AI Platform — DB-backed runtime configuration (platform_env_settings).
--
-- The KEY CATALOGUE below is schema reference data: it defines which settings
-- the admin panel can manage. VALUES are intentionally blank/neutral defaults;
-- real credentials are injected by the production seed script or the admin
-- panel — never hardcoded in migrations.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_env_settings (
  key              TEXT        PRIMARY KEY,
  value            TEXT        NOT NULL,
  description      TEXT        NOT NULL DEFAULT '',
  category         TEXT        NOT NULL DEFAULT 'general'
                                 CHECK (category IN ('general','ai','phone','auth','billing',
                                                     'email','demo','platform','payments')),
  is_secret        BOOLEAN     NOT NULL DEFAULT TRUE,   -- mask in UI
  requires_restart BOOLEAN     NOT NULL DEFAULT FALSE,  -- warn admin
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  -- Phone providers
  ('PHONE_PROVIDER',       'twilio', 'Active phone provider (twilio|vonage)', 'phone', FALSE, FALSE),
  ('TWILIO_ACCOUNT_SID',   '', 'Twilio Account SID',           'phone', TRUE,  FALSE),
  ('TWILIO_AUTH_TOKEN',    '', 'Twilio Auth Token',            'phone', TRUE,  FALSE),
  ('TWILIO_PHONE_NUMBER',  '', 'Default Twilio phone number',  'phone', FALSE, FALSE),
  ('VONAGE_API_KEY',       '', 'Vonage API Key',               'phone', TRUE,  FALSE),
  ('VONAGE_API_SECRET',    '', 'Vonage API Secret',            'phone', TRUE,  FALSE),
  ('VONAGE_PHONE_NUMBER',  '', 'Default Vonage phone number',  'phone', FALSE, FALSE),

  -- AI providers
  ('AI_PROVIDER',              'openai', 'Active AI provider (openai|gemini)',  'ai', FALSE, FALSE),
  ('OPENAI_API_KEY',           '', 'OpenAI API Key',                          'ai', TRUE,  FALSE),
  ('OPENAI_CHAT_MODEL',        'gpt-5.6-luna', 'OpenAI chat model',            'ai', FALSE, FALSE),
  ('OPENAI_EMBEDDING_MODEL',   'text-embedding-3-small', 'OpenAI embedding model', 'ai', FALSE, FALSE),
  ('OPENAI_REALTIME_MODEL',    'gpt-realtime-2.1-mini', 'OpenAI realtime model',   'ai', FALSE, FALSE),
  ('OPENAI_TRANSCRIPTION_MODEL', 'gpt-realtime-whisper', 'OpenAI transcription model', 'ai', FALSE, FALSE),
  ('OPENAI_DEFAULT_VOICE',     'alloy', 'OpenAI default voice',                'ai', FALSE, FALSE),
  ('GEMINI_API_KEY',           '', 'Gemini API Key',                          'ai', TRUE,  FALSE),
  ('GEMINI_CHAT_MODEL',        'gemini-3.7-flash', 'Gemini chat model',        'ai', FALSE, FALSE),
  ('GEMINI_EMBEDDING_MODEL',   'text-embedding-004', 'Gemini embedding model', 'ai', FALSE, FALSE),
  ('GEMINI_REALTIME_MODEL',    'gemini-3.7-flash-preview-tts', 'Gemini realtime model', 'ai', FALSE, FALSE),
  ('GEMINI_TRANSCRIPTION_MODEL', 'gemini-3.7-flash', 'Gemini transcription model', 'ai', FALSE, FALSE),
  ('GEMINI_DEFAULT_VOICE',     'Puck', 'Gemini default voice',                 'ai', FALSE, FALSE),
  ('AI_MAX_CHAT_TOKENS',       '4000', 'Maximum chat tokens per request',      'ai', FALSE, FALSE),
  ('AI_MAX_REALTIME_TOKENS',   '1000', 'Maximum realtime tokens per request',  'ai', FALSE, FALSE),
  ('AI_MAX_TEMPERATURE',       '1.0', 'Maximum temperature (0-1)',             'ai', FALSE, FALSE),

  -- Payments (Stripe / Razorpay)
  ('STRIPE_SECRET_KEY',       '', 'Stripe server secret key.',                       'payments', TRUE,  FALSE),
  ('STRIPE_WEBHOOK_SECRET',   '', 'Stripe webhook signing secret.',                  'payments', TRUE,  FALSE),
  ('STRIPE_PRICE_STARTER',    '', 'Stripe recurring price ID for Starter.',          'payments', FALSE, FALSE),
  ('STRIPE_PRICE_PRO',        '', 'Stripe recurring price ID for Pro.',              'payments', FALSE, FALSE),
  ('RAZORPAY_KEY_ID',         '', 'Razorpay key ID.',                                'payments', FALSE, FALSE),
  ('RAZORPAY_KEY_SECRET',     '', 'Razorpay server secret.',                         'payments', TRUE,  FALSE),
  ('RAZORPAY_WEBHOOK_SECRET', '', 'Razorpay webhook signing secret.',                'payments', TRUE,  FALSE),
  ('NEXT_PUBLIC_RAZORPAY_KEY_ID', '', 'Browser-safe Razorpay key ID.',               'payments', FALSE, FALSE),
  ('NEXT_PUBLIC_APP_URL',     '', 'Public application base URL used by payment redirects.', 'payments', FALSE, FALSE),

  -- Platform / landing embed
  ('NEXT_PUBLIC_LANDING_EMBED_API_KEY', '', 'Public landing-page embed API key. DB value overrides environment value.', 'platform', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;
