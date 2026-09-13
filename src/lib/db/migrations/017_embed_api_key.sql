-- ─────────────────────────────────────────────────────────────────────────────
-- 017_embed_api_key.sql
-- Clara AI Platform — landing-page embed key store.
--
-- Holds the CURRENT public embed API key used by the landing-page demo.
-- The key value itself is environment data: it is written by the production
-- seed script or the admin Embed API Key panel, never by migrations.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS embed_api_key (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_key UNIQUE (key)
);
