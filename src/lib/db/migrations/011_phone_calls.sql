-- ─────────────────────────────────────────────────────────────────────────────
-- 011_phone_calls.sql
-- Clara AI Platform — live phone call feature:
--   phone_call_configs — per-KB phone settings (provider, number, greeting)
--   phone_call_logs    — call history for analytics
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phone_call_configs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id            UUID        NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,

  provider         TEXT        NOT NULL DEFAULT 'twilio'
                                 CHECK (provider IN ('twilio','vonage')),
  enabled          BOOLEAN     NOT NULL DEFAULT FALSE,

  -- The phone number assigned to this KB (E.164 format: +1234567890)
  phone_number     TEXT,

  -- Optional provider account overrides at KB level (NULL = platform creds)
  provider_account_sid  TEXT,
  provider_auth_token   TEXT,

  greeting_message      TEXT    NOT NULL DEFAULT 'Hello! How can I help you today?',
  max_call_duration_sec INTEGER NOT NULL DEFAULT 300,
  record_calls          BOOLEAN NOT NULL DEFAULT FALSE,
  transcribe_calls      BOOLEAN NOT NULL DEFAULT TRUE,
  webhook_url_override  TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (kb_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_phone_call_configs_kb_id ON phone_call_configs (kb_id);
CREATE INDEX IF NOT EXISTS idx_phone_call_configs_phone_number
  ON phone_call_configs (phone_number)
  WHERE phone_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS phone_call_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id        UUID        REFERENCES phone_call_configs(id) ON DELETE SET NULL,
  kb_id            UUID        REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  provider         TEXT        NOT NULL,

  call_sid         TEXT        NOT NULL,  -- Twilio/Vonage call SID
  from_number      TEXT,
  to_number        TEXT,
  direction        TEXT        NOT NULL DEFAULT 'inbound'
                                 CHECK (direction IN ('inbound','outbound')),
  status           TEXT        NOT NULL DEFAULT 'initiated'
                                 CHECK (status IN ('initiated','ringing','in-progress',
                                                   'completed','failed','busy','no-answer','canceled')),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at      TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  duration_sec     INTEGER,
  turn_count       INTEGER     NOT NULL DEFAULT 0,
  transcript       JSONB       NOT NULL DEFAULT '[]',  -- [{speaker,text,ts}]
  recording_url    TEXT,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_call_logs_kb_id    ON phone_call_logs (kb_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_call_logs_call_sid ON phone_call_logs (call_sid);
