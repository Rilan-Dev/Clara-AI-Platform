-- ─────────────────────────────────────────────────────────────────────────────
-- 011_billing_events.sql
-- Clara AI — Billing events table (Stripe + Razorpay) + org_subscriptions cols
-- ─────────────────────────────────────────────────────────────────────────────

-- Extend org_subscriptions for multi-gateway support
ALTER TABLE org_subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id          TEXT,
  ADD COLUMN IF NOT EXISTS gateway                  TEXT DEFAULT 'manual'
    CHECK (gateway IN ('stripe', 'razorpay', 'manual'));

-- ── billing_events ────────────────────────────────────────────────────────────
-- Central ledger for all payment events from every gateway.
-- One row per raw webhook / verification event.

CREATE TABLE IF NOT EXISTS billing_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  gateway      TEXT        NOT NULL CHECK (gateway IN ('stripe', 'razorpay', 'manual')),

  -- Normalised event classification
  event_type   TEXT        NOT NULL,   -- e.g. 'checkout.session.completed'
  event_id     TEXT,                   -- Stripe event.id / Razorpay payment_id (idempotency key)

  -- Plan reference
  plan_id      TEXT        REFERENCES subscription_plans(id),

  -- Amounts — store both currencies; whichever gateway was used is populated
  amount_cents INTEGER,                -- USD cents  (Stripe)
  amount_paise INTEGER,                -- INR paise  (Razorpay)
  currency     TEXT        NOT NULL DEFAULT 'usd',

  status       TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),

  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_event_id_gateway_idx
  ON billing_events (event_id, gateway)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_events_org_id_idx  ON billing_events (org_id);
CREATE INDEX IF NOT EXISTS billing_events_status_idx  ON billing_events (status);
CREATE INDEX IF NOT EXISTS billing_events_gateway_idx ON billing_events (gateway);
CREATE INDEX IF NOT EXISTS billing_events_created_idx ON billing_events (created_at DESC);
