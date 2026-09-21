/**
 * src/lib/subscription-notifications.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Subscription email notification placeholders.
 *
 * Each function builds and queues a notification row in subscription_notifications.
 * A real email provider (Resend, SendGrid, SES) can be wired in by replacing
 * the `sendEmail` stub at the bottom with actual SDK calls.
 *
 * The queue is processed either:
 *   - Inline (fire-and-forget after the API action)
 *   - By a background worker polling `WHERE status = 'pending'`
 */

import { query } from "@/lib/db";
import { sendPlatformEmail, appUrl } from "@/lib/email";
import { renderEmailTemplate, type EmailTemplateKey } from "@/lib/email-templates";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
  | "plan_changed"
  | "subscription_cancelled"
  | "subscription_paused"
  | "subscription_resumed"
  | "trial_extended"
  | "trial_converted"
  | "trial_ending_soon"
  | "payment_success"
  | "payment_failed"
  | "subscription_reactivated"
  | "renewal_reminder"
  | "subscription_expired"
  | "downgrade_scheduled"
  | "downgrade_applied"
  | "password_reset"
  | "password_changed"
  | "org_invitation";

interface NotificationPayload {
  orgId:       string;
  orgName:     string;
  recipientEmail: string;
  type:        NotificationType;
  data:        Record<string, string | number | boolean>;
}

// ── Template rendering ───────────────────────────────────────────────────────
// Subjects and HTML come from the DB-editable template system (Settings →
// Email Templates) with the code defaults as fallback. "org_invitation" maps
// to the existing-user invitation template (it is never queued here).

function templateKeyFor(type: NotificationType): EmailTemplateKey {
  if (type === "org_invitation") return "org_invitation_existing_user";
  return type as EmailTemplateKey;
}

async function buildTemplate(type: NotificationType, data: Record<string, string | number | boolean>): Promise<{
  subject: string; bodyHtml: string; bodyText: string;
} | null> {
  const rendered = await renderEmailTemplate(templateKeyFor(type), {
    ...data,
    renewUrl: appUrl("/login"),
  });
  // null → a platform admin deactivated this template (Settings → Email
  // Templates). The business event still happened, so the caller records a
  // 'suppressed' queue row for auditability instead of sending.
  if (!rendered) return null;
  return { subject: rendered.subject, bodyHtml: rendered.html, bodyText: rendered.text };
}

// ── Queue a notification ──────────────────────────────────────────────────────

export async function queueNotification(payload: NotificationPayload): Promise<string> {
  const built = await buildTemplate(payload.type, {
    orgName: payload.orgName,
    ...payload.data,
  });

  // Template deactivated by a platform admin → keep an auditable trace that
  // the event occurred but no email was delivered (status 'suppressed' is
  // part of the queue schema and rendered in the admin UI).
  if (!built) {
    const rows = await query<{ id: string }>(`
      INSERT INTO subscription_notifications
        (org_id, recipient_email, notification_type, subject, body_html, body_text, status, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, 'suppressed', $7)
      RETURNING id
    `, [payload.orgId, payload.recipientEmail, payload.type,
         `${payload.type} (template deactivated)`, "", "",
         JSON.stringify({ ...payload.data, suppressed: true })]);
    console.log(`[notifications] ${payload.type} for org ${payload.orgId} suppressed — template deactivated`);
    return rows[0]?.id ?? "";
  }

  const { subject, bodyHtml, bodyText } = built;

  const rows = await query<{ id: string }>(`
    INSERT INTO subscription_notifications
      (org_id, recipient_email, notification_type, subject, body_html, body_text, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [payload.orgId, payload.recipientEmail, payload.type, subject, bodyHtml, bodyText, JSON.stringify(payload.data)]);

  const notifId = rows[0]?.id ?? "";

  // Fire-and-forget: attempt delivery immediately via the unified email lib.
  sendEmail({ to: payload.recipientEmail, subject, bodyHtml, bodyText, notifId }).catch(console.error);

  return notifId;
}

// ── Email sender — delegates to the unified platform email lib ────────────────
// Tracks delivery status on the subscription_notifications row so the queue
// can be retried / audited later.

async function sendEmail(opts: {
  to: string; subject: string; bodyHtml: string; bodyText: string; notifId: string;
}): Promise<void> {
  const result = await sendPlatformEmail({
    to: opts.to, subject: opts.subject, html: opts.bodyHtml, text: opts.bodyText,
  });

  if (result.sent) {
    await query(`UPDATE subscription_notifications SET status='sent', sent_at=now(), attempts=attempts+1 WHERE id=$1`, [opts.notifId]);
    return;
  }

  // No provider configured (dev) → mark as sent so the queue doesn't pile up.
  // Provider failure → mark failed with the error for retry/audit.
  if (result.provider === "console") {
    await query(`UPDATE subscription_notifications SET status='sent', sent_at=now() WHERE id=$1`, [opts.notifId]);
  } else {
    await query(
      `UPDATE subscription_notifications SET status='failed', error_message=$1, attempts=attempts+1 WHERE id=$2`,
      [result.error ?? "unknown error", opts.notifId]
    );
  }
}

// ── Org owner resolution ──────────────────────────────────────────────────────

/** First org_admin's email — the recipient for all subscription lifecycle mail. */
export async function getOrgOwnerEmail(orgId: string): Promise<string | null> {
  try {
    const rows = await query<{ email: string }>(
      `SELECT u.email FROM users u
         JOIN org_members om ON om.user_id = u.id
         JOIN roles r ON r.id = om.role_id
        WHERE om.org_id = $1 AND r.name = 'org_admin'
        ORDER BY om.joined_at ASC LIMIT 1`,
      [orgId]
    );
    return rows[0]?.email ?? null;
  } catch {
    return null;
  }
}

// ── Audit log helper ──────────────────────────────────────────────────────────

export async function writeSubscriptionAudit(params: {
  orgId:       string;
  actorUserId?: string;
  actorLabel:  "admin" | "system" | "webhook" | "user";
  action:      string;
  oldPlanId?:  string;
  newPlanId?:  string;
  oldStatus?:  string;
  newStatus?:  string;
  note?:       string;
  metadata?:   Record<string, unknown>;
}): Promise<void> {
  await query(`
    INSERT INTO subscription_audit_log
      (org_id, actor_user_id, actor_label, action, old_plan_id, new_plan_id, old_status, new_status, note, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [
    params.orgId,
    params.actorUserId ?? null,
    params.actorLabel,
    params.action,
    params.oldPlanId ?? null,
    params.newPlanId ?? null,
    params.oldStatus ?? null,
    params.newStatus ?? null,
    params.note ?? null,
    JSON.stringify(params.metadata ?? {}),
  ]);
}
