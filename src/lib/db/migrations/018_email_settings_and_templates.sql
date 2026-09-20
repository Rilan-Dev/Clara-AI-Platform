-- ─────────────────────────────────────────────────────────────────────────────
-- 018_email_settings_and_templates.sql
-- Clara AI Platform — Email delivery configuration + editable email templates.
--
-- Part 1: seeds the email key catalogue into platform_env_settings so the
--         admin panel (Settings → Email Delivery) can switch providers
--         (Resend ↔ SMTP) and rotate credentials live. Values are neutral —
--         real credentials come from .env / production seed / admin panel.
--         Because setPlatformEnvSetting() writes through to process.env and
--         loadRuntimeSettings() overlays the table at startup, saving a key
--         takes effect on the next send without a restart.
--
-- Part 2: email_templates — DB-backed, admin-editable HTML templates for every
--         transactional email the platform sends. Rows are seeded lazily by
--         src/lib/email-templates.ts (ensureEmailTemplates) so the canonical
--         HTML lives in ONE place (TypeScript constants) — the migration only
--         creates the container.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Part 1: email settings catalogue ─────────────────────────────────────────
INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart)
VALUES
  ('EMAIL_PROVIDER',     'resend', 'Active email provider (resend|smtp) — only one is used at a time.', 'email', FALSE, FALSE),
  ('EMAIL_FROM_NAME',    'Clara AI', 'Friendly sender name shown in inboxes.',                            'email', FALSE, FALSE),
  ('EMAIL_FROM_ADDRESS', '', 'Default sender address (Resend: must be on a verified domain).',            'email', FALSE, FALSE),
  ('RESEND_API_KEY',     '', 'Resend API key (https://resend.com/api-keys).',                             'email', TRUE,  FALSE),
  ('SMTP_HOST',          '', 'SMTP server host, e.g. smtp.gmail.com.',                                    'email', FALSE, FALSE),
  ('SMTP_PORT',          '465', 'SMTP port (465 = SSL, 587 = STARTTLS).',                                 'email', FALSE, FALSE),
  ('SMTP_SECURE',        'true', 'Use SSL/TLS (true for port 465, false for 587/STARTTLS).',              'email', FALSE, FALSE),
  ('SMTP_USER',          '', 'SMTP username (Gmail: full email address).',                                'email', TRUE,  FALSE),
  ('SMTP_PASSWORD',      '', 'SMTP password (Gmail: 16-char app password).',                              'email', TRUE,  FALSE),
  ('SMTP_FROM_ADDRESS',  '', 'Sender address when SMTP is active (Gmail: your Gmail address).',           'email', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;

-- ── Part 2: editable email templates ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  template_key  TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',
  category      TEXT        NOT NULL DEFAULT 'transactional'
                               CHECK (category IN ('auth','subscription','invitation','system')),
  subject       TEXT        NOT NULL,
  body_html     TEXT        NOT NULL,
  variables     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates (category);

-- Audit of template edits (who changed what, when) — one row per save.
CREATE TABLE IF NOT EXISTS email_template_audit (
  id            BIGSERIAL PRIMARY KEY,
  template_key  TEXT        NOT NULL,
  subject       TEXT        NOT NULL,
  body_html     TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL,
  updated_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_template_audit_key ON email_template_audit (template_key, created_at DESC);
