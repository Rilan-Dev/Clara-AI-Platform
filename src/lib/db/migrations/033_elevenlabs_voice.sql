-- ─────────────────────────────────────────────────────────────────────────────
-- 033_elevenlabs_voice.sql
-- Clara AI Platform — ElevenLabs hybrid voice integration (see
-- Doc/18-07-2026/ELEVENLABS_INTEGRATION_PLAN.md §10).
--
-- Design: ElevenLabs is a VOICE provider, never a brain provider. A new
-- voice-provider axis (openai | gemini | elevenlabs) is added orthogonally
-- to the existing AIProvider union so chat/embedding/RAG resolution is
-- completely untouched. NULL = inherit the brain provider (default), so
-- existing tenants see zero behavioural change on deploy.
--
-- All changes are additive except two CHECK widenings (idempotent guards).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Voice-provider axis on the org / agent / kb settings chain ───────────

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS voice_provider TEXT
    CHECK (voice_provider IS NULL OR voice_provider IN ('openai','gemini','elevenlabs'));

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS allowed_voice_providers TEXT[]
    NOT NULL DEFAULT ARRAY['openai','gemini','elevenlabs'];

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS elevenlabs_tts_model TEXT;

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS elevenlabs_stt_model TEXT;

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS default_elevenlabs_voice TEXT;

ALTER TABLE agent_ai_settings
  ADD COLUMN IF NOT EXISTS voice_provider TEXT
    CHECK (voice_provider IS NULL OR voice_provider IN ('openai','gemini','elevenlabs'));

ALTER TABLE kb_ai_overrides
  ADD COLUMN IF NOT EXISTS voice_provider TEXT
    CHECK (voice_provider IS NULL OR voice_provider IN ('openai','gemini','elevenlabs'));

-- ── 2. Widen the organisation voice catalog to elevenlabs voices ────────────
-- (drop + re-add only when the old constraint shape is present)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'organisation_voices_provider_check'
       AND conrelid = 'organisation_voices'::regclass
  ) THEN
    ALTER TABLE organisation_voices DROP CONSTRAINT organisation_voices_provider_check;
  END IF;
  ALTER TABLE organisation_voices
    ADD CONSTRAINT organisation_voices_provider_check
    CHECK (provider IN ('openai','gemini','elevenlabs'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Org ElevenLabs voice catalog (workspace + shared-library imports) ────

CREATE TABLE IF NOT EXISTS elevenlabs_voices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  voice_id           TEXT NOT NULL,
  name               TEXT NOT NULL,
  category           TEXT,
  labels             JSONB NOT NULL DEFAULT '{}'::jsonb,
  description        TEXT,
  cloned             BOOLEAN NOT NULL DEFAULT FALSE,
  consent_attested_at TIMESTAMPTZ,
  added_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, voice_id),
  UNIQUE (id, org_id)
);

CREATE INDEX IF NOT EXISTS elevenlabs_voices_org_idx ON elevenlabs_voices (org_id);

COMMENT ON TABLE elevenlabs_voices IS 'Org-scoped catalog of ElevenLabs voice ids available for assignment. Voice audio/definitions stay at ElevenLabs; only ids and labels are stored here.';

-- ── 4. Mode-B (Conversational AI) agent mapping — future phase, schema now ──

CREATE TABLE IF NOT EXISTS elevenlabs_agents (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id                    UUID NOT NULL,
  elevenlabs_agent_id         TEXT NOT NULL,
  mode                        TEXT NOT NULL DEFAULT 'conversational'
                                CHECK (mode IN ('conversational')),
  org_acknowledged_data_flow  BOOLEAN NOT NULL DEFAULT FALSE,
  config_snapshot             JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled                     BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at              TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, agent_id),
  UNIQUE (id, org_id)
);

CREATE INDEX IF NOT EXISTS elevenlabs_agents_org_idx ON elevenlabs_agents (org_id);

COMMENT ON TABLE elevenlabs_agents IS 'Mode-B opt-in mapping: a Clara agent bound to an ElevenLabs Conversational AI agent. org_acknowledged_data_flow must be TRUE before any session is minted.';

-- ── 5. Extend usage_events kinds with CONVERSATION ──────────────────────────

DO $$
BEGIN
  ALTER TABLE usage_events DROP CONSTRAINT usage_events_kind_check;
  ALTER TABLE usage_events ADD CONSTRAINT usage_events_kind_check
    CHECK (kind IN ('EMBEDDING','TTS','OCR','TRANSCRIPTION','CONVERSATION'));
EXCEPTION
  WHEN undefined_object THEN NULL;  -- constraint already swapped by an earlier run
END $$;

-- ── 6. Plan budget columns (dormant defaults — behaviour unchanged) ─────────

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_tts_chars_day INTEGER NOT NULL DEFAULT -1;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_stt_audio_sec_day INTEGER NOT NULL DEFAULT -1;

ALTER TABLE subscription_plan_versions
  ADD COLUMN IF NOT EXISTS max_tts_chars_day INTEGER NOT NULL DEFAULT -1;

ALTER TABLE subscription_plan_versions
  ADD COLUMN IF NOT EXISTS max_stt_audio_sec_day INTEGER NOT NULL DEFAULT -1;

-- ── 7. Platform env key catalogue additions (AI category) ───────────────────
-- Values stay blank; the admin settings page supplies real credentials.

INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('ELEVENLABS_ENABLED',           'false', 'Enable ElevenLabs voice provider (true|false)', 'ai', FALSE, FALSE),
  ('ELEVENLABS_API_KEY',           '',      'ElevenLabs API Key',                            'ai', TRUE,  FALSE),
  ('ELEVENLABS_DEFAULT_TTS_MODEL', 'eleven_flash_v2_5', 'ElevenLabs default TTS model',      'ai', FALSE, FALSE),
  ('ELEVENLABS_DEFAULT_STT_MODEL', 'scribe_v1', 'ElevenLabs default STT model (Scribe)',      'ai', FALSE, FALSE),
  ('ELEVENLABS_DEFAULT_VOICE_ID',  '',      'ElevenLabs platform default voice id',          'ai', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;
