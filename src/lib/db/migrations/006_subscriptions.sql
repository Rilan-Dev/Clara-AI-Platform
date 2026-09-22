-- ─────────────────────────────────────────────────────────────────────────────
-- 006_subscriptions.sql
-- Clara AI Platform — plans (reference data), org subscriptions, billing ledger.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. subscription_plans ────────────────────────────────────────────────────
-- Plan catalogue is platform reference data (not tenant data): the signup
-- flow and checkout depend on it existing immediately after migrations.

CREATE TABLE IF NOT EXISTS subscription_plans (
  id               TEXT        PRIMARY KEY,
  name             TEXT        NOT NULL,
  description      TEXT        NOT NULL DEFAULT '',
  price_usd        INTEGER     NOT NULL DEFAULT 0,
  max_kbs          INTEGER     NOT NULL DEFAULT 1,
  max_docs_per_kb  INTEGER     NOT NULL DEFAULT 10,
  max_req_day      INTEGER     NOT NULL DEFAULT 100,
  max_storage_mb   INTEGER     NOT NULL DEFAULT 100,
  voice_enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  api_access       BOOLEAN     NOT NULL DEFAULT FALSE,
  custom_branding  BOOLEAN     NOT NULL DEFAULT FALSE,
  sso_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
  analytics_level  TEXT        NOT NULL DEFAULT 'basic'
                                 CHECK (analytics_level IN ('basic','full','advanced','custom')),
  priority_support BOOLEAN     NOT NULL DEFAULT FALSE,
  features         JSONB       NOT NULL DEFAULT '[]',
  max_api_keys     INTEGER     NOT NULL DEFAULT 0,
  phone_calls_enabled BOOLEAN  NOT NULL DEFAULT FALSE,
  max_phone_numbers INTEGER    NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO subscription_plans
  (id, name, description, price_usd, max_kbs, max_docs_per_kb, max_req_day,
   max_storage_mb, voice_enabled, api_access, custom_branding, sso_enabled,
   analytics_level, priority_support, features, max_api_keys,
   phone_calls_enabled, max_phone_numbers)
VALUES
  ('free','Free','Platform-controlled free tier',0,1,10,100,100,
   FALSE,FALSE,FALSE,FALSE,'basic',FALSE,
   '["1 Knowledge Base","10 documents","100 requests/day","Text chat only","Basic analytics"]'::jsonb,
   0, FALSE, 0),
  ('starter','Starter','Perfect for small teams',49,3,50,1000,1000,
   TRUE,TRUE,FALSE,FALSE,'full',FALSE,
   '["3 Knowledge Bases","50 docs per KB","1,000 requests/day","Voice assistant","Full analytics","API access","Email support"]'::jsonb,
   3, FALSE, 0),
  ('pro','Pro','For growing businesses',149,10,200,10000,10000,
   TRUE,TRUE,TRUE,FALSE,'advanced',TRUE,
   '["10 Knowledge Bases","200 docs per KB","10,000 requests/day","Voice + realtime","Advanced analytics","Custom branding","Priority support","Webhook integrations"]'::jsonb,
   10, TRUE, 2),
  ('enterprise','Enterprise','Unlimited power for large organisations',-1,-1,-1,-1,-1,
   TRUE,TRUE,TRUE,TRUE,'custom',TRUE,
   '["Unlimited KBs","Unlimited documents","Unlimited requests","SSO / SAML","Custom LLM","SLA guarantee","Dedicated support","On-premise option"]'::jsonb,
   -1, TRUE, -1)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name, description=EXCLUDED.description, price_usd=EXCLUDED.price_usd,
  max_kbs=EXCLUDED.max_kbs, max_docs_per_kb=EXCLUDED.max_docs_per_kb,
  max_req_day=EXCLUDED.max_req_day, max_storage_mb=EXCLUDED.max_storage_mb,
  voice_enabled=EXCLUDED.voice_enabled, api_access=EXCLUDED.api_access,
  custom_branding=EXCLUDED.custom_branding, sso_enabled=EXCLUDED.sso_enabled,
  analytics_level=EXCLUDED.analytics_level, priority_support=EXCLUDED.priority_support,
  features=EXCLUDED.features, max_api_keys=EXCLUDED.max_api_keys,
  phone_calls_enabled=EXCLUDED.phone_calls_enabled, max_phone_numbers=EXCLUDED.max_phone_numbers;

-- ── 2. subscription_plan_versions ────────────────────────────────────────────
-- Immutable versioned snapshots of each plan. Subscriptions pin to a version;
-- future plan edits create new versions instead of mutating history.

CREATE TABLE IF NOT EXISTS subscription_plan_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  price_usd        INTEGER NOT NULL DEFAULT 0,
  max_kbs          INTEGER NOT NULL DEFAULT 1,
  max_docs_per_kb  INTEGER NOT NULL DEFAULT 10,
  max_req_day      INTEGER NOT NULL DEFAULT 100,
  max_storage_mb   INTEGER NOT NULL DEFAULT 100,
  voice_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  api_access       BOOLEAN NOT NULL DEFAULT FALSE,
  custom_branding  BOOLEAN NOT NULL DEFAULT FALSE,
  sso_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  analytics_level  TEXT NOT NULL DEFAULT 'basic'
                   CHECK (analytics_level IN ('basic','full','advanced','custom')),
  priority_support BOOLEAN NOT NULL DEFAULT FALSE,
  features         JSONB NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'published'
                   CHECK (status IN ('draft','published','archived')),
  effective_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version)
);

CREATE INDEX IF NOT EXISTS subscription_plan_versions_plan_idx
  ON subscription_plan_versions (plan_id, version DESC);

-- Publish version 1 for every plan (reference data, mirrors the catalogue).
INSERT INTO subscription_plan_versions
  (plan_id, version, name, description, price_usd, max_kbs, max_docs_per_kb,
   max_req_day, max_storage_mb, voice_enabled, api_access, custom_branding,
   sso_enabled, analytics_level, priority_support, features)
SELECT id, 1, name, description, price_usd, max_kbs, max_docs_per_kb,
       max_req_day, max_storage_mb, voice_enabled, api_access, custom_branding,
       sso_enabled, analytics_level, priority_support, features
FROM subscription_plans
ON CONFLICT (plan_id, version) DO NOTHING;

-- ── 3. org_subscriptions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  plan_id                 TEXT        NOT NULL REFERENCES subscription_plans(id),
  status                  TEXT        NOT NULL DEFAULT 'active'
                                        CHECK (status IN ('active','trialing','past_due',
                                                          'canceled','cancelled','paused')),
  current_period_start    TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 month',
  cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  razorpay_customer_id    TEXT,
  razorpay_subscription_id TEXT,
  stripe_price_id         TEXT,
  gateway                 TEXT        DEFAULT 'manual'
                                        CHECK (gateway IN ('stripe', 'razorpay', 'manual')),
  paused_at               TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  trial_extended_days     INT         DEFAULT 0,
  admin_note              TEXT,
  plan_version_id         UUID        REFERENCES subscription_plan_versions(id),
  plan_snapshot           JSONB,
  price_snapshot          INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id)
);

CREATE INDEX IF NOT EXISTS org_subscriptions_org_id_idx  ON org_subscriptions (org_id);
CREATE INDEX IF NOT EXISTS org_subscriptions_plan_id_idx ON org_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS org_subscriptions_status_idx  ON org_subscriptions (status);

-- ── 4. billing_events ────────────────────────────────────────────────────────
-- Central ledger for all payment events from every gateway.

CREATE TABLE IF NOT EXISTS billing_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  gateway      TEXT        NOT NULL CHECK (gateway IN ('stripe', 'razorpay', 'manual')),
  event_type   TEXT        NOT NULL,   -- e.g. 'checkout.session.completed'
  event_id     TEXT,                   -- Stripe event.id / Razorpay payment_id (idempotency)
  plan_id      TEXT        REFERENCES subscription_plans(id),
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
