-- ─────────────────────────────────────────────────────────────────────────────
-- 032_email_template_drafts_and_variables.sql
-- Clara AI Platform — Safe email template editing (draft → publish) + managed
-- custom template variables.
--
-- Motivation (production incident class): previously "Save" overwrote the
-- LIVE template instantly — a broken HTML edit immediately corrupted real
-- transactional emails (password resets, invitations) with no review step.
--
-- Part 1: draft columns on email_templates.
--   subject / body_html            = PUBLISHED content (what senders render).
--   draft_subject / draft_body_html = in-progress edit (never rendered).
--   "Publish" copies draft → live (audited, action = 'publish').
--   "Discard draft" clears the draft columns.
--   The send path (renderEmailTemplate) is untouched — it keeps reading the
--   published columns only.
--
-- Part 2: email_template_variables — admin-manageable variable catalogue.
--   is_system rows are seeded lazily from the TypeScript defaults (single
--   source of truth) and are READ-ONLY (name is the code-level API contract).
--   Custom rows (is_system = FALSE) carry a static `value` that is injected
--   into EVERY render as a default — send-site values always win on conflict.
--
-- Part 3: email_template_audit.action — label what kind of change each row
--   records ('update' legacy default, 'publish', 'reset', 'variable').
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Part 1: draft columns ────────────────────────────────────────────────────
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS draft_subject    TEXT,
  ADD COLUMN IF NOT EXISTS draft_body_html  TEXT,
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS draft_updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN email_templates.draft_subject IS 'In-progress subject; NULL when no draft exists. Never rendered by senders.';
COMMENT ON COLUMN email_templates.draft_body_html IS 'In-progress HTML body; NULL when no draft exists. Never rendered by senders.';

-- ── Part 2: managed variable catalogue ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_template_variables (
  name        TEXT        PRIMARY KEY,              -- also the {{placeholder}} key
  category    TEXT        NOT NULL DEFAULT 'custom'
                            CHECK (category IN ('auth','invitation','subscription','system','custom')),
  description TEXT        NOT NULL DEFAULT '',
  value       TEXT        NOT NULL DEFAULT '',      -- custom rows: injected into every render
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,   -- system rows are read-only in the manager
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_template_variables_category
  ON email_template_variables (category, name);

-- ── Part 3: audit action labels ──────────────────────────────────────────────
ALTER TABLE email_template_audit
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'update';

COMMENT ON COLUMN email_template_audit.action IS 'Kind of change: update (legacy/direct), publish, reset.';
