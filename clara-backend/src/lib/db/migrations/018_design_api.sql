-- ─────────────────────────────────────────────────────────────────────────────
-- 018_design_api.sql
-- Clara AI — Enable per-key remote widget design editing.
--
-- Adds:
--   api_keys.design_edit_enabled  BOOLEAN  default FALSE
--     → Admin must explicitly opt-in per key before the key can call
--       PATCH /api/embed/design.  Disabled by default = secure by default.
--
--   assistant_configs.design_updated_at  TIMESTAMPTZ
--     → Tracks when the design was last changed remotely so clients can
--       cache-bust or subscribe to invalidation webhooks in future.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS design_edit_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE assistant_configs
  ADD COLUMN IF NOT EXISTS design_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN api_keys.design_edit_enabled IS
  'When TRUE this key may call PATCH /api/embed/design to update widget appearance.
   The endpoint only accepts widget_* and colour fields — never AI behaviour fields.
   Disabled by default; admin must enable explicitly in the Deploy tab.';

COMMENT ON COLUMN assistant_configs.design_updated_at IS
  'Timestamp of the last remote design update via the embed Design API.
   Used for cache-busting and future webhook notifications.';
