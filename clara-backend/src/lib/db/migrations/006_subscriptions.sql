-- ─────────────────────────────────────────────────────────────────────────────
-- 006_subscriptions.sql
-- Clara AI — Subscription plans, org subscriptions, platform stats
-- ─────────────────────────────────────────────────────────────────────────────

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
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO subscription_plans
  (id, name, description, price_usd, max_kbs, max_docs_per_kb, max_req_day,
   max_storage_mb, voice_enabled, api_access, custom_branding, sso_enabled,
   analytics_level, priority_support, features)
VALUES
  ('free','Free','Get started at no cost',0,1,10,100,100,
   FALSE,FALSE,FALSE,FALSE,'basic',FALSE,
   '["1 Knowledge Base","10 documents","100 requests/day","Text chat only","Basic analytics"]'::jsonb),
  ('starter','Starter','Perfect for small teams',49,3,50,1000,1000,
   TRUE,TRUE,FALSE,FALSE,'full',FALSE,
   '["3 Knowledge Bases","50 docs per KB","1,000 requests/day","Voice assistant","Full analytics","API access","Email support"]'::jsonb),
  ('pro','Pro','For growing businesses',149,10,200,10000,10000,
   TRUE,TRUE,TRUE,FALSE,'advanced',TRUE,
   '["10 Knowledge Bases","200 docs per KB","10,000 requests/day","Voice + realtime","Advanced analytics","Custom branding","Priority support","Webhook integrations"]'::jsonb),
  ('enterprise','Enterprise','Unlimited power for large organisations',-1,-1,-1,-1,-1,
   TRUE,TRUE,TRUE,TRUE,'custom',TRUE,
   '["Unlimited KBs","Unlimited documents","Unlimited requests","SSO / SAML","Custom LLM","SLA guarantee","Dedicated support","On-premise option"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name, description=EXCLUDED.description, price_usd=EXCLUDED.price_usd,
  max_kbs=EXCLUDED.max_kbs, max_docs_per_kb=EXCLUDED.max_docs_per_kb,
  max_req_day=EXCLUDED.max_req_day, max_storage_mb=EXCLUDED.max_storage_mb,
  voice_enabled=EXCLUDED.voice_enabled, api_access=EXCLUDED.api_access,
  custom_branding=EXCLUDED.custom_branding, sso_enabled=EXCLUDED.sso_enabled,
  analytics_level=EXCLUDED.analytics_level, priority_support=EXCLUDED.priority_support,
  features=EXCLUDED.features;

CREATE TABLE IF NOT EXISTS org_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  plan_id                 TEXT        NOT NULL REFERENCES subscription_plans(id),
  status                  TEXT        NOT NULL DEFAULT 'active'
                                        CHECK (status IN ('active','trialing','past_due','canceled')),
  current_period_start    TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 month',
  cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id)
);

CREATE INDEX IF NOT EXISTS org_subscriptions_org_id_idx  ON org_subscriptions (org_id);
CREATE INDEX IF NOT EXISTS org_subscriptions_plan_id_idx ON org_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS org_subscriptions_status_idx  ON org_subscriptions (status);
