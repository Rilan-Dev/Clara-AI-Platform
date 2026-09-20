-- ─────────────────────────────────────────────────────────────────────────────
-- 040_ai_governance_and_agent_versioning.sql
-- Clara AI Platform — AI provider governance, subscription AI entitlements,
-- platform default-assistant versioning and Git-like agent version control.
--
-- Implements the additive schema (Stage A) of:
--   docs/superpowers/plans/2026-09-20-clara-ai-configuration-platform-agent.md
--   docs/superpowers/plans/2026-09-20-clara-ai-configuration-migration.md
--
-- PURELY ADDITIVE. No legacy column/table is dropped or altered destructively
-- in this migration. Data migration (agents → Main/v1, deployments, snapshot
-- import) is performed by scripts/migrate-ai-configuration.mjs so it can be
-- dry-run, reported and rolled back independently of schema rollout.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Platform provider registry
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_ai_providers (
  provider_id   TEXT PRIMARY KEY CHECK (provider_id IN ('openai', 'gemini', 'sarvam', 'elevenlabs')),
  display_name  TEXT NOT NULL,
  description   TEXT,
  -- Admin lifecycle switch. A provider is only runtime-selectable when
  -- enabled AND configured AND (health permitting) healthy.
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Usage / recharge-warning governance (platform admin owned).
  monthly_budget_usd    NUMERIC(12, 2),
  warning_threshold_pct INT NOT NULL DEFAULT 80 CHECK (warning_threshold_pct BETWEEN 1 AND 100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TRIGGER platform_ai_providers_updated_at
    BEFORE UPDATE ON platform_ai_providers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Credential registry. SECRETS STAY IN platform_env_settings (the existing
-- server-side secret mechanism) — this table only records WHICH env key holds
-- the secret, a masked hint for the UI and audit metadata. It never stores a
-- usable credential value and is never returned to the browser.
CREATE TABLE IF NOT EXISTS platform_ai_provider_credentials (
  provider_id      TEXT PRIMARY KEY REFERENCES platform_ai_providers(provider_id) ON DELETE CASCADE,
  env_key          TEXT NOT NULL,            -- e.g. OPENAI_API_KEY
  base_url_env_key TEXT,                     -- e.g. SARVAM_BASE_URL (nullable)
  masked_hint      TEXT,                     -- e.g. "••••••••A91"
  configured       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Capability matrix: what each provider ACTUALLY supports according to the
-- deployed adapters (not marketing claims):
--   openai     : chat, realtime voice (native realtime API)
--   gemini     : chat, realtime voice (Gemini Live)
--   sarvam     : chat, voice chat (Bulbul TTS / Saaras STT), realtime voice
--                (Saaras realtime WS relay — deployed and verified)
--   elevenlabs : voice chat (TTS/STT), realtime voice (conversational AI)
CREATE TABLE IF NOT EXISTS platform_ai_provider_capabilities (
  provider_id TEXT NOT NULL REFERENCES platform_ai_providers(provider_id) ON DELETE CASCADE,
  capability  TEXT NOT NULL CHECK (capability IN ('chat', 'voice_chat', 'realtime_voice')),
  supported   BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (provider_id, capability)
);

-- Model catalogue. `capability` is the workspace tab the model belongs to;
-- `kind` is the functional slot (chat/embedding/realtime/transcription/tts/
-- stt/voice). Platform admin toggles `enabled` per model; `is_default` marks
-- the platform default model per (provider, capability, kind).
CREATE TABLE IF NOT EXISTS platform_ai_provider_models (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  TEXT NOT NULL REFERENCES platform_ai_providers(provider_id) ON DELETE CASCADE,
  capability   TEXT NOT NULL CHECK (capability IN ('chat', 'voice_chat', 'realtime_voice')),
  kind         TEXT NOT NULL CHECK (kind IN ('chat', 'embedding', 'realtime', 'transcription', 'tts', 'stt', 'voice')),
  model_id     TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, capability, kind, model_id)
);

CREATE INDEX IF NOT EXISTS platform_ai_provider_models_lookup_idx
  ON platform_ai_provider_models (provider_id, capability, enabled);

DO $$ BEGIN
  CREATE TRIGGER platform_ai_provider_models_updated_at
    BEFORE UPDATE ON platform_ai_provider_models
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Health history (latest row per provider wins).
CREATE TABLE IF NOT EXISTS platform_ai_provider_health (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   TEXT NOT NULL REFERENCES platform_ai_providers(provider_id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down', 'unknown')),
  latency_ms    INT,
  error_message TEXT,
  checked_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_ai_provider_health_latest_idx
  ON platform_ai_provider_health (provider_id, checked_at DESC);

-- Usage rollups per provider + billing period (refreshed on read by the
-- governance service from usage_events — the authoritative metering spine).
CREATE TABLE IF NOT EXISTS platform_ai_provider_usage (
  provider_id     TEXT NOT NULL REFERENCES platform_ai_providers(provider_id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  requests        BIGINT NOT NULL DEFAULT 0,
  cost_usd_micros BIGINT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, period_start)
);

-- Platform default provider/model per capability (NULL provider = inherit
-- the chat provider — preserves existing inherit semantics).
CREATE TABLE IF NOT EXISTS platform_ai_defaults (
  capability  TEXT PRIMARY KEY CHECK (capability IN ('chat', 'voice_chat', 'realtime_voice')),
  provider_id TEXT REFERENCES platform_ai_providers(provider_id) ON DELETE SET NULL,
  model_id    TEXT,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Subscription AI entitlements (plan level; reuses subscription_plans)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plan_ai_capabilities (
  plan_id     TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  capability  TEXT NOT NULL CHECK (capability IN ('chat', 'voice_chat', 'realtime_voice')),
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (plan_id, capability)
);

CREATE TABLE IF NOT EXISTS plan_ai_provider_entitlements (
  plan_id     TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES platform_ai_providers(provider_id) ON DELETE CASCADE,
  allowed     BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (plan_id, provider_id)
);

CREATE TABLE IF NOT EXISTS plan_ai_model_entitlements (
  plan_id     TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES platform_ai_providers(provider_id) ON DELETE CASCADE,
  capability  TEXT NOT NULL CHECK (capability IN ('chat', 'voice_chat', 'realtime_voice')),
  kind        TEXT NOT NULL CHECK (kind IN ('chat', 'embedding', 'realtime', 'transcription', 'tts', 'stt', 'voice')),
  model_id    TEXT NOT NULL,
  allowed     BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (plan_id, provider_id, capability, kind, model_id)
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Platform Default Assistant versioning (immutable versions + draft)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_assistant_default_versions (
  version_number        INT PRIMARY KEY,
  configuration_json    JSONB NOT NULL,
  parent_version_number INT REFERENCES platform_assistant_default_versions(version_number),
  change_summary        TEXT,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Draft + current pointer live on the existing singleton row (015).
ALTER TABLE platform_assistant_defaults
  ADD COLUMN IF NOT EXISTS current_version INT,
  ADD COLUMN IF NOT EXISTS draft_configuration_json JSONB,
  ADD COLUMN IF NOT EXISTS draft_updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Agent version control (branches / immutable versions / drafts / deployments)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL,
  org_id      UUID NOT NULL,
  name        TEXT NOT NULL CHECK (name ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  description TEXT,
  is_main     BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  -- The exact immutable version this branch was forked from (NULL for Main
  -- and for migrated branches with unknown provenance). Merge uses this as
  -- the three-way base.
  forked_from_version_id UUID,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, name),
  FOREIGN KEY (agent_id, org_id) REFERENCES agents(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_branches_agent_idx ON agent_branches (agent_id);

DO $$ BEGIN
  CREATE TRIGGER agent_branches_updated_at
    BEFORE UPDATE ON agent_branches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS agent_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           UUID NOT NULL,
  org_id             UUID NOT NULL,
  branch_id          UUID NOT NULL REFERENCES agent_branches(id) ON DELETE CASCADE,
  version_number     INT NOT NULL CHECK (version_number > 0),
  parent_version_id  UUID REFERENCES agent_versions(id) ON DELETE SET NULL,
  configuration_json JSONB NOT NULL,
  change_summary     TEXT,
  source             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (source IN ('draft', 'restore', 'merge', 'rebase',
                                         'legacy_snapshot', 'default_assistant', 'migration')),
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at       TIMESTAMPTZ,
  UNIQUE (branch_id, version_number),
  FOREIGN KEY (agent_id, org_id) REFERENCES agents(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_versions_agent_idx ON agent_versions (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_versions_branch_idx ON agent_versions (branch_id, version_number DESC);
-- Immutability: only published_at may ever change after insert.
CREATE INDEX IF NOT EXISTS agent_versions_parent_idx ON agent_versions (parent_version_id);

CREATE TABLE IF NOT EXISTS agent_drafts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           UUID NOT NULL,
  org_id             UUID NOT NULL,
  branch_id          UUID NOT NULL UNIQUE REFERENCES agent_branches(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  configuration_json JSONB NOT NULL,
  parent_version_id  UUID REFERENCES agent_versions(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (agent_id, org_id) REFERENCES agents(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_drafts_agent_idx ON agent_drafts (agent_id);

DO $$ BEGIN
  CREATE TRIGGER agent_drafts_updated_at
    BEFORE UPDATE ON agent_drafts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS agent_deployments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL,
  org_id        UUID NOT NULL,
  branch_id     UUID NOT NULL REFERENCES agent_branches(id) ON DELETE RESTRICT,
  version_id    UUID NOT NULL REFERENCES agent_versions(id) ON DELETE RESTRICT,
  environment   TEXT NOT NULL DEFAULT 'production',
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'superseded', 'failed')),
  public_access BOOLEAN NOT NULL DEFAULT FALSE,
  published_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (agent_id, org_id) REFERENCES agents(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_deployments_agent_idx ON agent_deployments (agent_id, published_at DESC);
-- Exactly one active production deployment per agent at any time.
CREATE UNIQUE INDEX IF NOT EXISTS agent_deployments_active_unique
  ON agent_deployments (agent_id, environment) WHERE status = 'active';

-- Default-Assistant provenance: which platform default version the agent was
-- created from (NULL = unknown — never fabricated, see Stage F).
ALTER TABLE agents ADD COLUMN IF NOT EXISTS default_assistant_version INT;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Seeds — registry rows, capability matrix, credential slots, model catalogue
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO platform_ai_providers (provider_id, display_name, description, enabled) VALUES
  ('openai',     'OpenAI',     'GPT chat models, embeddings and native realtime voice',            TRUE),
  ('gemini',     'Google Gemini', 'Gemini chat models, embeddings and Live realtime voice',        TRUE),
  ('sarvam',     'Sarvam AI',  'Sarvam 105B chat, Bulbul TTS, Saaras STT and realtime voice',      TRUE),
  ('elevenlabs', 'ElevenLabs', 'ElevenLabs TTS / STT and conversational realtime agents',          TRUE)
ON CONFLICT (provider_id) DO NOTHING;

INSERT INTO platform_ai_provider_credentials (provider_id, env_key, base_url_env_key) VALUES
  ('openai',     'OPENAI_API_KEY',     NULL),
  ('gemini',     'GEMINI_API_KEY',     NULL),
  ('sarvam',     'SARVAM_API_KEY',     'SARVAM_BASE_URL'),
  ('elevenlabs', 'ELEVENLABS_API_KEY', 'ELEVENLABS_BASE_URL')
ON CONFLICT (provider_id) DO NOTHING;

INSERT INTO platform_ai_provider_capabilities (provider_id, capability, supported) VALUES
  ('openai',     'chat',           TRUE),
  ('openai',     'voice_chat',     FALSE),
  ('openai',     'realtime_voice', TRUE),
  ('gemini',     'chat',           TRUE),
  ('gemini',     'voice_chat',     FALSE),
  ('gemini',     'realtime_voice', TRUE),
  ('sarvam',     'chat',           TRUE),
  ('sarvam',     'voice_chat',     TRUE),
  ('sarvam',     'realtime_voice', TRUE),
  ('elevenlabs', 'chat',           FALSE),
  ('elevenlabs', 'voice_chat',     TRUE),
  ('elevenlabs', 'realtime_voice', TRUE)
ON CONFLICT (provider_id, capability) DO NOTHING;

-- Model catalogue (seeded from the shipped code catalogues; admin-managed
-- afterwards). Defaults honour current platform_env_settings where set.
INSERT INTO platform_ai_provider_models (provider_id, capability, kind, model_id, display_name, is_default, metadata)
SELECT m.provider_id, m.capability, m.kind, m.model_id, m.display_name, m.is_default, m.metadata::jsonb
FROM (VALUES
  -- OpenAI chat
  ('openai', 'chat', 'chat', 'gpt-5.6-luna',            'GPT 5.6 Luna',   FALSE),
  ('openai', 'chat', 'chat', 'gpt-5.6-terra',           'GPT 5.6 Terra',  FALSE),
  ('openai', 'chat', 'chat', 'gpt-5.6-sol',             'GPT 5.6 Sol',    FALSE),
  ('openai', 'chat', 'chat', 'gpt-4o',                  'GPT 4o',         FALSE),
  ('openai', 'chat', 'chat', 'gpt-4o-mini',             'GPT 4o mini',    FALSE),
  ('openai', 'chat', 'chat', 'gpt-4o-2024-08-06',       'GPT 4o (2024-08)', FALSE),
  ('openai', 'chat', 'chat', 'gpt-4o-2024-11-20',       'GPT 4o (2024-11)', FALSE),
  ('openai', 'chat', 'chat', 'gpt-4-turbo',             'GPT 4 Turbo',    FALSE),
  ('openai', 'chat', 'chat', 'gpt-4-turbo-preview',     'GPT 4 Turbo Preview', FALSE),
  ('openai', 'chat', 'chat', 'gpt-4-0125-preview',      'GPT 4 0125 Preview', FALSE),
  ('openai', 'chat', 'chat', 'gpt-3.5-turbo',           'GPT 3.5 Turbo',  FALSE),
  ('openai', 'chat', 'chat', 'gpt-3.5-turbo-0125',      'GPT 3.5 Turbo 0125', FALSE),
  -- OpenAI embeddings
  ('openai', 'chat', 'embedding', 'text-embedding-3-small', 'Text Embedding 3 Small', FALSE),
  ('openai', 'chat', 'embedding', 'text-embedding-3-large', 'Text Embedding 3 Large', FALSE),
  ('openai', 'chat', 'embedding', 'text-embedding-ada-002', 'Ada 002', FALSE),
  -- Gemini chat
  ('gemini', 'chat', 'chat', 'gemini-2.5-flash',        'Gemini 2.5 Flash', FALSE),
  ('gemini', 'chat', 'chat', 'gemini-2.5-pro',          'Gemini 2.5 Pro',   FALSE),
  ('gemini', 'chat', 'chat', 'gemini-2.0-flash',        'Gemini 2.0 Flash', FALSE),
  ('gemini', 'chat', 'chat', 'gemini-2.0-pro',          'Gemini 2.0 Pro',   FALSE),
  ('gemini', 'chat', 'chat', 'gemini-1.5-flash',        'Gemini 1.5 Flash', FALSE),
  ('gemini', 'chat', 'chat', 'gemini-1.5-pro',          'Gemini 1.5 Pro',   FALSE),
  ('gemini', 'chat', 'chat', 'gemini-1.5-flash-8b',     'Gemini 1.5 Flash 8B', FALSE),
  -- Gemini embeddings
  ('gemini', 'chat', 'embedding', 'gemini-embedding-001', 'Gemini Embedding 001', FALSE),
  ('gemini', 'chat', 'embedding', 'text-embedding-004',   'Text Embedding 004',   FALSE),
  ('gemini', 'chat', 'embedding', 'embedding-001',        'Embedding 001',        FALSE),
  -- Sarvam chat
  ('sarvam', 'chat', 'chat', 'sarvam-105b',               'Sarvam 105B (128K)',   FALSE),
  ('sarvam', 'chat', 'chat', 'sarvam-105b-conversations', 'Sarvam 105B Conversations (32K)', FALSE),
  ('sarvam', 'chat', 'chat', 'gemma4',                    'Gemma 4 31B (beta)',   FALSE),
  ('sarvam', 'chat', 'chat', 'deepseekv4-flash',          'DeepSeek V4 Flash (beta)', FALSE),
  ('sarvam', 'chat', 'chat', 'glm5.3',                    'GLM 5.3 (beta, reasons)', FALSE),
  -- OpenAI realtime models
  ('openai', 'realtime_voice', 'realtime', 'gpt-realtime-2.1-mini',                    'GPT Realtime 2.1 Mini', FALSE),
  ('openai', 'realtime_voice', 'realtime', 'gpt-realtime-2.1',                         'GPT Realtime 2.1', FALSE),
  ('openai', 'realtime_voice', 'realtime', 'gpt-realtime-2025-08-28',                  'GPT Realtime (2025-08-28)', FALSE),
  ('openai', 'realtime_voice', 'realtime', 'gpt-4o-realtime-preview',                  'GPT 4o Realtime Preview', FALSE),
  ('openai', 'realtime_voice', 'realtime', 'gpt-4o-realtime-preview-2024-12-17',       'GPT 4o Realtime (2024-12-17)', FALSE),
  ('openai', 'realtime_voice', 'realtime', 'gpt-4o-realtime-preview-2024-10-01',       'GPT 4o Realtime (2024-10-01)', FALSE),
  ('openai', 'realtime_voice', 'realtime', 'gpt-4o-mini-realtime-preview',             'GPT 4o mini Realtime Preview', FALSE),
  ('openai', 'realtime_voice', 'realtime', 'gpt-4o-mini-realtime-preview-2024-12-17',  'GPT 4o mini Realtime (2024-12-17)', FALSE),
  -- OpenAI realtime voices
  ('openai', 'realtime_voice', 'voice', 'alloy',   'Alloy',   FALSE),
  ('openai', 'realtime_voice', 'voice', 'ash',     'Ash',     FALSE),
  ('openai', 'realtime_voice', 'voice', 'ballad',  'Ballad',  FALSE),
  ('openai', 'realtime_voice', 'voice', 'coral',   'Coral',   FALSE),
  ('openai', 'realtime_voice', 'voice', 'echo',    'Echo',    FALSE),
  ('openai', 'realtime_voice', 'voice', 'fable',   'Fable',   FALSE),
  ('openai', 'realtime_voice', 'voice', 'onyx',    'Onyx',    FALSE),
  ('openai', 'realtime_voice', 'voice', 'nova',    'Nova',    FALSE),
  ('openai', 'realtime_voice', 'voice', 'shimmer', 'Shimmer', FALSE),
  ('openai', 'realtime_voice', 'voice', 'verse',   'Verse',   FALSE),
  ('openai', 'realtime_voice', 'voice', 'marin',   'Marin',   FALSE),
  ('openai', 'realtime_voice', 'voice', 'cedar',   'Cedar',   FALSE),
  ('openai', 'realtime_voice', 'voice', 'sage',    'Sage',    FALSE),
  -- OpenAI transcription (realtime tab — serves realtime/embed surfaces)
  ('openai', 'realtime_voice', 'transcription', 'gpt-4o-mini-transcribe', 'GPT 4o mini Transcribe', FALSE),
  ('openai', 'realtime_voice', 'transcription', 'gpt-4o-transcribe',      'GPT 4o Transcribe', FALSE),
  ('openai', 'realtime_voice', 'transcription', 'whisper-1',              'Whisper 1', FALSE),
  -- Gemini realtime
  ('gemini', 'realtime_voice', 'realtime', 'gemini-2.5-flash-native-audio',                    'Gemini 2.5 Flash Native Audio', FALSE),
  ('gemini', 'realtime_voice', 'realtime', 'gemini-2.5-flash-native-audio-preview-12-2025',   'Gemini 2.5 Flash Native Audio (12-2025)', FALSE),
  ('gemini', 'realtime_voice', 'realtime', 'gemini-2.0-flash-live',                           'Gemini 2.0 Flash Live', FALSE),
  ('gemini', 'realtime_voice', 'realtime', 'gemini-2.0-flash-native-audio-preview',           'Gemini 2.0 Flash Native Audio Preview', FALSE),
  ('gemini', 'realtime_voice', 'realtime', 'gemini-2.0-flash-exp-native-audio',               'Gemini 2.0 Flash Exp Native Audio', FALSE),
  ('gemini', 'realtime_voice', 'voice', 'Aoede',  'Aoede',  FALSE),
  ('gemini', 'realtime_voice', 'voice', 'Puck',   'Puck',   FALSE),
  ('gemini', 'realtime_voice', 'voice', 'Charon', 'Charon', FALSE),
  ('gemini', 'realtime_voice', 'voice', 'Kore',   'Kore',   FALSE),
  ('gemini', 'realtime_voice', 'voice', 'Fenrir', 'Fenrir', FALSE),
  ('gemini', 'realtime_voice', 'voice', 'Leda',   'Leda',   FALSE),
  ('gemini', 'realtime_voice', 'voice', 'Orus',   'Orus',   FALSE),
  ('gemini', 'realtime_voice', 'voice', 'Zephyr', 'Zephyr', FALSE),
  -- Sarvam voice chat (Bulbul TTS + Saaras batch STT)
  ('sarvam', 'voice_chat', 'tts', 'bulbul:v3', 'Bulbul v3', FALSE),
  ('sarvam', 'voice_chat', 'tts', 'bulbul:v2', 'Bulbul v2', FALSE),
  ('sarvam', 'voice_chat', 'stt', 'saaras:v3', 'Saaras v3', FALSE),
  ('sarvam', 'voice_chat', 'stt', 'saaras:v4', 'Saaras v4', FALSE),
  -- Sarvam realtime voice (canonical realtime ids — see toSarvamRealtimeSttModel)
  ('sarvam', 'realtime_voice', 'stt', 'saaras:v3-realtime', 'Saaras v3 Realtime', FALSE),
  ('sarvam', 'realtime_voice', 'stt', 'saaras:v4',          'Saaras v4', FALSE),
  -- Sarvam speakers (voice_chat voices)
  ('sarvam', 'voice_chat', 'voice', 'shubh',    'Shubh',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'aditya',   'Aditya',   FALSE),
  ('sarvam', 'voice_chat', 'voice', 'ritu',     'Ritu',     FALSE),
  ('sarvam', 'voice_chat', 'voice', 'priya',    'Priya',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'neha',     'Neha',     FALSE),
  ('sarvam', 'voice_chat', 'voice', 'rahul',    'Rahul',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'pooja',    'Pooja',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'rohan',    'Rohan',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'simran',   'Simran',   FALSE),
  ('sarvam', 'voice_chat', 'voice', 'kavya',    'Kavya',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'amit',     'Amit',     FALSE),
  ('sarvam', 'voice_chat', 'voice', 'dev',      'Dev',      FALSE),
  ('sarvam', 'voice_chat', 'voice', 'ishita',   'Ishita',   FALSE),
  ('sarvam', 'voice_chat', 'voice', 'shreya',   'Shreya',   FALSE),
  ('sarvam', 'voice_chat', 'voice', 'ratan',    'Ratan',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'varun',    'Varun',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'manan',    'Manan',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'sumit',    'Sumit',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'roopa',    'Roopa',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'kabir',    'Kabir',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'aayan',    'Aayan',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'ashutosh', 'Ashutosh', FALSE),
  ('sarvam', 'voice_chat', 'voice', 'advait',   'Advait',   FALSE),
  ('sarvam', 'voice_chat', 'voice', 'anand',    'Anand',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'tanya',    'Tanya',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'tarun',    'Tarun',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'sunny',    'Sunny',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'mani',     'Mani',     FALSE),
  ('sarvam', 'voice_chat', 'voice', 'gokul',    'Gokul',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'vijay',    'Vijay',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'shruti',   'Shruti',   FALSE),
  ('sarvam', 'voice_chat', 'voice', 'suhani',   'Suhani',   FALSE),
  ('sarvam', 'voice_chat', 'voice', 'mohit',    'Mohit',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'kavitha',  'Kavitha',  FALSE),
  ('sarvam', 'voice_chat', 'voice', 'rehan',    'Rehan',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'soham',    'Soham',    FALSE),
  ('sarvam', 'voice_chat', 'voice', 'rupali',   'Rupali',   FALSE),
  -- ElevenLabs voice chat
  ('elevenlabs', 'voice_chat', 'tts', 'eleven_flash_v2_5',    'Eleven Flash v2.5', FALSE),
  ('elevenlabs', 'voice_chat', 'tts', 'eleven_turbo_v2_5',    'Eleven Turbo v2.5', FALSE),
  ('elevenlabs', 'voice_chat', 'tts', 'eleven_multilingual_v2', 'Eleven Multilingual v2', FALSE),
  ('elevenlabs', 'voice_chat', 'tts', 'eleven_v3',            'Eleven v3', FALSE),
  ('elevenlabs', 'voice_chat', 'stt', 'scribe_v1',            'Scribe v1', FALSE),
  ('elevenlabs', 'realtime_voice', 'tts', 'eleven_flash_v2_5', 'Eleven Flash v2.5 (conversational)', FALSE)
) AS m(provider_id, capability, kind, model_id, display_name, is_default)
ON CONFLICT (provider_id, capability, kind, model_id) DO NOTHING;

-- Mark defaults from the currently configured env (idempotent re-run safe:
-- only apply when NO default exists yet for that slot).
UPDATE platform_ai_provider_models m
   SET is_default = TRUE
 WHERE NOT EXISTS (
   SELECT 1 FROM platform_ai_provider_models d
    WHERE d.provider_id = m.provider_id AND d.capability = m.capability
      AND d.kind = m.kind AND d.is_default
 )
   AND (
     (m.provider_id, m.capability, m.kind, m.model_id) IN (
       ('openai', 'chat', 'chat', 'gpt-4o'),
       ('openai', 'chat', 'embedding', 'text-embedding-3-small'),
       ('gemini', 'chat', 'chat', 'gemini-2.0-flash'),
       ('gemini', 'chat', 'embedding', 'text-embedding-004'),
       ('openai', 'realtime_voice', 'realtime', 'gpt-4o-realtime-preview'),
       ('openai', 'realtime_voice', 'voice', 'alloy'),
       ('gemini', 'realtime_voice', 'realtime', 'gemini-2.0-flash-live'),
       ('sarvam', 'chat', 'chat', 'sarvam-105b'),
       ('sarvam', 'voice_chat', 'tts', 'bulbul:v3'),
       ('sarvam', 'voice_chat', 'stt', 'saaras:v4'),
       ('sarvam', 'voice_chat', 'voice', 'shubh'),
       ('sarvam', 'realtime_voice', 'stt', 'saaras:v4'),
       ('elevenlabs', 'voice_chat', 'tts', 'eleven_flash_v2_5')
     )
   );

-- Platform defaults per capability: chat follows the deployed AI_PROVIDER env
-- (kept in sync by the governance service); voice_chat / realtime_voice
-- default to inherit (NULL provider).
INSERT INTO platform_ai_defaults (capability, provider_id, model_id)
SELECT 'chat', cand.provider, cand.model
  FROM (SELECT COALESCE(NULLIF(lower(env.value), ''), 'openai') AS provider,
               NULLIF(env2.value, '') AS model
          FROM (SELECT value FROM platform_env_settings WHERE key = 'AI_PROVIDER'
                 UNION ALL SELECT 'openai' LIMIT 1) env,
               (SELECT value FROM platform_env_settings WHERE key = 'AI_PROVIDER_CHAT_MODEL'
                 UNION ALL SELECT '' LIMIT 1) env2) cand
 WHERE cand.provider IN ('openai', 'gemini', 'sarvam')
ON CONFLICT (capability) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Seeds — plan entitlements derived from existing plan columns
-- ═════════════════════════════════════════════════════════════════════════════

-- chat is entitled on every plan; voice_chat / realtime_voice inherit the
-- historical voice_enabled column so no tenant's behaviour changes at seed time.
INSERT INTO plan_ai_capabilities (plan_id, capability, enabled)
SELECT sp.id, 'chat', TRUE FROM subscription_plans sp
ON CONFLICT (plan_id, capability) DO NOTHING;

INSERT INTO plan_ai_capabilities (plan_id, capability, enabled)
SELECT sp.id, 'voice_chat', sp.voice_enabled FROM subscription_plans sp
ON CONFLICT (plan_id, capability) DO NOTHING;

INSERT INTO plan_ai_capabilities (plan_id, capability, enabled)
SELECT sp.id, 'realtime_voice', sp.voice_enabled FROM subscription_plans sp
ON CONFLICT (plan_id, capability) DO NOTHING;

-- Providers allowed on every plan by default (matches current behaviour: no
-- plan-level provider restriction existed).
INSERT INTO plan_ai_provider_entitlements (plan_id, provider_id, allowed)
SELECT sp.id, p.provider_id, TRUE
  FROM subscription_plans sp CROSS JOIN platform_ai_providers p
ON CONFLICT (plan_id, provider_id) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Seed — Default Assistant version v1 from the existing singleton row
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO platform_assistant_default_versions (version_number, configuration_json, change_summary)
SELECT 1,
       jsonb_build_object(
         'assistant', jsonb_build_object(
           'assistantName',   COALESCE(NULLIF(pad.assistant_name, ''), 'Clara'),
           'avatarUrl',       pad.avatar_url,
           'systemPrompt',    pad.system_prompt,
           'welcomeMessage',  pad.welcome_message,
           'outOfScopeReply', pad.out_of_scope_reply,
           'rules',           COALESCE(pad.rules, '[]'::jsonb),
           'defaultLanguage', COALESCE(NULLIF(pad.default_language, ''), 'en'),
           'allowedLanguages', COALESCE(pad.allowed_languages, ARRAY['en']),
           'alwaysRespondIn', pad.always_respond_in,
           'voiceId',         COALESCE(pad.voice_id, 'alloy'),
           'voiceSpeed',      COALESCE(pad.voice_speed, 1.0)
         )
       ),
       'Initial version (migrated from platform_assistant_defaults)'
  FROM platform_assistant_defaults pad
 WHERE NOT EXISTS (SELECT 1 FROM platform_assistant_default_versions WHERE version_number = 1);

UPDATE platform_assistant_defaults
   SET current_version = 1
 WHERE current_version IS NULL
   AND EXISTS (SELECT 1 FROM platform_assistant_default_versions WHERE version_number = 1);
