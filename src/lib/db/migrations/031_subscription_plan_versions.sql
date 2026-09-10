-- Immutable subscription plan versions.
-- Existing subscriptions are pinned to version 1; future edits create new versions.

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

ALTER TABLE org_subscriptions
  ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES subscription_plan_versions(id),
  ADD COLUMN IF NOT EXISTS plan_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS price_snapshot INTEGER;

INSERT INTO subscription_plan_versions
  (plan_id, version, name, description, price_usd, max_kbs, max_docs_per_kb,
   max_req_day, max_storage_mb, voice_enabled, api_access, custom_branding,
   sso_enabled, analytics_level, priority_support, features)
SELECT id, 1, name, description, price_usd, max_kbs, max_docs_per_kb,
       max_req_day, max_storage_mb, voice_enabled, api_access, custom_branding,
       sso_enabled, analytics_level, priority_support, features
FROM subscription_plans
ON CONFLICT (plan_id, version) DO NOTHING;

UPDATE org_subscriptions os
SET plan_version_id = pv.id,
    price_snapshot = pv.price_usd,
    plan_snapshot = jsonb_build_object(
      'planId', pv.plan_id,
      'version', pv.version,
      'name', pv.name,
      'description', pv.description,
      'priceUsd', pv.price_usd,
      'maxKbs', pv.max_kbs,
      'maxDocsPerKb', pv.max_docs_per_kb,
      'maxReqDay', pv.max_req_day,
      'maxStorageMb', pv.max_storage_mb,
      'voiceEnabled', pv.voice_enabled,
      'apiAccess', pv.api_access,
      'customBranding', pv.custom_branding,
      'ssoEnabled', pv.sso_enabled,
      'analyticsLevel', pv.analytics_level,
      'prioritySupport', pv.priority_support,
      'features', pv.features
    )
FROM subscription_plan_versions pv
WHERE pv.plan_id = os.plan_id
  AND pv.version = 1
  AND os.plan_version_id IS NULL;
