-- ─────────────────────────────────────────────────────────────────────────────
-- 020_launcher_colour.sql
-- Clara AI — Dedicated floating launcher background colour.
--
-- launcher_colour: Background colour for the floating launcher button and its
--                 label, separate from the main widget primary_colour.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE assistant_configs
  ADD COLUMN IF NOT EXISTS launcher_colour TEXT NOT NULL DEFAULT '#6366f1';

COMMENT ON COLUMN assistant_configs.launcher_colour IS
  'Dedicated background colour for the floating launcher button and label.\n   Defaults to the primary branding colour but can be customised separately.';
