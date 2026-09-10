-- 028_embed_api_key.sql
-- Add embed_api_key table to store the current embed API key

CREATE TABLE IF NOT EXISTS embed_api_key (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_key UNIQUE (key)
);

-- Insert the initial key from .env if it exists
INSERT INTO embed_api_key (key)
SELECT value FROM platform_env_settings
WHERE key = 'DEMO_CLARA_API_KEY'
ON CONFLICT DO NOTHING;

-- Also insert the NEXT_PUBLIC_LANDING_EMBED_API_KEY if it exists
INSERT INTO embed_api_key (key)
SELECT value FROM platform_env_settings
WHERE key = 'NEXT_PUBLIC_LANDING_EMBED_API_KEY'
ON CONFLICT DO NOTHING;
