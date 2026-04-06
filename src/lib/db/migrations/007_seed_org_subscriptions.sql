-- ─────────────────────────────────────────────────────────────────────────────
-- 007_seed_org_subscriptions.sql
-- Seed default subscriptions for dev orgs — only if those orgs exist.
-- Uses a SELECT WHERE EXISTS so no FK violation occurs on a fresh DB.
-- Safe to re-run (ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO org_subscriptions (org_id, plan_id, status)
SELECT '10000000-0000-0000-0000-000000000001', 'pro', 'active'
WHERE EXISTS (
  SELECT 1 FROM organisations WHERE id = '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO org_subscriptions (org_id, plan_id, status)
SELECT '10000000-0000-0000-0000-000000000002', 'starter', 'active'
WHERE EXISTS (
  SELECT 1 FROM organisations WHERE id = '10000000-0000-0000-0000-000000000002'
)
ON CONFLICT (org_id) DO NOTHING;
