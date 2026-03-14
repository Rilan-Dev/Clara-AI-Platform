-- ─────────────────────────────────────────────────────────────────────────────
-- 017_widget_design.sql
-- Extends assistant_configs with full widget appearance/design fields.
-- These are served by GET /api/embed/config and editable via the Design panel.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE assistant_configs
  ADD COLUMN IF NOT EXISTS widget_theme     TEXT NOT NULL DEFAULT 'light'
    CHECK (widget_theme IN ('light','dark')),
  ADD COLUMN IF NOT EXISTS widget_position  TEXT NOT NULL DEFAULT 'bottom-right'
    CHECK (widget_position IN ('bottom-right','bottom-left')),
  ADD COLUMN IF NOT EXISTS widget_button_size  INTEGER NOT NULL DEFAULT 56,
  ADD COLUMN IF NOT EXISTS widget_border_radius INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS widget_font_family  TEXT NOT NULL DEFAULT 'system-ui,sans-serif',
  ADD COLUMN IF NOT EXISTS widget_chat_height  INTEGER NOT NULL DEFAULT 580,
  ADD COLUMN IF NOT EXISTS widget_show_branding BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS widget_launcher_label TEXT;
