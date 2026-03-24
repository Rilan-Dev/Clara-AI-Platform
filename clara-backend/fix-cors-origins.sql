-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: Add https:// + localhost dev origins to the AmazeTechCLANS embed API key
-- Token in use: clr_b9b4d8507e2981c048e4fca1f9d3ce2bf616e1c17bc5ad3b
-- Run: psql $DATABASE_URL -f fix-cors-origins.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Show current state before patching
SELECT id, name, key_prefix, allowed_origins, rate_limit_per_hour
FROM api_keys
WHERE key_prefix = 'clr_b9b4d8';

-- Patch: merge in missing origins without losing any existing ones
UPDATE api_keys
SET allowed_origins = (
  SELECT array_agg(DISTINCT origin ORDER BY origin)
  FROM unnest(allowed_origins || ARRAY[
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
  ]) AS t(origin)
)
WHERE key_prefix = 'clr_b9b4d8';

-- Verify the result
SELECT id, name, key_prefix, allowed_origins
FROM api_keys
WHERE key_prefix = 'clr_b9b4d8';
