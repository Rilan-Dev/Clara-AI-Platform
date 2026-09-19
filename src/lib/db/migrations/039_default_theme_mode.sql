-- ─────────────────────────────────────────────────────────────────────────────
-- 039_default_theme_mode.sql
-- Clara AI Platform — admin-controlled default theme mode.
--
-- Adds DEFAULT_THEME_MODE to the platform_env_settings catalogue:
--   'light'   (default)  bright, airy light palette on #FCFCFD
--   'dark'           soft near-black surfaces, same indigo→violet accents
--   'system'         follow each visitor's OS colour-scheme preference
--
-- The root layout reads this value on every request (5s in-process cache in
-- src/lib/theme-settings.ts) and injects it into <html data-default-theme>,
-- while the blocking theme script (src/lib/theme.ts) applies it before first
-- paint. Saving a new value from Settings → Appearance therefore reaches NEW
-- visitors WITHOUT restarting the app — the row's requires_restart flag is
-- deliberately FALSE.
--
-- Existing users are untouched: a personal choice made with the header theme
-- toggle is stored in the browser's localStorage ("clara-theme") and always
-- wins over this platform default. Embeddable /embed/* surfaces skip the
-- platform default on purpose (customer-branded widget design governs those).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('DEFAULT_THEME_MODE', 'light',
   'Default theme mode for first-time visitors (light|dark|system). Applies to new visitors immediately — no restart required.',
   'platform', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;
