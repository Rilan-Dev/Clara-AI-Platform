-- 058_elevenlabs_realtime_admin_setting.sql
-- Move the ElevenLabs Clara-controlled realtime feature switch out of
-- deployment environment validation and into the platform-admin settings
-- surface. The value is runtime-loaded from platform_env_settings, so it can
-- be changed without a redeploy.

INSERT INTO platform_env_settings
  (key, value, description, category, is_secret, requires_restart)
VALUES
  ('ELEVENLABS_REALTIME_ENABLED', 'false',
   'Enable ElevenLabs realtime speech transport (Scribe v2 Realtime + Flash v2.5) for Clara realtime voice.',
   'ai', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;
