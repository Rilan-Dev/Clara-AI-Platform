-- ─────────────────────────────────────────────────────────────────────────────
-- 019_full_design_control.sql
-- Clara AI — Full design control fields.
--
-- widget_mode:           floating (default FAB) | inline | headless (no DOM)
-- custom_css:            raw CSS injected into Shadow DOM after widget styles
-- custom_launcher_svg:   SVG markup replacing the default chat-bubble icon
-- custom_header_html:    Optional HTML snippet shown inside the widget header
-- custom_powered_by:     Override "Powered by Clara AI" text (or null to hide)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE assistant_configs
  ADD COLUMN IF NOT EXISTS widget_mode          TEXT NOT NULL DEFAULT 'floating'
    CHECK (widget_mode IN ('floating', 'inline', 'headless')),
  ADD COLUMN IF NOT EXISTS custom_css           TEXT,
  ADD COLUMN IF NOT EXISTS custom_launcher_svg  TEXT,
  ADD COLUMN IF NOT EXISTS custom_header_html   TEXT,
  ADD COLUMN IF NOT EXISTS custom_powered_by    TEXT;

COMMENT ON COLUMN assistant_configs.widget_mode IS
  'floating = FAB button + panel (default), inline = full-page chat in iframe,
   headless = no DOM rendered — pure window.ClaraSDK JS API for custom UIs';
COMMENT ON COLUMN assistant_configs.custom_css IS
  'Raw CSS injected into the widget Shadow DOM AFTER the default styles.
   Use to override any default style. Sanitized server-side before storage.';
COMMENT ON COLUMN assistant_configs.custom_launcher_svg IS
  'SVG markup replacing the default chat-bubble icon in the FAB launcher.
   Must be a valid <svg>...</svg> string. Max 4 KB.';
COMMENT ON COLUMN assistant_configs.custom_header_html IS
  'Optional HTML appended to the widget header bar (e.g. a status badge).
   Stripped to safe tags server-side. Max 500 chars.';
COMMENT ON COLUMN assistant_configs.custom_powered_by IS
  'Override the "Powered by Clara AI" branding text.
   NULL = use default. Empty string = hide branding (widgetShowBranding takes precedence).';
