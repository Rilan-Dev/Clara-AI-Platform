/**
 * src/lib/email-templates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DB-backed, admin-editable email templates.
 *
 * Every transactional email the platform sends is rendered from a template:
 *   - Templates live in the `email_templates` table (migration 018).
 *   - The canonical defaults live HERE, in TypeScript, as a single source of
 *     truth. `ensureEmailTemplates()` upserts them into the table on first
 *     use (ON CONFLICT DO NOTHING — admin edits are never overwritten).
 *   - Platform admins edit subject/HTML in Settings → Email Templates;
 *     edits are audited into `email_template_audit`.
 *   - `renderEmailTemplate(key, vars)` interpolates `{{placeholders}}` and
 *     falls back to the code default if the row is missing or inactive.
 *
 * Variable values are inserted as-is (matching the previous inline-string
 * behaviour), so templates can intentionally include markup around values.
 */

import { query } from "@/lib/db";
import { htmlToText, wrapEmail } from "@/lib/email";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmailTemplateKey =
  | "password_reset"
  | "password_changed"
  | "org_invitation_new_user"
  | "org_invitation_existing_user"
  | "plan_changed"
  | "subscription_cancelled"
  | "subscription_paused"
  | "subscription_resumed"
  | "subscription_reactivated"
  | "trial_extended"
  | "trial_converted"
  | "trial_ending_soon"
  | "payment_failed"
  | "renewal_reminder"
  | "subscription_expired"
  | "test_email";

export type TemplateVariable = { name: string; description: string };

export type EmailTemplateDef = {
  key: EmailTemplateKey;
  name: string;
  description: string;
  category: "auth" | "subscription" | "invitation" | "system";
  subject: string;
  bodyHtml: string;
  variables: TemplateVariable[];
};

export type EmailTemplateRow = EmailTemplateDef & {
  isActive: boolean;
  updatedAt: string;
  isCustomized: boolean; // DB row differs from the code default
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  source: "db" | "default";
};

// ── Shared variable groups ────────────────────────────────────────────────────

const VAR_USER      = { name: "userName",  description: "Recipient's full name" };
const VAR_ORG       = { name: "orgName",   description: "Organisation name" };
const VAR_PLAN      = { name: "planName",  description: "Subscription plan name" };
const VAR_OLD_PLAN  = { name: "oldPlan",   description: "Previous plan name" };
const VAR_NEW_PLAN  = { name: "newPlan",   description: "New plan name" };
const VAR_END_DATE  = { name: "trialEnd",  description: "Subscription / trial end date" };
const VAR_DAYS      = { name: "trialDays", description: "Days remaining" };
const VAR_NOTE      = { name: "note",      description: "Optional admin note" };
const VAR_ROLE      = { name: "role",      description: "Member role (e.g. org_admin)" };
const VAR_LOGIN     = { name: "loginUrl",  description: "Sign-in page link" };
const VAR_APP       = { name: "appName",   description: "Platform name (Clara AI)" };

// ── Default template catalogue ────────────────────────────────────────────────
//
// bodyHtml is the COMPLETE email (branded wrapper included) so admins have
// full creative control in the template editor. Subjects support the same
// {{placeholders}}.

const APP = "Clara AI";

// CTA-enabled wrapper — the URL is a {{placeholder}} interpolated at render time.
const ctaWrap = (body: string, url: string, label: string) => wrapEmail(body, { ctaUrl: url, ctaLabel: label });
const subWrap = (body: string) => wrapEmail(body);

export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateKey, EmailTemplateDef> = {
  // ── Auth ────────────────────────────────────────────────────────────────
  password_reset: {
    key: "password_reset",
    name: "Password reset link",
    description: "Sent when a user requests a password reset (link valid 1 hour).",
    category: "auth",
    subject: "Reset your {{appName}} password",
    bodyHtml: ctaWrap(`
      <h2 style="margin:0 0 12px;">Reset your password</h2>
      <p>Hi <strong>{{userName}}</strong>,</p>
      <p>We received a request to reset your {{appName}} password. This link is valid for
         <strong>1 hour</strong> and can only be used once.</p>`,
      "{{resetUrl}}", "Choose a new password"),
    variables: [VAR_USER, VAR_APP, { name: "resetUrl", description: "One-time reset link (1 hour)" }],
  },

  password_changed: {
    key: "password_changed",
    name: "Password changed confirmation",
    description: "Sent after a successful password reset or change.",
    category: "auth",
    subject: "Your {{appName}} password was changed",
    bodyHtml: ctaWrap(`
      <h2 style="margin:0 0 12px;">Your password was changed</h2>
      <p>Hi <strong>{{userName}}</strong>,</p>
      <p>Your {{appName}} password was just updated. All active sessions were signed out
         for your security.</p>
      <p>If this wasn't you, reset your password immediately and contact support.</p>`,
      "{{loginUrl}}", "Sign in"),
    variables: [VAR_USER, VAR_APP, VAR_LOGIN],
  },

  // ── Invitations ─────────────────────────────────────────────────────────
  org_invitation_new_user: {
    key: "org_invitation_new_user",
    name: "Organisation invitation (new user)",
    description: "Invites a brand-new user — includes a set-password link (14 days).",
    category: "invitation",
    subject: "You're invited to {{orgName}} on {{appName}}",
    bodyHtml: ctaWrap(`
      <h2 style="margin:0 0 12px;">You're invited to {{orgName}}</h2>
      <p>Hi <strong>{{userName}}</strong>,</p>
      <p>You've been invited to collaborate on {{appName}} as <strong>{{role}}</strong>
         for <strong>{{orgName}}</strong>.</p>
      <p>Set your password below and start building assistants together.</p>`,
      "{{inviteUrl}}", "Set your password & join"),
    variables: [VAR_USER, VAR_ORG, VAR_ROLE, VAR_APP, { name: "inviteUrl", description: "Set-password link (14 days)" }],
  },

  org_invitation_existing_user: {
    key: "org_invitation_existing_user",
    name: "Organisation invitation (existing user)",
    description: "Tells an existing user they were added to a new organisation.",
    category: "invitation",
    subject: "You've been added to {{orgName}} on {{appName}}",
    bodyHtml: ctaWrap(`
      <h2 style="margin:0 0 12px;">You've been added to {{orgName}}</h2>
      <p>Hi <strong>{{userName}}</strong>,</p>
      <p>You now have <strong>{{role}}</strong> access to <strong>{{orgName}}</strong> on {{appName}}.
         Sign in with your existing account to get started.</p>`,
      "{{loginUrl}}", "Sign in"),
    variables: [VAR_USER, VAR_ORG, VAR_ROLE, VAR_APP, VAR_LOGIN],
  },

  // ── Subscriptions ───────────────────────────────────────────────────────
  plan_changed: {
    key: "plan_changed",
    name: "Plan changed",
    description: "Sent when an admin changes an organisation's plan.",
    category: "subscription",
    subject: "Your {{appName}} plan has been updated — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Plan updated</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Your subscription has been changed from <strong>{{oldPlan}}</strong> to <strong>{{newPlan}}</strong>.</p>
      <p>Your new features are active immediately.</p>`),
    variables: [VAR_ORG, VAR_OLD_PLAN, VAR_NEW_PLAN, VAR_NOTE, VAR_APP],
  },

  subscription_cancelled: {
    key: "subscription_cancelled",
    name: "Subscription cancelled",
    description: "Sent when a subscription is cancelled (access until period end).",
    category: "subscription",
    subject: "Your {{appName}} subscription has been cancelled — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Subscription cancelled</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Your <strong>{{planName}}</strong> subscription has been cancelled.</p>
      <p>You retain access until the end of your current billing period.</p>
      <p>If this was a mistake, please contact support.</p>`),
    variables: [VAR_ORG, VAR_PLAN, VAR_NOTE, VAR_APP],
  },

  subscription_paused: {
    key: "subscription_paused",
    name: "Subscription paused",
    description: "Sent when a subscription is temporarily paused.",
    category: "subscription",
    subject: "Your {{appName}} subscription has been paused — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Subscription paused</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Your <strong>{{planName}}</strong> subscription has been temporarily paused.</p>
      <p>Your data is safe. Contact support to resume access.</p>`),
    variables: [VAR_ORG, VAR_PLAN, VAR_NOTE, VAR_APP],
  },

  subscription_resumed: {
    key: "subscription_resumed",
    name: "Subscription resumed",
    description: "Sent when a paused subscription becomes active again.",
    category: "subscription",
    subject: "Your {{appName}} subscription has been resumed — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Subscription resumed</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Great news — your <strong>{{planName}}</strong> subscription is active again.</p>
      <p>All your features are restored immediately.</p>`),
    variables: [VAR_ORG, VAR_PLAN, VAR_APP],
  },

  subscription_reactivated: {
    key: "subscription_reactivated",
    name: "Subscription reactivated",
    description: "Sent when an expired/cancelled subscription is reactivated.",
    category: "subscription",
    subject: "Your {{appName}} subscription has been reactivated — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Subscription reactivated</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Your <strong>{{planName}}</strong> subscription has been reactivated.</p>
      <p>All your features are available again immediately.</p>`),
    variables: [VAR_ORG, VAR_PLAN, VAR_APP],
  },

  trial_extended: {
    key: "trial_extended",
    name: "Trial extended",
    description: "Sent when an admin extends a free trial.",
    category: "subscription",
    subject: "Your {{appName}} trial has been extended — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Trial extended 🎉</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Your free trial has been extended by <strong>{{trialDays}} days</strong>.</p>
      <p>New trial end date: <strong>{{trialEnd}}</strong>.</p>`),
    variables: [VAR_ORG, VAR_DAYS, VAR_END_DATE, VAR_NOTE, VAR_APP],
  },

  trial_converted: {
    key: "trial_converted",
    name: "Trial converted to paid",
    description: "Sent when a trial converts to an active paid subscription.",
    category: "subscription",
    subject: "Welcome to {{appName}} {{planName}}! — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Trial converted to paid 🚀</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Your trial has been converted to an active <strong>{{planName}}</strong> subscription.</p>
      <p>Thank you for choosing {{appName}}!</p>`),
    variables: [VAR_ORG, VAR_PLAN, VAR_APP],
  },

  trial_ending_soon: {
    key: "trial_ending_soon",
    name: "Trial ending soon",
    description: "Reminder a few days before a trial expires.",
    category: "subscription",
    subject: "Your {{appName}} trial ends in {{trialDays}} days — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Your trial is ending soon</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Your free trial of <strong>{{planName}}</strong> ends on <strong>{{trialEnd}}</strong>.</p>
      <p>Upgrade before it ends to keep every feature running without interruption.</p>`),
    variables: [VAR_ORG, VAR_PLAN, VAR_DAYS, VAR_END_DATE, VAR_APP],
  },

  payment_failed: {
    key: "payment_failed",
    name: "Payment failed",
    description: "Sent when a payment attempt fails (retry or update card).",
    category: "subscription",
    subject: "Payment failed for your {{appName}} subscription — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Payment failed</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>We couldn't process the payment for your <strong>{{planName}}</strong> subscription.</p>
      <p>Please update your payment method to avoid interruption — your data stays safe
         in the meantime.</p>`),
    variables: [VAR_ORG, VAR_PLAN, VAR_APP],
  },

  renewal_reminder: {
    key: "renewal_reminder",
    name: "Renewal reminder",
    description: "Sent ~7 days before a subscription ends (expiry sweep).",
    category: "subscription",
    subject: "Action needed: your {{appName}} {{planName}} plan ends soon — {{orgName}}",
    bodyHtml: ctaWrap(`
      <h2 style="margin:0 0 12px;">Renewal reminder</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Your <strong>{{planName}}</strong> subscription is scheduled to end on
         <strong>{{trialEnd}}</strong> ({{trialDays}} day(s) left).</p>
      <p>To keep your assistants, knowledge bases and analytics running without
         interruption, renew before the end date.</p>`,
      "{{renewUrl}}", "Renew your subscription"),
    variables: [VAR_ORG, VAR_PLAN, VAR_DAYS, VAR_END_DATE, VAR_APP, { name: "renewUrl", description: "Renewal / login link" }],
  },

  subscription_expired: {
    key: "subscription_expired",
    name: "Subscription expired",
    description: "Sent the moment a subscription passes its end date.",
    category: "subscription",
    subject: "Your {{appName}} subscription has expired — renew to restore access — {{orgName}}",
    bodyHtml: ctaWrap(`
      <h2 style="margin:0 0 12px;color:#f87171;">Subscription expired</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Your <strong>{{planName}}</strong> subscription ended on <strong>{{trialEnd}}</strong>.</p>
      <p>Premium features (voice, analytics, API access and higher usage limits) are
         now restricted. Your data is safe and will be retained.</p>
      <p style="margin-top:16px;">Renew your subscription to instantly restore full access.</p>`,
      "{{renewUrl}}", "Renew now"),
    variables: [VAR_ORG, VAR_PLAN, VAR_END_DATE, VAR_APP, { name: "renewUrl", description: "Renewal / login link" }],
  },

  // ── System ──────────────────────────────────────────────────────────────
  test_email: {
    key: "test_email",
    name: "Test email",
    description: "Sent from Settings → Email Delivery to verify provider setup.",
    category: "system",
    subject: "{{appName}} test email — delivery is working 🎉",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">It works! ✅</h2>
      <p>Hi <strong>{{userName}}</strong>,</p>
      <p>This is a test message from <strong>{{appName}}</strong>, sent via the
         <strong>{{provider}}</strong> provider.</p>
      <p>If you can read this, your email delivery is configured correctly.</p>
      <p style="color:#888;font-size:12px;margin-top:24px;">
        Sent {{sentAt}} · to {{to}}</p>`),
    variables: [
      VAR_USER, VAR_APP,
      { name: "provider", description: "Active provider (resend|smtp)" },
      { name: "sentAt",   description: "Timestamp of the test send" },
      { name: "to",       description: "Recipient address" },
    ],
  },
};

// ── Template cache ────────────────────────────────────────────────────────────

type CachedTemplate = { def: EmailTemplateDef; isActive: boolean; fetchedAt: number };
const CACHE_TTL_MS = 15_000;
const _cache = new Map<string, CachedTemplate>();

export function invalidateEmailTemplateCache(): void {
  _cache.clear();
}

async function fetchTemplate(key: EmailTemplateKey): Promise<CachedTemplate | null> {
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  try {
    const rows = await query<{
      subject: string; body_html: string; is_active: boolean; name: string;
      description: string; category: string; variables: TemplateVariable[];
    }>(
      `SELECT subject, body_html, is_active, name, description, category, variables
         FROM email_templates WHERE template_key = $1`,
      [key],
    );
    const row = rows[0];
    if (!row) return null;
    const cachedValue: CachedTemplate = {
      def: {
        key,
        name: row.name,
        description: row.description,
        category: row.category as EmailTemplateDef["category"],
        subject: row.subject,
        bodyHtml: row.body_html,
        variables: Array.isArray(row.variables) ? row.variables : [],
      },
      isActive: row.is_active,
      fetchedAt: Date.now(),
    };
    _cache.set(key, cachedValue);
    return cachedValue;
  } catch (err) {
    console.warn(`[email-templates] DB read failed for "${key}", using default:`, (err as Error).message);
    return null;
  }
}

// ── Interpolation ─────────────────────────────────────────────────────────────

export function interpolate(template: string, vars: Record<string, string | number | boolean>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, name: string) => {
    if (name in vars && vars[name] !== undefined && vars[name] !== null) {
      return String(vars[name]);
    }
    return match; // unknown variable → leave visible for the admin to spot
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

export async function renderEmailTemplate(
  key: EmailTemplateKey,
  vars: Record<string, string | number | boolean>,
): Promise<RenderedEmail> {
  const effective = { appName: APP, ...vars };
  const row = await fetchTemplate(key);
  const def = row?.isActive ? row.def : EMAIL_TEMPLATE_DEFAULTS[key];
  const html = interpolate(def.bodyHtml, effective);
  const subject = interpolate(def.subject, effective);
  return { subject, html, text: htmlToText(html), source: row?.isActive ? "db" : "default" };
}

// ── Management (used by the admin templates API) ──────────────────────────────

/** Upsert every missing default template. Admin edits are never overwritten. */
export async function ensureEmailTemplates(): Promise<void> {
  const values = Object.values(EMAIL_TEMPLATE_DEFAULTS);
  for (const def of values) {
    await query(
      `INSERT INTO email_templates (template_key, name, description, category, subject, body_html, variables)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (template_key) DO NOTHING`,
      [def.key, def.name, def.description, def.category, def.subject, def.bodyHtml, JSON.stringify(def.variables)],
    );
  }
}

function rowToTemplate(row: {
  template_key: string; name: string; description: string; category: string;
  subject: string; body_html: string; variables: TemplateVariable[];
  is_active: boolean; updated_at: string;
}): EmailTemplateRow {
  const key = row.template_key as EmailTemplateKey;
  const def = EMAIL_TEMPLATE_DEFAULTS[key];
  return {
    key,
    name: row.name,
    description: row.description,
    category: row.category as EmailTemplateRow["category"],
    subject: row.subject,
    bodyHtml: row.body_html,
    variables: Array.isArray(row.variables) ? row.variables : [],
    isActive: row.is_active,
    updatedAt: row.updated_at,
    isCustomized: Boolean(
      def && (def.subject !== row.subject || def.bodyHtml !== row.body_html),
    ),
  };
}

export async function listEmailTemplates(): Promise<EmailTemplateRow[]> {
  await ensureEmailTemplates();
  const rows = await query<{
    template_key: string; name: string; description: string; category: string;
    subject: string; body_html: string; variables: TemplateVariable[];
    is_active: boolean; updated_at: string;
  }>(
    `SELECT template_key, name, description, category, subject, body_html, variables,
            is_active, updated_at
       FROM email_templates
      ORDER BY category, name`,
  );
  return rows.map(rowToTemplate);
}

export async function getEmailTemplate(key: EmailTemplateKey): Promise<EmailTemplateRow | null> {
  await ensureEmailTemplates();
  const rows = await query<{
    template_key: string; name: string; description: string; category: string;
    subject: string; body_html: string; variables: TemplateVariable[];
    is_active: boolean; updated_at: string;
  }>(
    `SELECT template_key, name, description, category, subject, body_html, variables,
            is_active, updated_at
       FROM email_templates WHERE template_key = $1`,
    [key],
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}

export async function updateEmailTemplate(
  key: EmailTemplateKey,
  patch: { subject?: string; bodyHtml?: string; isActive?: boolean },
  updatedBy?: string,
): Promise<EmailTemplateRow | null> {
  const current = await getEmailTemplate(key);
  if (!current) return null;

  const subject = patch.subject ?? current.subject;
  const bodyHtml = patch.bodyHtml ?? current.bodyHtml;
  const isActive = patch.isActive ?? current.isActive;

  await query(
    `UPDATE email_templates
        SET subject = $2, body_html = $3, is_active = $4, updated_at = now(), updated_by = $5
      WHERE template_key = $1`,
    [key, subject, bodyHtml, isActive, updatedBy ?? null],
  );
  await query(
    `INSERT INTO email_template_audit (template_key, subject, body_html, is_active, updated_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [key, subject, bodyHtml, isActive, updatedBy ?? null],
  );
  invalidateEmailTemplateCache();
  return getEmailTemplate(key);
}

export async function resetEmailTemplate(
  key: EmailTemplateKey,
  updatedBy?: string,
): Promise<EmailTemplateRow | null> {
  const def = EMAIL_TEMPLATE_DEFAULTS[key];
  if (!def) return null;
  await query(
    `UPDATE email_templates
        SET subject = $2, body_html = $3, is_active = TRUE, updated_at = now(), updated_by = $4
      WHERE template_key = $1`,
    [key, def.subject, def.bodyHtml, updatedBy ?? null],
  );
  await query(
    `INSERT INTO email_template_audit (template_key, subject, body_html, is_active, updated_by)
     VALUES ($1, $2, $3, TRUE, $4)`,
    [key, def.subject, def.bodyHtml, updatedBy ?? null],
  );
  invalidateEmailTemplateCache();
  return getEmailTemplate(key);
}

/** Variable catalogue for a key (always from code defaults — hints for the editor). */
export function templateVariables(key: EmailTemplateKey): TemplateVariable[] {
  return EMAIL_TEMPLATE_DEFAULTS[key]?.variables ?? [];
}
