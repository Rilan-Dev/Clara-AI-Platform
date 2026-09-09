-- ─────────────────────────────────────────────────────────────────────────────
-- 026_demo_settings.sql
-- Full demo configuration — all landing-page demo settings in one place.
-- Managed exclusively from Platform Admin Panel → Demo page.
-- ─────────────────────────────────────────────────────────────────────────────

-- Expand the category CHECK to include 'demo'
ALTER TABLE platform_env_settings DROP CONSTRAINT IF EXISTS platform_env_settings_category_check;
ALTER TABLE platform_env_settings ADD CONSTRAINT platform_env_settings_category_check
  CHECK (category IN ('general','ai','phone','auth','billing','email','demo'));

-- Seed demo configuration keys
INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  -- ('DEMO_ENABLED',              'true',
  --  'Master toggle — show or hide the demo on the public landing page',
  --  'demo', FALSE, FALSE),

  -- ('DEMO_VOICE_ENABLED',        'true',
  --  'Enable the interactive voice demo section on the landing page',
  --  'demo', FALSE, FALSE),

  -- ('DEMO_CHAT_ENABLED',         'true',
  --  'Enable the floating chat assistant (FAB) on the landing page',
  --  'demo', FALSE, FALSE),

  -- ('DEMO_OPENAI_API_KEY',       '',
  --  'OpenAI API key used exclusively by the public demo AI. Stored server-side and never exposed to visitors.',
  --  'demo', TRUE, FALSE),

  -- ('DEMO_KB_NAME',              'Demo Insurance Knowledge Base',
  --  'Display name shown in the demo chat header and voice UI',
  --  'demo', FALSE, FALSE),

  -- ('DEMO_KB_PERSONA',           'You are Aria, an AI assistant for Omen United Insurance. Answer questions about insurance policies using only information from the knowledge base. Always cite your sources with [S1], [S2] notation. Be accurate, professional, and helpful.',
  --  'System prompt / persona used by the demo AI assistant',
  --  'demo', FALSE, FALSE),

  -- ('DEMO_VOICE_GREETING',       'Hi! I am Clara, an AI assistant powered by OpenAI Realtime and Gemini Live. How can I help you today?',
  --  'Greeting message spoken when a voice session starts',
  --  'demo', FALSE, FALSE),

  -- ('DEMO_ORG_ID',               '10000000-0000-0000-0000-000000000001',
  --  'Organisation ID used for the demo context (must match a seeded org)',
  --  'demo', FALSE, FALSE),

  -- ('DEMO_RATE_LIMIT_PER_HOUR',  '100',
  --  'Maximum demo requests allowed per hour (across all visitors)',
  --  'demo', FALSE, FALSE),

  -- ('DEMO_MAX_REQUESTS_PER_DAY', '1000',
  --  'Maximum demo requests allowed per day (across all visitors)',
  --  'demo', FALSE, FALSE),

  -- ('DEMO_SUGGESTED_PROMPTS',    '["What does my insurance cover?","How do I file a claim?","Tell me about voice AI features","How does RAG-powered search work?"]',
  --  'JSON array of prompt strings shown to visitors in the demo chat widget',
  --  'demo', FALSE, FALSE)

  ('DEMO_CLARA_API_KEY', 'clr_463c2914ca2872807a82189a0d0b30d0d8c68322eed688c3',
   'Clara API key for Demo environment for Landing Page.',
   'demo', FALSE, FALSE)
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_secret = EXCLUDED.is_secret,
    requires_restart = EXCLUDED.requires_restart;

-- -- Update the existing DEMO_KB_ID (from 025) to be in the demo category
-- UPDATE platform_env_settings SET category = 'demo' WHERE key = 'DEMO_KB_ID';
