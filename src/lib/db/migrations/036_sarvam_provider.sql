-- ─────────────────────────────────────────────────────────────────────────────
-- 036_sarvam_provider.sql
-- Clara AI Platform — Sarvam AI integration, Phase V0 foundations (see
-- Doc/SARVAM_AI_INTEGRATION_PLAN.md §11).
--
-- Design: Sarvam joins BOTH axes. On the brain axis "sarvam" becomes a legal
-- chat provider (org / agent / kb settings chain) — Sarvam publishes NO
-- embeddings API, so embeddings stay on the platform backbone via the
-- resolve-layer split (V1). On the voice axis "sarvam" becomes a legal
-- pipeline voice provider (Saaras STT + Bulbul TTS), orthogonal to the brain.
-- A third, dormant capability group (translation_mode + TRANSLATION usage
-- kind + plan budgets) lands now so V4 needs no further schema work.
--
-- Dark-launch posture: every seed defaults the provider OFF
-- (SARVAM_ENABLED='false', SARVAM_TRANSLATION_ENABLED='false'). No table is
-- created — Bulbul speakers are a STATIC catalogue in code (no sarvam_voices
-- table, no sync job; an explicit simplification vs 033).
--
-- All changes are additive (ADD COLUMN IF NOT EXISTS, seeded ON CONFLICT DO
-- NOTHING) except CHECK widenings, each wrapped in an idempotent DO $$ guard
-- exactly like 033. Constraint names verified against the live schema:
--   org_ai_settings_default_provider_check        (013, inline column check)
--   org_ai_settings_allowed_providers_check       (013, first of two: <@)
--   org_ai_settings_allowed_providers_check1      (013, cardinality > 0 — NOT touched)
--   agent_ai_settings_provider_check              (008)
--   kb_ai_overrides_provider_check                (014)
--   *_voice_provider_check                        (033, all three tables)
--   organisation_voices_provider_check            (008, widened by 033)
--   usage_events_kind_check                       (033 shape)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Brain-axis provider widenings ('sarvam' becomes legal) ────────────────

DO $$
BEGIN
  ALTER TABLE org_ai_settings DROP CONSTRAINT IF EXISTS org_ai_settings_default_provider_check;
  ALTER TABLE org_ai_settings ADD CONSTRAINT org_ai_settings_default_provider_check
    CHECK (default_provider IN ('openai', 'gemini', 'sarvam'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  -- Only the subset-of-array check is swapped; the cardinality>0 check
  -- (org_ai_settings_allowed_providers_check1) is orthogonal and stays.
  ALTER TABLE org_ai_settings DROP CONSTRAINT IF EXISTS org_ai_settings_allowed_providers_check;
  ALTER TABLE org_ai_settings ADD CONSTRAINT org_ai_settings_allowed_providers_check
    CHECK (allowed_providers <@ ARRAY['openai', 'gemini', 'sarvam']::TEXT[]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE agent_ai_settings DROP CONSTRAINT IF EXISTS agent_ai_settings_provider_check;
  ALTER TABLE agent_ai_settings ADD CONSTRAINT agent_ai_settings_provider_check
    CHECK (provider IN ('openai', 'gemini', 'sarvam'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE kb_ai_overrides DROP CONSTRAINT IF EXISTS kb_ai_overrides_provider_check;
  ALTER TABLE kb_ai_overrides ADD CONSTRAINT kb_ai_overrides_provider_check
    CHECK (provider IN ('openai', 'gemini', 'sarvam'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Voice-axis provider widenings (pipeline provider alongside 033) ────────

DO $$
BEGIN
  ALTER TABLE org_ai_settings DROP CONSTRAINT IF EXISTS org_ai_settings_voice_provider_check;
  ALTER TABLE org_ai_settings ADD CONSTRAINT org_ai_settings_voice_provider_check
    CHECK (voice_provider IS NULL OR voice_provider IN ('openai', 'gemini', 'elevenlabs', 'sarvam'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE agent_ai_settings DROP CONSTRAINT IF EXISTS agent_ai_settings_voice_provider_check;
  ALTER TABLE agent_ai_settings ADD CONSTRAINT agent_ai_settings_voice_provider_check
    CHECK (voice_provider IS NULL OR voice_provider IN ('openai', 'gemini', 'elevenlabs', 'sarvam'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE kb_ai_overrides DROP CONSTRAINT IF EXISTS kb_ai_overrides_voice_provider_check;
  ALTER TABLE kb_ai_overrides ADD CONSTRAINT kb_ai_overrides_voice_provider_check
    CHECK (voice_provider IS NULL OR voice_provider IN ('openai', 'gemini', 'elevenlabs', 'sarvam'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
    CHECK (provider IN ('openai', 'gemini', 'elevenlabs', 'sarvam'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Org-scoped Sarvam voice defaults (mirrors the elevenlabs_* of 033) ────
-- NULL = inherit the platform defaults (SARVAM_TTS_MODEL / SARVAM_STT_MODEL /
-- SARVAM_DEFAULT_SPEAKER env keys below).

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS sarvam_tts_model       TEXT;

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS sarvam_stt_model       TEXT;

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS default_sarvam_speaker TEXT;

COMMENT ON COLUMN org_ai_settings.sarvam_tts_model       IS 'Org override for the Sarvam Bulbul TTS model (NULL = platform default bulbul:v3).';
COMMENT ON COLUMN org_ai_settings.sarvam_stt_model       IS 'Org override for the Sarvam Saaras STT model (NULL = platform default saaras:v3).';
COMMENT ON COLUMN org_ai_settings.default_sarvam_speaker IS 'Org default Bulbul speaker id for the Sarvam voice pipeline (NULL = platform default shubh).';

-- ── 4. Language services groundwork (V4 lands dormant) ──────────────────────
-- translation_mode: 'off' (default — zero vendor calls) | 'query' (incoming
-- question normalized before RAG) | 'query+answer' (answer also translated).
-- The TRANSLATION usage kind and per-plan char budgets ship now so V4 is a
-- pure code phase.

ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS translation_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (translation_mode IN ('off', 'query', 'query+answer'));

DO $$
BEGIN
  ALTER TABLE usage_events DROP CONSTRAINT usage_events_kind_check;
  ALTER TABLE usage_events ADD CONSTRAINT usage_events_kind_check
    CHECK (kind IN ('EMBEDDING', 'TTS', 'OCR', 'TRANSCRIPTION', 'CONVERSATION', 'TRANSLATION'));
EXCEPTION
  WHEN undefined_object THEN NULL;  -- constraint already swapped by an earlier run
END $$;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_translation_chars_day INTEGER NOT NULL DEFAULT -1;

ALTER TABLE subscription_plan_versions
  ADD COLUMN IF NOT EXISTS max_translation_chars_day INTEGER NOT NULL DEFAULT -1;

COMMENT ON COLUMN org_ai_settings.translation_mode IS 'Cross-lingual query pipeline mode: off | query | query+answer (V4; default off = zero translation vendor calls).';
COMMENT ON COLUMN subscription_plans.max_translation_chars_day IS 'Daily translation/transliteration character budget per org (-1 = unlimited).';
COMMENT ON COLUMN subscription_plan_versions.max_translation_chars_day IS 'Daily translation character budget snapshot for immutable plan versions (-1 = unlimited).';

-- ── 5. Platform env catalogue seeds (source of truth = admin Settings page) ──
-- Dark launch: every switch seeds OFF; values stay neutral; the admin
-- settings page supplies real credentials (same posture as 033).

INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('SARVAM_ENABLED',                    'false',                'Master kill switch for the Sarvam provider (brain + voice + language)',        'ai', FALSE, FALSE),
  ('SARVAM_API_KEY',                    '',                     'Sarvam API subscription key (sent as api-subscription-key header)',           'ai', TRUE,  FALSE),
  ('SARVAM_BASE_URL',                   'https://api.sarvam.ai','Sarvam API base URL (SSRF-guarded; override for SageMaker self-hosting)', 'ai', FALSE, FALSE),
  ('SARVAM_TIMEOUT_MS',                 '30000',                'Sarvam vendor timeout in ms (chat 60s, STT 90s headroom)',                    'ai', FALSE, FALSE),
  ('SARVAM_CHAT_MODEL',                 'sarvam-105b',          'Platform default Sarvam chat model',                                          'ai', FALSE, FALSE),
  ('SARVAM_BETA_MODELS_ENABLED',        'false',                'Expose beta open-source chat models (gemma4, glm5.3, deepseekv4-flash)',      'ai', FALSE, FALSE),
  ('SARVAM_TTS_MODEL',                  'bulbul:v3',            'Platform default Bulbul TTS model',                                           'ai', FALSE, FALSE),
  ('SARVAM_STT_MODEL',                  'saaras:v3',            'Platform default Saaras STT model',                                           'ai', FALSE, FALSE),
  ('SARVAM_DEFAULT_SPEAKER',            'shubh',                'Platform default Bulbul speaker',                                             'ai', FALSE, FALSE),
  ('SARVAM_EMBEDDING_FALLBACK_PROVIDER','openai',               'Embedding backbone provider when the brain provider is sarvam',              'ai', FALSE, FALSE),
  ('SARVAM_TRANSLATION_ENABLED',        'false',                'Kill switch for Sarvam language services (translate/transliterate/identify)','ai', FALSE, FALSE),
  ('SARVAM_TRANSLATE_MODEL',            'sarvam-translate:v1',  'Default Sarvam translation model',                                            'ai', FALSE, FALSE),
  ('SARVAM_INR_TO_USD',                 '0.012',                'INR to USD FX rate used for Sarvam cost estimation',                          'ai', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;
