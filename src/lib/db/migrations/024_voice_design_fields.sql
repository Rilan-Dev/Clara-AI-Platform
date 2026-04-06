-- ─────────────────────────────────────────────────────────────────────────────
-- 024_voice_design_fields.sql
-- Clara AI — Voice mode design fields for the widget.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE assistant_configs
  ADD COLUMN IF NOT EXISTS voice_btn_bg           TEXT,
  ADD COLUMN IF NOT EXISTS voice_btn_size         INTEGER NOT NULL DEFAULT 36,
  ADD COLUMN IF NOT EXISTS voice_btn_radius       INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS voice_btn_active_color TEXT,
  ADD COLUMN IF NOT EXISTS voice_panel_bg         TEXT,
  ADD COLUMN IF NOT EXISTS voice_wave_color       TEXT;
