-- 067_whatsapp_business_lifecycle.sql
-- Server-only WhatsApp Business connection lifecycle and durable webhook state.
CREATE TABLE IF NOT EXISTS whatsapp_oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_oauth_state_agent_org_fk FOREIGN KEY (agent_id, org_id)
    REFERENCES agents(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS whatsapp_oauth_states_expiry_idx ON whatsapp_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS whatsapp_oauth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash text NOT NULL UNIQUE REFERENCES whatsapp_oauth_states(state_hash) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token_encrypted bytea NOT NULL,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  selected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_oauth_session_agent_org_fk FOREIGN KEY (agent_id, org_id)
    REFERENCES agents(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS whatsapp_oauth_sessions_scope_idx
  ON whatsapp_oauth_sessions(org_id, agent_id, user_id, expires_at);

CREATE TABLE IF NOT EXISTS whatsapp_business_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  waba_id text NOT NULL,
  waba_name text,
  phone_number_id text NOT NULL,
  display_phone_number text NOT NULL,
  verified_name text,
  access_token_encrypted bytea NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','revoked','disconnected')),
  webhook_verified boolean NOT NULL DEFAULT false,
  webhook_verified_at timestamptz,
  last_webhook_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_connection_agent_org_fk FOREIGN KEY (agent_id, org_id)
    REFERENCES agents(id, org_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_one_active_phone_per_agent_idx
  ON whatsapp_business_connections(agent_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_one_active_owner_per_phone_idx
  ON whatsapp_business_connections(phone_number_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS whatsapp_connections_org_idx
  ON whatsapp_business_connections(org_id, agent_id, status);

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id bigserial PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  phone_number_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);
CREATE INDEX IF NOT EXISTS whatsapp_webhook_events_received_idx
  ON whatsapp_webhook_events(received_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES whatsapp_business_connections(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL UNIQUE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_phone text,
  to_phone text,
  message_type text NOT NULL DEFAULT 'unknown',
  body text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','queued','sent','delivered','read','failed','deleted','unknown')),
  provider_timestamp timestamptz,
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_message_agent_org_fk FOREIGN KEY (agent_id, org_id)
    REFERENCES agents(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_agent_time_idx
  ON whatsapp_messages(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_status_idx
  ON whatsapp_messages(connection_id, status, updated_at DESC);

-- No browser role may read tokens, OAuth sessions, webhook payloads or message data.
ALTER TABLE public.whatsapp_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_oauth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_business_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON public.whatsapp_oauth_states FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON public.whatsapp_oauth_sessions FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON public.whatsapp_business_connections FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON public.whatsapp_webhook_events FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON public.whatsapp_messages FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
