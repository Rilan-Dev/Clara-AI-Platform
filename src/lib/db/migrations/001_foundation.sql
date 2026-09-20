-- ─────────────────────────────────────────────────────────────────────────────
-- 001_foundation.sql
-- Clara AI Platform — core entities.
--
-- organisations ──< agents ──< knowledge_bases
--                   │
--                   └── assistant_configs (1:1, agent-owned)
--
-- The agent owns the "Assistant & AI" configuration (persona, behaviour,
-- languages, voice, generation limits, widget design). Knowledge bases hold
-- content only — they never carry assistant configuration.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / duplicate_object guards).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. shared updated_at trigger function ────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 1. organisations ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organisations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organisations_slug_idx ON organisations (slug);

DO $$ BEGIN
  CREATE TRIGGER organisations_updated_at
    BEFORE UPDATE ON organisations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. agents (formerly "projects") ─────────────────────────────────────────
-- An agent is a tenant workspace: organisational label + lifecycle. The
-- full assistant persona lives in assistant_configs (1:1, agent-owned).

CREATE TABLE IF NOT EXISTS agents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Lifecycle
  status      TEXT        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'published', 'archived')),

  -- Composite key target: child tables reference agents(id, org_id) so every
  -- row stays tenant-scoped even when the id alone is known.
  UNIQUE (id, org_id)
);

CREATE INDEX IF NOT EXISTS agents_org_idx ON agents (org_id);

DO $$ BEGIN
  CREATE TRIGGER agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. knowledge_bases ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  description        TEXT,
  qdrant_collection  TEXT        NOT NULL UNIQUE,
  status             TEXT        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','archived')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_bases_agent_id_idx ON knowledge_bases (agent_id);
CREATE INDEX IF NOT EXISTS knowledge_bases_status_idx   ON knowledge_bases (status);

DO $$ BEGIN
  CREATE TRIGGER knowledge_bases_updated_at
    BEFORE UPDATE ON knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. assistant_configs (per-agent, 1:1) ─────────────────────────────────────
-- Runtime AI behaviour + full widget design for the embed experience.
-- Owned by the AGENT — knowledge bases hold content only.

CREATE TABLE IF NOT EXISTS assistant_configs (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           UUID         NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,

  -- Identity
  assistant_name     TEXT         NOT NULL DEFAULT 'Clara',
  avatar_url         TEXT,

  -- Behaviour
  system_prompt      TEXT         NOT NULL DEFAULT
    'You are Clara, a helpful voice assistant. Answer ONLY using the context provided.',
  welcome_message    TEXT         NOT NULL DEFAULT
    'Hello! How can I help you with this knowledge base today?',
  out_of_scope_reply TEXT         NOT NULL DEFAULT
    'I can only answer questions about the documents in this knowledge base.',
  rules              JSONB        NOT NULL DEFAULT '[]'::jsonb,

  -- Language
  default_language   TEXT         NOT NULL DEFAULT 'en',
  allowed_languages  TEXT[]       NOT NULL DEFAULT ARRAY['en'],
  always_respond_in  TEXT,

  -- Voice
  voice_id           TEXT         NOT NULL DEFAULT 'alloy',
  speed              NUMERIC(4,2) NOT NULL DEFAULT 1.0
                                    CHECK (speed BETWEEN 0.25 AND 4.0),

  -- Generation
  temperature        NUMERIC(3,2) NOT NULL DEFAULT 0.7
                                    CHECK (temperature BETWEEN 0.0 AND 1.0),
  max_tokens         INT          NOT NULL DEFAULT 500
                                    CHECK (max_tokens BETWEEN 50 AND 4000),
  cite_sources       BOOLEAN      NOT NULL DEFAULT TRUE,
  strict_mode        BOOLEAN      NOT NULL DEFAULT TRUE,

  -- Branding
  primary_colour     TEXT         NOT NULL DEFAULT '#6366f1',
  accent_colour      TEXT         NOT NULL DEFAULT '#a5b4fc',

  -- ── Widget design ────────────────────────────────────────────────────────
  widget_theme          TEXT NOT NULL DEFAULT 'light'
                          CHECK (widget_theme IN ('light','dark')),
  widget_position       TEXT NOT NULL DEFAULT 'bottom-right'
                          CHECK (widget_position IN ('bottom-right','bottom-left')),
  widget_button_size    INTEGER NOT NULL DEFAULT 56,
  widget_border_radius INTEGER NOT NULL DEFAULT 20,
  widget_font_family    TEXT NOT NULL DEFAULT 'system-ui,sans-serif',
  widget_chat_height    INTEGER NOT NULL DEFAULT 580,
  widget_show_branding  BOOLEAN NOT NULL DEFAULT TRUE,
  widget_launcher_label TEXT,

  widget_mode           TEXT NOT NULL DEFAULT 'floating'
                          CHECK (widget_mode IN ('floating', 'inline', 'headless')),
  launcher_colour       TEXT NOT NULL DEFAULT '#6366f1',
  design_updated_at     TIMESTAMPTZ,

  -- Header bar
  header_bg             TEXT,
  header_text_color     TEXT NOT NULL DEFAULT '#ffffff',
  header_height         INTEGER NOT NULL DEFAULT 60,
  header_blur           BOOLEAN NOT NULL DEFAULT FALSE,
  show_status_dot       BOOLEAN NOT NULL DEFAULT TRUE,
  status_dot_color      TEXT NOT NULL DEFAULT '#4ade80',
  avatar_shape          TEXT NOT NULL DEFAULT 'circle'
                          CHECK (avatar_shape IN ('circle','rounded','square')),

  -- Chat area
  chat_area_bg          TEXT,

  -- User bubble
  user_bubble_bg        TEXT,
  user_bubble_text      TEXT NOT NULL DEFAULT '#ffffff',
  user_bubble_radius    TEXT NOT NULL DEFAULT '18px 18px 4px 18px',
  user_bubble_padding   TEXT NOT NULL DEFAULT '10px 14px',
  user_bubble_shadow    TEXT NOT NULL DEFAULT '0 1px 4px rgba(0,0,0,0.15)',

  -- Bot bubble
  bot_bubble_bg         TEXT,
  bot_bubble_text       TEXT,
  bot_bubble_radius     TEXT NOT NULL DEFAULT '18px 18px 18px 4px',
  bot_bubble_border     TEXT,
  bot_bubble_padding    TEXT NOT NULL DEFAULT '10px 14px',
  bot_bubble_shadow     TEXT NOT NULL DEFAULT '0 1px 3px rgba(0,0,0,0.08)',

  -- Message list
  message_gap           INTEGER NOT NULL DEFAULT 12,
  message_max_width     INTEGER NOT NULL DEFAULT 85,
  message_font_size     INTEGER NOT NULL DEFAULT 13,
  message_line_height   NUMERIC(4,2) NOT NULL DEFAULT 1.5,

  -- Timestamps
  show_timestamps       BOOLEAN NOT NULL DEFAULT FALSE,
  timestamp_color       TEXT NOT NULL DEFAULT '#9ca3af',
  timestamp_font_size   INTEGER NOT NULL DEFAULT 10,

  -- Typing indicator
  typing_dot_color      TEXT NOT NULL DEFAULT '#9ca3af',
  typing_dot_size       INTEGER NOT NULL DEFAULT 6,

  -- Input area
  input_bg              TEXT,
  input_border          TEXT,
  input_border_focus    TEXT,
  input_radius          INTEGER NOT NULL DEFAULT 12,
  input_text_color      TEXT,
  input_placeholder_color TEXT,
  input_padding         TEXT NOT NULL DEFAULT '8px 12px',
  input_area_bg         TEXT,
  input_area_border     TEXT,

  -- Send button
  send_btn_bg           TEXT,
  send_btn_hover_bg     TEXT,
  send_btn_text_color   TEXT NOT NULL DEFAULT '#ffffff',
  send_btn_radius       INTEGER NOT NULL DEFAULT 10,
  send_btn_size         INTEGER NOT NULL DEFAULT 36,

  -- Voice mode
  voice_btn_bg          TEXT,
  voice_btn_size        INTEGER NOT NULL DEFAULT 36,
  voice_btn_radius      INTEGER NOT NULL DEFAULT 10,
  voice_btn_active_color TEXT,
  voice_panel_bg        TEXT,
  voice_wave_color      TEXT,

  -- Scrollbar
  scrollbar_width       INTEGER NOT NULL DEFAULT 4,
  scrollbar_color       TEXT NOT NULL DEFAULT '#c7d2fe',
  scrollbar_track_color TEXT NOT NULL DEFAULT 'transparent',

  -- Footer
  footer_bg             TEXT,
  footer_text_color     TEXT,

  -- Animations
  animations_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  message_animation_style  TEXT NOT NULL DEFAULT 'fade'
                            CHECK (message_animation_style IN ('fade','slide','pop','none')),

  -- Advanced code fields
  custom_css           TEXT,
  custom_launcher_svg  TEXT,
  custom_header_html   TEXT,
  custom_powered_by    TEXT,
  custom_theme_css     TEXT,
  custom_inject_js     TEXT,
  custom_footer_html   TEXT,

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TRIGGER assistant_configs_updated_at
    BEFORE UPDATE ON assistant_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
