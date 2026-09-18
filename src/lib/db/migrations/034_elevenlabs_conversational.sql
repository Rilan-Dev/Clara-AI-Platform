-- ─────────────────────────────────────────────────────────────────────────────
-- 034_elevenlabs_conversational.sql
-- Clara AI Platform — ElevenLabs integration Phases V4–V6 (see
-- Doc/18-07-2026/ELEVENLABS_INTEGRATION_PLAN.md §10 + §14 V4/V5/V6).
--
-- Scope:
--   • Mode B (Conversational AI) post-call records + org-scoped history
--   • Webhook/tool-callback replay guard (nonce ledger)
--   • Credit-burn alerting state (V6)
--   • Platform env key catalogue additions for the new flags/secrets
--
-- All changes are additive. Mode B stays OFF until an operator sets
-- ELEVENLABS_CONVERSATIONAL_AI_ENABLED — no tenant sees any change on deploy.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Post-call conversation records (Mode B history + audit parity) ────────

CREATE TABLE IF NOT EXISTS elevenlabs_conversations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  -- Tenant-scoped binding to the Mode-B agent mapping (composite FK target
  -- keeps the row org-scoped even when only the mapping id is known).
  agent_mapping_id   UUID NOT NULL,
  conversation_id    TEXT NOT NULL,
  agent_id           TEXT,
  status             TEXT NOT NULL DEFAULT 'done'
                       CHECK (status IN ('processing', 'done', 'failed')),
  -- PII-redacted at write time (src/lib/redact.ts) — raw transcripts are
  -- never persisted, mirroring query_events discipline.
  transcript         JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis           JSONB NOT NULL DEFAULT '{}'::jsonb,
  language           TEXT,
  -- Measured facts for CONVERSATION metering (billed unit = seconds).
  started_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  duration_seconds   NUMERIC,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, conversation_id),
  UNIQUE (id, org_id)
);

CREATE INDEX IF NOT EXISTS elevenlabs_conversations_org_idx
  ON elevenlabs_conversations (org_id, created_at DESC);

COMMENT ON TABLE elevenlabs_conversations IS 'Mode-B (Conversational AI) post-call records, org-scoped. Transcripts are PII-redacted before insert; raw audio is never stored.';

-- ── 2. Webhook / tool-callback nonce ledger (replay guard) ──────────────────

CREATE TABLE IF NOT EXISTS elevenlabs_webhook_nonces (
  nonce        TEXT PRIMARY KEY,
  kind         TEXT NOT NULL DEFAULT 'tool'
                 CHECK (kind IN ('tool', 'post-call')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS elevenlabs_webhook_nonces_created_idx
  ON elevenlabs_webhook_nonces (created_at);

COMMENT ON TABLE elevenlabs_webhook_nonces IS 'Single-use nonce ledger for signed ElevenLabs callbacks. Rows are swept by TTL — see voice-core/webhook-auth.ts.';

-- ── 3. Credit-burn alert state (V6 — keyed on the single platform account) ──

CREATE TABLE IF NOT EXISTS elevenlabs_credit_alerts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_pct      INTEGER NOT NULL,
  character_count    INTEGER NOT NULL,
  character_limit    INTEGER NOT NULL,
  -- Notification is queued through subscription_notifications (same
  -- outbound worker); status mirrors its lifecycle.
  notified           BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (threshold_pct, character_limit)
);

COMMENT ON TABLE elevenlabs_credit_alerts IS 'Credit-burn threshold crossings (V6). One row per (threshold, limit) pair — re-alerting requires the limit to change or the threshold to be raised.';

-- ── 4. Conversation-history sync bookkeeping on the agent mapping ───────────

ALTER TABLE elevenlabs_agents
  ADD COLUMN IF NOT EXISTS last_conversation_sync_at TIMESTAMPTZ;

-- ── 5. Platform env key catalogue additions (AI category) ───────────────────
-- Values stay blank/neutral; the admin settings page supplies real values.
-- NOTE: ELEVENLABS_CONVERSATIONAL_AI_ENABLED requires a restart because the
-- CSP middleware (src/security/csp.ts) snapshots the Mode-B websocket origin
-- per process instance — flipping it live would leave browsers blocked.

INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('ELEVENLABS_CONVERSATIONAL_AI_ENABLED', 'false', 'Mode B: Conversational AI agents (true|false) — opt-in, disclosure-gated, adds wss://api.elevenlabs.io to CSP (requires restart)', 'ai', FALSE, TRUE),
  ('ELEVENLABS_VOICE_CLONING_ENABLED',     'false', 'Instant voice cloning (true|false) — consent attestation still required per voice', 'ai', FALSE, FALSE),
  ('ELEVENLABS_VOICE_DESIGN_ENABLED',      'false', 'Voice Design — prompt to voice (true|false)', 'ai', FALSE, FALSE),
  ('ELEVENLABS_TOOL_HMAC_SECRET',          '',      'HMAC secret for the Mode-B RAG server-tool callback (/api/internal/elevenlabs/tools/rag-search)', 'ai', TRUE,  FALSE),
  ('ELEVENLABS_WEBHOOK_SECRET',            '',      'Signing secret for ElevenLabs post-call webhooks (/api/webhooks/elevenlabs/post-call)', 'ai', TRUE,  FALSE),
  ('ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT','80',    'Alert when the ElevenLabs character budget is this percent consumed (V6 credit-burn alerting)', 'ai', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;
