-- ─────────────────────────────────────────────────────────────────────────────
-- 032_org_subscriptions_status_fix.sql
-- Clara AI — Widen org_subscriptions.status CHECK constraint
--
-- Migration 006 originally defined:
--   CHECK (status IN ('active','trialing','past_due','canceled'))
--
-- The admin subscription-management API (src/app/api/orgs/subscription/route.ts,
-- PATCH handler) writes status='cancelled' (British spelling, 2 L's, used by the
-- "cancel" action) and status='paused' (used by the "pause" action) — neither of
-- which satisfied the original constraint, causing Postgres to reject the update
-- and crash the admin "pause"/"cancel" actions (and, downstream, the billing
-- history / subscription screens that depend on a consistent status).
--
-- This widens the constraint to accept both spellings of "canceled"/"cancelled"
-- (the Stripe webhook + American-spelling paths still use 'canceled') plus
-- 'paused', without needing to touch any already-applied migration.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE org_subscriptions DROP CONSTRAINT IF EXISTS org_subscriptions_status_check;

ALTER TABLE org_subscriptions
  ADD CONSTRAINT org_subscriptions_status_check
  CHECK (status IN ('active','trialing','past_due','canceled','cancelled','paused'));
