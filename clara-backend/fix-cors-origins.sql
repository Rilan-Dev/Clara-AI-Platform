-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: Add localhost dev origins to the AmazeTechCLANS Customer Support API key
-- Run: psql $DATABASE_URL -f fix-cors-origins.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Show current state before patching
SELECT id, name, key_prefix, allowed_origins, rate_limit_per_hour
FROM api_keys
WHERE key_prefix = 'clr_343289e12eb8';

-- Patch: merge in localhost variants without losing the existing production origin
UPDATE api_keys
SET allowed_origins = ARRAY[
  'http://amazetechclans.com',
  'https://amazetechclans.com',
  'http://www.amazetechclans.com',
  'https://www.amazetechclans.com',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000'
]
WHERE key_prefix = 'clr_343289e12eb8';

-- Verify the result
SELECT id, name, key_prefix, allowed_origins
FROM api_keys
WHERE key_prefix = 'clr_343289e12eb8';
