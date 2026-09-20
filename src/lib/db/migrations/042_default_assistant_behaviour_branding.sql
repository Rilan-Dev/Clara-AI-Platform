-- ─────────────────────────────────────────────────────────────────────────────
-- 042_default_assistant_behaviour_branding.sql
-- Clara AI Platform — full persona parity for the Default Assistant.
--
-- The agent-owned assistant_configs table has carried Behaviour (temperature,
-- max_tokens, cite_sources, strict_mode) and Branding (primary/accent colour)
-- since 001. The platform default assistant (015) only carried
-- Identity/Behaviour-text/Language/Voice — so agents created from the default
-- silently fell back to SQL column defaults for those fields and the platform
-- admin could not manage them.
--
-- This migration gives platform_assistant_defaults the same columns (same
-- constraints and defaults as assistant_configs) so the Default Assistant
-- editor exposes the SAME tabs/fields as the agent "Assistant & AI" page.
-- Values are copied at agent creation time (see organisations/core/db.ts) —
-- existing agents are never touched.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE platform_assistant_defaults
  ADD COLUMN IF NOT EXISTS temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7
    CHECK (temperature BETWEEN 0.0 AND 1.0),
  ADD COLUMN IF NOT EXISTS max_tokens INT NOT NULL DEFAULT 500
    CHECK (max_tokens BETWEEN 50 AND 4000),
  ADD COLUMN IF NOT EXISTS cite_sources BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS strict_mode BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS primary_colour TEXT NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS accent_colour TEXT NOT NULL DEFAULT '#a5b4fc',
  ADD COLUMN IF NOT EXISTS launcher_colour TEXT;

COMMENT ON COLUMN platform_assistant_defaults.temperature IS
  'Default generation temperature copied onto newly created agents (mirrors assistant_configs.temperature).';
COMMENT ON COLUMN platform_assistant_defaults.max_tokens IS
  'Default max response tokens copied onto newly created agents (mirrors assistant_configs.max_tokens).';
COMMENT ON COLUMN platform_assistant_defaults.cite_sources IS
  'Default citation behaviour copied onto newly created agents.';
COMMENT ON COLUMN platform_assistant_defaults.strict_mode IS
  'Default strict-mode behaviour copied onto newly created agents.';
COMMENT ON COLUMN platform_assistant_defaults.launcher_colour IS
  'Optional default widget launcher colour (NULL = widget default).';
