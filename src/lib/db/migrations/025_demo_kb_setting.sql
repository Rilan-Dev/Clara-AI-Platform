-- -- ─────────────────────────────────────────────────────────────────────────────
-- -- 025_demo_kb_setting.sql
-- -- Add Demo KB ID setting to Platform Env settings
-- -- ─────────────────────────────────────────────────────────────────────────────

-- INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
-- VALUES
--   ('DEMO_KB_ID', '30000000-0000-0000-0000-000000000001', 'Knowledge Base ID used for the public landing page demo', 'general', FALSE, FALSE)
-- ON CONFLICT (key) DO NOTHING;
