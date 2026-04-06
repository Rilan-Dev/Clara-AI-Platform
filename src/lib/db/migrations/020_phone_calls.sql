-- ─────────────────────────────────────────────────────────────────────────────
-- 020_phone_calls.sql
-- Clara AI — Live Phone Call feature
--
-- Tables:
--   phone_call_configs   — per-KB phone settings (provider, phone number, greeting)
--   phone_call_logs      — call history for analytics
--   platform_env_settings — secure platform-level env overrides (admin panel)
--
-- Subscription plan additions:
--   phone_calls_enabled  — whether the plan includes phone call AI
--   max_phone_numbers    — how many numbers can be configured (-1 = unlimited)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Subscription plan additions ───────────────────────────────────────────────

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS phone_calls_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_phone_numbers   INTEGER NOT NULL DEFAULT 0;

UPDATE subscription_plans SET phone_calls_enabled = FALSE, max_phone_numbers = 0
  WHERE id = 'free';
UPDATE subscription_plans SET phone_calls_enabled = FALSE, max_phone_numbers = 0
  WHERE id = 'starter';
UPDATE subscription_plans SET phone_calls_enabled = TRUE,  max_phone_numbers = 2
  WHERE id = 'pro';
UPDATE subscription_plans SET phone_calls_enabled = TRUE,  max_phone_numbers = -1
  WHERE id = 'enterprise';

-- ── Phone call configurations (per KB) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS phone_call_configs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id            UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,

  -- Provider: twilio | vonage
  provider         TEXT        NOT NULL DEFAULT 'twilio'
                                 CHECK (provider IN ('twilio','vonage')),
  enabled          BOOLEAN     NOT NULL DEFAULT FALSE,

  -- The phone number assigned to this KB (E.164 format: +1234567890)
  phone_number     TEXT,

  -- Optional Twilio/Vonage account overrides at KB level
  -- NULL = use platform-level credentials
  provider_account_sid  TEXT,   -- Twilio: Account SID / Vonage: API Key
  provider_auth_token   TEXT,   -- Twilio: Auth Token / Vonage: API Secret (encrypted)

  -- Call behaviour
  greeting_message      TEXT    NOT NULL DEFAULT 'Hello! How can I help you today?',
  max_call_duration_sec INTEGER NOT NULL DEFAULT 300,  -- 5 min default
  record_calls          BOOLEAN NOT NULL DEFAULT FALSE,
  transcribe_calls      BOOLEAN NOT NULL DEFAULT TRUE,

  -- Webhook URLs (auto-generated from server base URL, but overridable)
  webhook_url_override  TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (kb_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_phone_call_configs_kb_id
  ON phone_call_configs (kb_id);

CREATE INDEX IF NOT EXISTS idx_phone_call_configs_phone_number
  ON phone_call_configs (phone_number)
  WHERE phone_number IS NOT NULL;

-- ── Phone call logs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phone_call_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id        UUID        REFERENCES phone_call_configs(id) ON DELETE SET NULL,
  kb_id            UUID        REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  provider         TEXT        NOT NULL,

  -- Call metadata
  call_sid         TEXT        NOT NULL,  -- Twilio/Vonage call SID
  from_number      TEXT,                  -- caller's number (may be anonymised)
  to_number        TEXT,                  -- our number
  direction        TEXT        NOT NULL DEFAULT 'inbound'
                                 CHECK (direction IN ('inbound','outbound')),
  status           TEXT        NOT NULL DEFAULT 'initiated'
                                 CHECK (status IN ('initiated','ringing','in-progress','completed','failed','busy','no-answer','canceled')),

  -- Timing
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at      TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  duration_sec     INTEGER,

  -- Content
  turn_count       INTEGER     NOT NULL DEFAULT 0,
  transcript       JSONB       NOT NULL DEFAULT '[]',  -- [{speaker,text,ts}]
  recording_url    TEXT,
  error_message    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_call_logs_kb_id
  ON phone_call_logs (kb_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_call_logs_call_sid
  ON phone_call_logs (call_sid);

-- ── Platform env settings (secure admin-managed env overrides) ────────────────

CREATE TABLE IF NOT EXISTS platform_env_settings (
  key              TEXT        PRIMARY KEY,
  value            TEXT        NOT NULL,   -- stored encrypted at application layer
  description      TEXT        NOT NULL DEFAULT '',
  category         TEXT        NOT NULL DEFAULT 'general'
                                 CHECK (category IN ('general','ai','phone','auth','billing','email')),
  is_secret        BOOLEAN     NOT NULL DEFAULT TRUE,   -- mask in UI
  requires_restart BOOLEAN     NOT NULL DEFAULT FALSE,  -- warn admin
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES users(id) ON DELETE SET NULL
);

-- Seed the known phone provider keys (values come from actual .env at startup)
INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('TWILIO_ACCOUNT_SID',   '', 'Twilio Account SID',           'phone', TRUE,  FALSE),
  ('TWILIO_AUTH_TOKEN',    '', 'Twilio Auth Token',             'phone', TRUE,  FALSE),
  ('TWILIO_PHONE_NUMBER',  '', 'Default Twilio phone number',   'phone', FALSE, FALSE),
  ('VONAGE_API_KEY',       '', 'Vonage API Key',                'phone', TRUE,  FALSE),
  ('VONAGE_API_SECRET',    '', 'Vonage API Secret',             'phone', TRUE,  FALSE),
  ('VONAGE_PHONE_NUMBER',  '', 'Default Vonage phone number',   'phone', FALSE, FALSE),
  ('PHONE_PROVIDER',       'twilio', 'Active phone provider (twilio|vonage)', 'phone', FALSE, FALSE),
  ('OPENAI_API_KEY',       '', 'OpenAI API Key',                'ai',    TRUE,  FALSE),
  ('GEMINI_API_KEY',       '', 'Gemini API Key',                'ai',    TRUE,  FALSE),
  ('AI_PROVIDER',          'openai', 'Active AI provider (openai|gemini)', 'ai', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;
