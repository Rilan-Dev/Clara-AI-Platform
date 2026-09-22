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
 *   - `renderEmailTemplate(key, vars)` interpolates `{{placeholders}}`.
 *
 * Admin on/off control (the "isActive" switch in Settings → Email Templates):
 *   - ACTIVE   → the email is rendered from the DB row (or the code default
 *                if the row is missing) and sent normally.
 *   - INACTIVE → the email is SUPPRESSED: `renderEmailTemplate` returns null
 *                and every send site skips delivery. This is the platform
 *                admin's kill-switch per template — business emails stop
 *                entirely, not silently revert to the factory default.
 *     Pass `{ force: true }` to bypass suppression for admin test sends and
 *     inbox previews (Settings → Email Delivery → Send test).
 *
 * Variable values are inserted as-is (matching the previous inline-string
 * behaviour), so templates can intentionally include markup around values.
 */

import { query } from "@/lib/db";
import { htmlToText, wrapEmail } from "@/lib/email";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmailTemplateKey =
  | "email_verification"
  | "welcome_email"
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
  | "payment_success"
  | "payment_failed"
  | "renewal_reminder"
  | "subscription_expired"
  | "downgrade_scheduled"
  | "downgrade_applied"
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

/** In-progress edit captured by "Save draft" — never rendered by senders. */
export type EmailTemplateDraft = {
  subject: string;
  bodyHtml: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type EmailTemplateRow = EmailTemplateDef & {
  isActive: boolean;
  updatedAt: string;
  isCustomized: boolean; // DB row differs from the code default
  draft: EmailTemplateDraft | null; // non-null while an unpublished edit exists
};

/** A variable in the managed catalogue (Settings → Email Templates → Variables). */
export type ManagedEmailVariable = {
  name: string;
  category: "auth" | "invitation" | "subscription" | "system" | "custom";
  description: string;
  value: string;      // custom rows: injected into every render; system rows: ""
  isSystem: boolean;  // system variables are read-only (name is the code API)
  usedIn: string[];   // template keys referencing {{name}} in published OR draft content
  updatedAt: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  source: "db" | "default";
  /** True when the row is deactivated and only a forced render produced this. */
  suppressed?: boolean;
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
const VAR_VERIFY    = { name: "verifyUrl",  description: "One-time email verification link (24 hours)" };
const VAR_DASH      = { name: "dashboardUrl", description: "Workspace / dashboard link" };
const VAR_AMOUNT    = { name: "amount",     description: "Payment amount with currency (e.g. $49.00 / ₹3,999)" };
const VAR_RECEIPT   = { name: "receiptUrl",  description: "Invoice / receipt link when available" };
const VAR_PAYMENT   = { name: "paymentId",   description: "Gateway payment reference" };

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
  email_verification: {
    key: "email_verification",
    name: "Email verification link",
    description: "Sent after signup — the link verifies the address (24 hours).",
    category: "auth",
    subject: "Verify your email for {{appName}}",
    bodyHtml: ctaWrap(`
      <h2 style="margin:0 0 12px;">Confirm your email address</h2>
      <p>Hi <strong>{{userName}}</strong>,</p>
      <p>Thanks for creating your {{appName}} account. Please confirm this email address to
         continue setting up your account and secure your workspace.</p>
      <p>This link is valid for <strong>24 hours</strong> and can only be used once.</p>`,
      "{{verifyUrl}}", "Verify my email"),
    variables: [VAR_USER, VAR_APP, VAR_VERIFY],
  },

  welcome_email: {
    key: "welcome_email",
    name: "Welcome / registration confirmed",
    description: "Registration confirmation + welcome — sent on email verification OR the first successful login (exactly once).",
    category: "auth",
    subject: "Welcome to {{appName}}, {{userName}}! 🎉",
    bodyHtml: ctaWrap(`
      <h2 style="margin:0 0 12px;">You're all set! 🎉</h2>
      <p>Hi <strong>{{userName}}</strong>,</p>
      <p>Your {{appName}} account is active and you're signed in successfully —
         consider this your official welcome aboard.</p>
      <p>Here's what you can do next:</p>
      <ul style="margin:8px 0 12px 20px;padding:0;">
        <li>Build your first AI assistant</li>
        <li>Upload documents to a knowledge base</li>
        <li>Invite teammates to collaborate</li>
      </ul>
      <p style="font-size:12px;color:#888;margin:8px 0 0;">
        Tip: confirming your email address (link sent at sign-up) keeps your
        account secure and billing receipts reaching you.</p>`,
      "{{dashboardUrl}}", "Open my workspace"),
    variables: [VAR_USER, VAR_APP, VAR_DASH],
  },

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

  payment_success: {
    key: "payment_success",
    name: "Payment successful",
    description: "Receipt sent when a payment succeeds — first purchase and every renewal (Stripe + Razorpay).",
    category: "subscription",
    subject: "Payment received — {{appName}} {{planName}} ({{amount}})",
    bodyHtml: ctaWrap(`
      <h2 style="margin:0 0 12px;color:#10b981;">Payment successful ✅</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>We've received your payment of <strong>{{amount}}</strong> for the
         <strong>{{planName}}</strong> plan. Your subscription is active.</p>
      <p style="font-size:12px;color:#888;margin:12px 0;">
        Payment reference: {{paymentId}}</p>`,
      "{{receiptUrl}}", "View billing details"),
    variables: [VAR_ORG, VAR_PLAN, VAR_AMOUNT, VAR_RECEIPT, VAR_PAYMENT, VAR_APP],
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

  downgrade_scheduled: {
    key: "downgrade_scheduled",
    name: "Downgrade scheduled",
    description: "Sent when an org owner schedules a self-serve downgrade (takes effect at period end).",
    category: "subscription",
    subject: "Your {{appName}} plan will change to {{newPlan}} on {{trialEnd}} — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Downgrade scheduled</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>You've scheduled a downgrade from <strong>{{oldPlan}}</strong> to <strong>{{newPlan}}</strong>.</p>
      <p>You'll keep every <strong>{{oldPlan}}</strong> feature until <strong>{{trialEnd}}</strong> —
         no refund is issued for unused time. The new plan's limits apply after that date.</p>
      <p>Changed your mind? You can cancel the scheduled downgrade any time before then
         from your billing page.</p>`),
    variables: [VAR_ORG, VAR_OLD_PLAN, VAR_NEW_PLAN, VAR_END_DATE, VAR_APP],
  },

  downgrade_applied: {
    key: "downgrade_applied",
    name: "Downgrade applied",
    description: "Sent when a scheduled downgrade takes effect at the end of the billing period.",
    category: "subscription",
    subject: "Your {{appName}} plan is now {{newPlan}} — {{orgName}}",
    bodyHtml: subWrap(`
      <h2 style="margin:0 0 12px;">Plan changed</h2>
      <p>Hi <strong>{{orgName}}</strong>,</p>
      <p>Your scheduled downgrade from <strong>{{oldPlan}}</strong> to <strong>{{newPlan}}</strong>
         has now taken effect.</p>
      <p>You can upgrade again at any time from your billing page.</p>`),
    variables: [VAR_ORG, VAR_OLD_PLAN, VAR_NEW_PLAN, VAR_APP],
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
  _customVarsCache = null;
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

// ── Managed variable catalogue ────────────────────────────────────────────────
//
// System variables are derived FROM the code defaults (single source of
// truth): their names are the contract every send site passes, so they are
// read-only in the manager. Custom variables are admin-created static values
// injected into EVERY render as defaults — send-site values always win.

function variableUsageRegex(name: string): RegExp {
  return new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`);
}

const SYSTEM_VARIABLE_SEEDS: Array<{
  name: string; description: string; category: ManagedEmailVariable["category"];
}> = (() => {
  const map = new Map<string, { name: string; description: string; category: ManagedEmailVariable["category"] }>();
  for (const def of Object.values(EMAIL_TEMPLATE_DEFAULTS)) {
    for (const v of def.variables) {
      if (!map.has(v.name)) map.set(v.name, { name: v.name, description: v.description, category: def.category });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
})();

/** Every variable name the code can supply at send time (union over defaults). */
export const SYSTEM_VARIABLE_NAMES: ReadonlySet<string> = new Set(SYSTEM_VARIABLE_SEEDS.map((v) => v.name));

/** Seeds the system rows once (idempotent). Admin-edited descriptions persist. */
async function ensureEmailTemplateVariables(): Promise<void> {
  for (const v of SYSTEM_VARIABLE_SEEDS) {
    await query(
      `INSERT INTO email_template_variables (name, category, description, value, is_system)
       VALUES ($1, $2, $3, '', TRUE)
       ON CONFLICT (name) DO NOTHING`,
      [v.name, v.category, v.description],
    );
  }
}

// Custom variable values are read on every render — cache them like templates.
let _customVarsCache: { values: Record<string, string>; fetchedAt: number } | null = null;

async function getCustomVariableValues(): Promise<Record<string, string>> {
  if (_customVarsCache && Date.now() - _customVarsCache.fetchedAt < CACHE_TTL_MS) {
    return _customVarsCache.values;
  }
  try {
    const rows = await query<{ name: string; value: string }>(
      `SELECT name, value FROM email_template_variables WHERE is_system = FALSE`,
    );
    const values = Object.fromEntries(rows.map((r) => [r.name, r.value]));
    _customVarsCache = { values, fetchedAt: Date.now() };
    return values;
  } catch (err) {
    console.warn("[email-templates] variable read failed, skipping custom vars:", (err as Error).message);
    return {};
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
  opts?: { force?: boolean },
): Promise<RenderedEmail | null> {
  // Precedence: send-site values > custom static variables > appName default.
  const effective = { appName: APP, ...(await getCustomVariableValues()), ...vars };
  const row = await fetchTemplate(key);

  // Admin deactivated this template → suppress the email entirely.
  // `force` is used by the admin test-send tool, which must be able to
  // preview a deactivated template in a real inbox.
  if (row && !row.isActive && !opts?.force) {
    console.log(`[email-templates] "${key}" is deactivated — email suppressed`);
    return null;
  }

  // With `force` the DB row still renders (that's what would be sent the
  // moment the admin reactivates the template); without a row we use the
  // code default — the factory content IS the row's initial seed.
  const def = row ? row.def : EMAIL_TEMPLATE_DEFAULTS[key];
  const html = interpolate(def.bodyHtml, effective);
  const subject = interpolate(def.subject, effective);
  return {
    subject,
    html,
    text: htmlToText(html),
    source: row ? "db" : "default",
    suppressed: row ? !row.isActive : false,
  };
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

const TEMPLATE_ROW_SELECT = `
  SELECT template_key, name, description, category, subject, body_html, variables,
         is_active, updated_at,
         draft_subject, draft_body_html, draft_updated_at, draft_updated_by
    FROM email_templates`;

type TemplateRowRaw = {
  template_key: string; name: string; description: string; category: string;
  subject: string; body_html: string; variables: TemplateVariable[];
  is_active: boolean; updated_at: string;
  draft_subject: string | null; draft_body_html: string | null;
  draft_updated_at: string | null; draft_updated_by: string | null;
};

function rowToTemplate(row: TemplateRowRaw): EmailTemplateRow {
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
    draft:
      row.draft_subject !== null && row.draft_body_html !== null
        ? {
            subject: row.draft_subject,
            bodyHtml: row.draft_body_html,
            updatedAt: row.draft_updated_at ?? row.updated_at,
            updatedBy: row.draft_updated_by,
          }
        : null,
  };
}

export async function listEmailTemplates(): Promise<EmailTemplateRow[]> {
  await ensureEmailTemplates();
  const rows = await query<TemplateRowRaw>(
    `${TEMPLATE_ROW_SELECT} ORDER BY category, name`,
  );
  return rows.map(rowToTemplate);
}

export async function getEmailTemplate(key: EmailTemplateKey): Promise<EmailTemplateRow | null> {
  await ensureEmailTemplates();
  const rows = await query<TemplateRowRaw>(
    `${TEMPLATE_ROW_SELECT} WHERE template_key = $1`,
    [key],
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}

// ── Draft → publish flow ────────────────────────────────────────────────────
//
// "Save draft" writes ONLY the draft_* columns — the published subject/body
// stay untouched, so live email sending is never affected by an in-progress
// edit. "Publish" copies draft → live in one UPDATE (audited as 'publish'),
// "Discard" deletes the draft.

export async function saveEmailTemplateDraft(
  key: EmailTemplateKey,
  patch: { subject?: string; bodyHtml?: string },
  updatedBy?: string,
): Promise<EmailTemplateRow | null> {
  const current = await getEmailTemplate(key);
  if (!current) return null;

  const subject = patch.subject ?? current.draft?.subject ?? current.subject;
  const bodyHtml = patch.bodyHtml ?? current.draft?.bodyHtml ?? current.bodyHtml;

  await query(
    `UPDATE email_templates
        SET draft_subject = $2, draft_body_html = $3,
            draft_updated_at = now(), draft_updated_by = $4
      WHERE template_key = $1`,
    [key, subject, bodyHtml, updatedBy ?? null],
  );
  invalidateEmailTemplateCache();
  return getEmailTemplate(key);
}

/** Copies the draft into the live columns. Returns null when no draft exists. */
export async function publishEmailTemplate(
  key: EmailTemplateKey,
  updatedBy?: string,
): Promise<EmailTemplateRow | null> {
  const current = await getEmailTemplate(key);
  if (!current || !current.draft) return null;

  await query(
    `UPDATE email_templates
        SET subject = $2, body_html = $3,
            draft_subject = NULL, draft_body_html = NULL,
            draft_updated_at = NULL, draft_updated_by = NULL,
            updated_at = now(), updated_by = $4
      WHERE template_key = $1`,
    [key, current.draft.subject, current.draft.bodyHtml, updatedBy ?? null],
  );
  await query(
    `INSERT INTO email_template_audit (template_key, subject, body_html, is_active, updated_by, action)
     VALUES ($1, $2, $3, $4, $5, 'publish')`,
    [key, current.draft.subject, current.draft.bodyHtml, current.isActive, updatedBy ?? null],
  );
  invalidateEmailTemplateCache();
  return getEmailTemplate(key);
}

/** Deletes the in-progress draft. The published content is untouched (no audit). */
export async function discardEmailTemplateDraft(
  key: EmailTemplateKey,
): Promise<EmailTemplateRow | null> {
  await query(
    `UPDATE email_templates
        SET draft_subject = NULL, draft_body_html = NULL,
            draft_updated_at = NULL, draft_updated_by = NULL
      WHERE template_key = $1`,
    [key],
  );
  invalidateEmailTemplateCache();
  return getEmailTemplate(key);
}

/** Live toggle (applies immediately; audited like any other live change). */
export async function setEmailTemplateActive(
  key: EmailTemplateKey,
  isActive: boolean,
  updatedBy?: string,
): Promise<EmailTemplateRow | null> {
  const current = await getEmailTemplate(key);
  if (!current) return null;

  await query(
    `UPDATE email_templates
        SET is_active = $2, updated_at = now(), updated_by = $3
      WHERE template_key = $1`,
    [key, isActive, updatedBy ?? null],
  );
  await query(
    `INSERT INTO email_template_audit (template_key, subject, body_html, is_active, updated_by, action)
     VALUES ($1, $2, $3, $4, $5, 'update')`,
    [key, current.subject, current.bodyHtml, isActive, updatedBy ?? null],
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
        SET subject = $2, body_html = $3, is_active = TRUE,
            draft_subject = NULL, draft_body_html = NULL,
            draft_updated_at = NULL, draft_updated_by = NULL,
            updated_at = now(), updated_by = $4
      WHERE template_key = $1`,
    [key, def.subject, def.bodyHtml, updatedBy ?? null],
  );
  await query(
    `INSERT INTO email_template_audit (template_key, subject, body_html, is_active, updated_by, action)
     VALUES ($1, $2, $3, TRUE, $4, 'reset')`,
    [key, def.subject, def.bodyHtml, updatedBy ?? null],
  );
  invalidateEmailTemplateCache();
  return getEmailTemplate(key);
}

/** Variable catalogue for a key (always from code defaults — hints for the editor). */
export function templateVariables(key: EmailTemplateKey): TemplateVariable[] {
  return EMAIL_TEMPLATE_DEFAULTS[key]?.variables ?? [];
}

// ── Managed variable catalogue (Settings → Email Templates → Variables) ─────

const VARIABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
const VARIABLE_CATEGORIES = ["auth", "invitation", "subscription", "system", "custom"] as const;
export type VariableCategory = (typeof VARIABLE_CATEGORIES)[number];

export class EmailVariableError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Lists every variable (system ∪ custom) with real usage across templates. */
export async function listEmailTemplateVariables(): Promise<ManagedEmailVariable[]> {
  await ensureEmailTemplateVariables();
  const [rows, templates] = await Promise.all([
    query<{
      name: string; category: string; description: string; value: string;
      is_system: boolean; updated_at: string;
    }>(
      `SELECT name, category, description, value, is_system, updated_at
         FROM email_template_variables
        ORDER BY category, name`,
    ),
    query<{ template_key: string; subject: string; body_html: string;
            draft_subject: string | null; draft_body_html: string | null }>(
      `SELECT template_key, subject, body_html, draft_subject, draft_body_html
         FROM email_templates`,
    ),
  ]);

  // Usage scan: a variable is "used" when {{name}} appears in the published
  // OR draft subject/body of a template. Identifier-safe names need no regex escaping.
  const usage = new Map<string, string[]>();
  for (const v of rows) {
    const re = variableUsageRegex(v.name);
    const usedIn = templates
      .filter((t) =>
        re.test(t.subject) || re.test(t.body_html) ||
        (t.draft_subject !== null && re.test(t.draft_subject)) ||
        (t.draft_body_html !== null && re.test(t.draft_body_html)))
      .map((t) => t.template_key);
    usage.set(v.name, usedIn);
  }

  return rows.map((r) => ({
    name: r.name,
    category: r.category as ManagedEmailVariable["category"],
    description: r.description,
    value: r.value,
    isSystem: r.is_system,
    usedIn: usage.get(r.name) ?? [],
    updatedAt: r.updated_at,
  }));
}

export async function createEmailTemplateVariable(
  input: { name: string; category: string; description: string; value: string },
  updatedBy?: string,
): Promise<ManagedEmailVariable> {
  const name = input.name.trim();
  if (!VARIABLE_NAME_RE.test(name)) {
    throw new EmailVariableError(
      "Variable names may only contain letters, digits and underscores, and must start with a letter or underscore.",
    );
  }
  if (SYSTEM_VARIABLE_NAMES.has(name)) {
    throw new EmailVariableError(
      `"${name}" is a system variable supplied by the platform at send time — it cannot be redefined.`,
    );
  }
  const category = (VARIABLE_CATEGORIES as readonly string[]).includes(input.category)
    ? (input.category as VariableCategory)
    : "custom";
  if (typeof input.value !== "string" || input.value.trim().length === 0) {
    throw new EmailVariableError("A custom variable needs a value (what gets inserted into emails).");
  }

  const existing = await query<{ name: string }>(
    `SELECT name FROM email_template_variables WHERE name = $1`,
    [name],
  );
  if (existing.length) {
    throw new EmailVariableError(`A variable named "${name}" already exists.`, 409);
  }

  await query(
    `INSERT INTO email_template_variables (name, category, description, value, is_system, updated_by)
     VALUES ($1, $2, $3, $4, FALSE, $5)`,
    [name, category, input.description.trim(), input.value, updatedBy ?? null],
  );
  invalidateEmailTemplateCache();
  return (await listEmailTemplateVariables()).find((v) => v.name === name)
    ?? { name, category, description: input.description.trim(), value: input.value, isSystem: false, usedIn: [], updatedAt: new Date().toISOString() };
}

export async function updateEmailTemplateVariable(
  name: string,
  patch: { description?: string; value?: string; category?: string },
  updatedBy?: string,
): Promise<ManagedEmailVariable> {
  await ensureEmailTemplateVariables(); // self-heal system rows before lookup
  const rows = await query<{
    name: string; category: string; description: string; value: string;
    is_system: boolean; updated_at: string;
  }>(
    `SELECT name, category, description, value, is_system, updated_at
       FROM email_template_variables WHERE name = $1`,
    [name],
  );
  const row = rows[0];
  if (!row) throw new EmailVariableError(`No variable named "${name}" exists.`, 404);

  // System variables: only the description may be edited (name + value are
  // the code-level contract; values are supplied at send time).
  const description = patch.description !== undefined ? patch.description.trim() : row.description;
  if (row.is_system) {
    if (patch.value !== undefined && patch.value !== row.value) {
      throw new EmailVariableError(
        `"${name}" is a system variable — its value comes from the platform at send time and cannot be set.`,
      );
    }
    await query(
      `UPDATE email_template_variables SET description = $2, updated_at = now(), updated_by = $3 WHERE name = $1`,
      [name, description, updatedBy ?? null],
    );
  } else {
    const value = patch.value !== undefined ? patch.value : row.value;
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new EmailVariableError("A custom variable needs a value (what gets inserted into emails).");
    }
    const category = patch.category !== undefined
      ? ((VARIABLE_CATEGORIES as readonly string[]).includes(patch.category) ? (patch.category as VariableCategory) : row.category)
      : row.category;
    await query(
      `UPDATE email_template_variables
          SET description = $2, value = $3, category = $4, updated_at = now(), updated_by = $5
        WHERE name = $1`,
      [name, description, value, category, updatedBy ?? null],
    );
  }
  invalidateEmailTemplateCache();
  const all = await listEmailTemplateVariables();
  const updated = all.find((v) => v.name === name);
  if (!updated) throw new EmailVariableError("Variable disappeared during update.", 500);
  return updated;
}

/** Deletes a CUSTOM variable. Blocked while any template still uses it (unless force). */
export async function deleteEmailTemplateVariable(
  name: string,
  opts: { force?: boolean } = {},
): Promise<{ deleted: boolean; usedIn: string[] }> {
  await ensureEmailTemplateVariables(); // self-heal system rows before lookup
  const rows = await query<{ name: string; is_system: boolean }>(
    `SELECT name, is_system FROM email_template_variables WHERE name = $1`,
    [name],
  );
  const row = rows[0];
  if (!row) throw new EmailVariableError(`No variable named "${name}" exists.`, 404);
  if (row.is_system) {
    throw new EmailVariableError(
      `"${name}" is a system variable supplied by the platform — it cannot be deleted.`,
    );
  }

  const all = await listEmailTemplateVariables();
  const usedIn = all.find((v) => v.name === name)?.usedIn ?? [];
  if (usedIn.length > 0 && !opts.force) {
    return { deleted: false, usedIn };
  }

  await query(`DELETE FROM email_template_variables WHERE name = $1`, [name]);
  invalidateEmailTemplateCache();
  return { deleted: true, usedIn };
}

/** Recent live changes for the audit trail panel (newest first). */
export async function listEmailTemplateAudit(
  key: EmailTemplateKey,
  limit = 10,
): Promise<Array<{ id: number; action: string; subject: string; isActive: boolean; updatedBy: string | null; createdAt: string }>> {
  const rows = await query<{
    id: string; action: string; subject: string; is_active: boolean;
    updated_by: string | null; created_at: string;
  }>(
    `SELECT id, action, subject, is_active, updated_by, created_at
       FROM email_template_audit
      WHERE template_key = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [key, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    action: r.action,
    subject: r.subject,
    isActive: r.is_active,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
  }));
}
