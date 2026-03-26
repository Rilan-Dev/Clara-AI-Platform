-- ─────────────────────────────────────────────────────────────────────────────
-- 023_extended_widget_design.sql
-- Clara AI — Extended deep widget design fields.
-- Adds per-element styling columns so every visual part of the chat widget
-- can be fully customised without code from the admin design panel.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE assistant_configs
  -- Header bar
  ADD COLUMN IF NOT EXISTS header_bg            TEXT,
  ADD COLUMN IF NOT EXISTS header_text_color    TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS header_height        INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS header_blur          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_status_dot      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status_dot_color     TEXT NOT NULL DEFAULT '#4ade80',
  ADD COLUMN IF NOT EXISTS avatar_shape         TEXT NOT NULL DEFAULT 'circle'
    CHECK (avatar_shape IN ('circle','rounded','square')),

  -- Chat area
  ADD COLUMN IF NOT EXISTS chat_area_bg         TEXT,

  -- User bubble
  ADD COLUMN IF NOT EXISTS user_bubble_bg       TEXT,
  ADD COLUMN IF NOT EXISTS user_bubble_text     TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS user_bubble_radius   TEXT NOT NULL DEFAULT '18px 18px 4px 18px',
  ADD COLUMN IF NOT EXISTS user_bubble_padding  TEXT NOT NULL DEFAULT '10px 14px',
  ADD COLUMN IF NOT EXISTS user_bubble_shadow   TEXT NOT NULL DEFAULT '0 1px 4px rgba(0,0,0,0.15)',

  -- Bot bubble
  ADD COLUMN IF NOT EXISTS bot_bubble_bg        TEXT,
  ADD COLUMN IF NOT EXISTS bot_bubble_text      TEXT,
  ADD COLUMN IF NOT EXISTS bot_bubble_radius    TEXT NOT NULL DEFAULT '18px 18px 18px 4px',
  ADD COLUMN IF NOT EXISTS bot_bubble_border    TEXT,
  ADD COLUMN IF NOT EXISTS bot_bubble_padding   TEXT NOT NULL DEFAULT '10px 14px',
  ADD COLUMN IF NOT EXISTS bot_bubble_shadow    TEXT NOT NULL DEFAULT '0 1px 3px rgba(0,0,0,0.08)',

  -- Message list
  ADD COLUMN IF NOT EXISTS message_gap          INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS message_max_width    INTEGER NOT NULL DEFAULT 85,
  ADD COLUMN IF NOT EXISTS message_font_size    INTEGER NOT NULL DEFAULT 13,
  ADD COLUMN IF NOT EXISTS message_line_height  NUMERIC(4,2) NOT NULL DEFAULT 1.5,

  -- Timestamps
  ADD COLUMN IF NOT EXISTS show_timestamps      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timestamp_color      TEXT NOT NULL DEFAULT '#9ca3af',
  ADD COLUMN IF NOT EXISTS timestamp_font_size  INTEGER NOT NULL DEFAULT 10,

  -- Typing indicator
  ADD COLUMN IF NOT EXISTS typing_dot_color     TEXT NOT NULL DEFAULT '#9ca3af',
  ADD COLUMN IF NOT EXISTS typing_dot_size      INTEGER NOT NULL DEFAULT 6,

  -- Input area
  ADD COLUMN IF NOT EXISTS input_bg             TEXT,
  ADD COLUMN IF NOT EXISTS input_border         TEXT,
  ADD COLUMN IF NOT EXISTS input_border_focus   TEXT,
  ADD COLUMN IF NOT EXISTS input_radius         INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS input_text_color     TEXT,
  ADD COLUMN IF NOT EXISTS input_placeholder_color TEXT,
  ADD COLUMN IF NOT EXISTS input_padding        TEXT NOT NULL DEFAULT '8px 12px',
  ADD COLUMN IF NOT EXISTS input_area_bg        TEXT,
  ADD COLUMN IF NOT EXISTS input_area_border    TEXT,

  -- Send button
  ADD COLUMN IF NOT EXISTS send_btn_bg          TEXT,
  ADD COLUMN IF NOT EXISTS send_btn_hover_bg    TEXT,
  ADD COLUMN IF NOT EXISTS send_btn_text_color  TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS send_btn_radius      INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS send_btn_size        INTEGER NOT NULL DEFAULT 36,

  -- Scrollbar
  ADD COLUMN IF NOT EXISTS scrollbar_width      INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS scrollbar_color      TEXT NOT NULL DEFAULT '#c7d2fe',
  ADD COLUMN IF NOT EXISTS scrollbar_track_color TEXT NOT NULL DEFAULT 'transparent',

  -- Footer
  ADD COLUMN IF NOT EXISTS footer_bg            TEXT,
  ADD COLUMN IF NOT EXISTS footer_text_color    TEXT,

  -- Animations
  ADD COLUMN IF NOT EXISTS animations_enabled       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS message_animation_style  TEXT NOT NULL DEFAULT 'fade'
    CHECK (message_animation_style IN ('fade','slide','pop','none')),

  -- Advanced code fields
  ADD COLUMN IF NOT EXISTS custom_theme_css     TEXT,
  ADD COLUMN IF NOT EXISTS custom_inject_js     TEXT,
  ADD COLUMN IF NOT EXISTS custom_footer_html   TEXT;
