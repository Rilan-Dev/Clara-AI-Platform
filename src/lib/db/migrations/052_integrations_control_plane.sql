-- 052_integrations_control_plane.sql
-- Clara AI Platform — platform/org/agent integration access control.
-- Integration credentials are encrypted at rest. This migration does NOT add
-- billable usage kinds; execution telemetry remains operational/audit-only.

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_integrations INTEGER NOT NULL DEFAULT 0;

ALTER TABLE subscription_plan_versions
  ADD COLUMN IF NOT EXISTS max_integrations INTEGER NOT NULL DEFAULT 0;

UPDATE subscription_plans SET max_integrations = CASE id
  WHEN 'free' THEN 0
  WHEN 'starter' THEN 3
  WHEN 'pro' THEN 10
  WHEN 'enterprise' THEN -1
  ELSE max_integrations
END;

UPDATE subscription_plan_versions pv
SET max_integrations = sp.max_integrations
FROM subscription_plans sp
WHERE sp.id = pv.plan_id;

CREATE TABLE IF NOT EXISTS platform_integrations (
  integration_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_plans JSONB NOT NULL DEFAULT '["starter","pro","enterprise"]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organisation_integrations (
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL REFERENCES platform_integrations(integration_id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, integration_id)
);

CREATE TABLE IF NOT EXISTS agent_integrations (
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  integration_id TEXT NOT NULL REFERENCES platform_integrations(integration_id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, integration_id)
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  integration_id TEXT NOT NULL REFERENCES platform_integrations(integration_id) ON DELETE CASCADE,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth2','secret_text','custom_auth','basic_auth','none')),
  credentials_encrypted BYTEA NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','expired','revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_connections_scope_idx
  ON integration_connections(org_id, integration_id, agent_id, status);

CREATE TABLE IF NOT EXISTS integration_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  integration_id TEXT NOT NULL,
  action_name TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_usage_log_org_created_idx
  ON integration_usage_log(org_id, created_at DESC);

INSERT INTO platform_integrations (integration_id)
VALUES
  ('activecampaign'),
  ('airtable'),
  ('amazon_bedrock'),
  ('asana'),
  ('assemblyai'),
  ('attio'),
  ('azure_blob_storage'),
  ('azure_openai'),
  ('backblaze'),
  ('baserow'),
  ('beehiiv'),
  ('bigcommerce'),
  ('bitly'),
  ('bluesky'),
  ('box'),
  ('brave_search'),
  ('bubble'),
  ('buttondown'),
  ('campaign_monitor'),
  ('capsule_crm'),
  ('cartloom'),
  ('claude'),
  ('clickup'),
  ('clockify'),
  ('close'),
  ('coda'),
  ('cohere'),
  ('confluence'),
  ('constant_contact'),
  ('contentful'),
  ('convertkit'),
  ('copper'),
  ('couchbase'),
  ('crisp'),
  ('datadog'),
  ('datocms'),
  ('deepgram'),
  ('deepseek'),
  ('discord'),
  ('drip'),
  ('dropbox'),
  ('drupal'),
  ('duckdb'),
  ('eden_ai'),
  ('elevenlabs'),
  ('everhour'),
  ('exa'),
  ('facebook_pages'),
  ('figma'),
  ('firecrawl'),
  ('flowise'),
  ('folk'),
  ('freshsales'),
  ('front'),
  ('getresponse'),
  ('ghostcms'),
  ('github'),
  ('gitlab'),
  ('gladia'),
  ('gmail'),
  ('google_calendar'),
  ('google_cloud_storage'),
  ('google_contacts'),
  ('google_docs'),
  ('google_drive'),
  ('google_forms'),
  ('google_gemini'),
  ('google_search'),
  ('google_sheets'),
  ('google_tasks'),
  ('google_vertexai'),
  ('googlechat'),
  ('gotify'),
  ('griptape'),
  ('grok_xai'),
  ('groq'),
  ('harvest'),
  ('heygen'),
  ('hubspot'),
  ('hugging_face'),
  ('insightly'),
  ('instagram_business'),
  ('intercom'),
  ('jina_ai'),
  ('jira_cloud'),
  ('klaviyo'),
  ('kommo'),
  ('lemlist'),
  ('line'),
  ('linear'),
  ('linkedin'),
  ('localai'),
  ('logrocket'),
  ('loops'),
  ('mailchimp'),
  ('mailer_lite'),
  ('mailjet'),
  ('mastodon'),
  ('mattermost'),
  ('meistertask'),
  ('microsoft_outlook'),
  ('microsoft_teams'),
  ('mistral_ai'),
  ('modelslab'),
  ('mollie'),
  ('monday'),
  ('mongodb'),
  ('murf_api'),
  ('mysql'),
  ('netlify'),
  ('nifty'),
  ('nocodb'),
  ('notion'),
  ('ntfy'),
  ('open_router'),
  ('openai'),
  ('paywhirl'),
  ('perplexity_ai'),
  ('photoroom'),
  ('pinecone'),
  ('pinterest'),
  ('pipedrive'),
  ('pocketbase'),
  ('postgres'),
  ('posthog'),
  ('productboard'),
  ('pushbullet'),
  ('pushover'),
  ('qdrant'),
  ('quickbooks'),
  ('razorpay'),
  ('reddit'),
  ('resend'),
  ('runware'),
  ('runway'),
  ('saleor'),
  ('salesforce'),
  ('sendgrid'),
  ('sendinblue'),
  ('shopify'),
  ('slack'),
  ('snowflake'),
  ('softr'),
  ('spotify'),
  ('square'),
  ('stability_ai'),
  ('stripe'),
  ('supabase'),
  ('synthesia'),
  ('taskade'),
  ('tavily'),
  ('telegram_bot'),
  ('ticktick'),
  ('todoist'),
  ('toggl_track'),
  ('trello'),
  ('twilio'),
  ('twitch'),
  ('twitter'),
  ('vercel'),
  ('vtex'),
  ('webflow'),
  ('whatsapp'),
  ('woocommerce'),
  ('wordpress'),
  ('xero'),
  ('youtube'),
  ('zoho_crm')
ON CONFLICT (integration_id) DO NOTHING;

-- Keep the reference catalog available to the control plane. Platform admins
-- can disable any entry without deleting the registry definition.
