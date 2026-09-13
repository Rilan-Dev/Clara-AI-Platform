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
import { sendPlatformEmail } from "@/lib/email";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
  | "plan_changed"
  | "subscription_cancelled"
  | "subscription_paused"
  | "subscription_resumed"
  | "trial_extended"
  | "trial_converted"
  | "trial_ending_soon"
  | "payment_failed"
  | "subscription_reactivated"
  | "renewal_reminder"
  | "subscription_expired"
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

// ── Template builder ──────────────────────────────────────────────────────────

function buildTemplate(type: NotificationType, data: Record<string, string | number | boolean>): {
  subject: string; bodyHtml: string; bodyText: string;
} {
  const APP = "Clara AI";
  const { orgName, planName, oldPlan, newPlan, trialEnd, trialDays, note } = data as Record<string, string>;

  const footer = `
    <p style="color:#888;font-size:12px;margin-top:32px;">
      This is an automated message from ${APP}. If you have questions, reply to this email.
    </p>`;

  const wrap = (body: string) => `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0f0f14;color:#e2e8f0;border-radius:12px;">
      <div style="margin-bottom:24px;">
        <span style="font-size:22px;font-weight:800;background:linear-gradient(90deg,#818cf8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
          ${APP}
        </span>
      </div>
      ${body}${footer}
    </div>`;

  switch (type) {
    case "plan_changed":
      return {
        subject: `Your ${APP} plan has been updated — ${orgName}`,
        bodyHtml: wrap(`
          <h2 style="color:#fff;margin-bottom:8px;">Plan updated</h2>
          <p>Hi <strong>${orgName}</strong>,</p>
          <p>Your subscription has been changed from <strong>${oldPlan}</strong> to <strong>${newPlan}</strong>.</p>
          ${note ? `<p><em>Admin note: ${note}</em></p>` : ""}
          <p>Your new features are active immediately.</p>`),
        bodyText: `Plan updated for ${orgName}: ${oldPlan} → ${newPlan}.${note ? ` Note: ${note}` : ""}`,
      };

    case "subscription_cancelled":
      return {
        subject: `Your ${APP} subscription has been cancelled — ${orgName}`,
        bodyHtml: wrap(`
          <h2 style="color:#fff;margin-bottom:8px;">Subscription cancelled</h2>
          <p>Hi <strong>${orgName}</strong>,</p>
          <p>Your <strong>${planName}</strong> subscription has been cancelled.</p>
          <p>You retain access until the end of your current billing period.</p>
          ${note ? `<p><em>Reason: ${note}</em></p>` : ""}
          <p>If this was a mistake, please contact support.</p>`),
        bodyText: `Subscription cancelled for ${orgName} (${planName}).${note ? ` Reason: ${note}` : ""}`,
      };

    case "subscription_paused":
      return {
        subject: `Your ${APP} subscription has been paused — ${orgName}`,
        bodyHtml: wrap(`
          <h2 style="color:#fff;margin-bottom:8px;">Subscription paused</h2>
          <p>Hi <strong>${orgName}</strong>,</p>
          <p>Your <strong>${planName}</strong> subscription has been temporarily paused.</p>
          ${note ? `<p><em>Reason: ${note}</em></p>` : ""}
          <p>Your data is safe. Contact support to resume access.</p>`),
        bodyText: `Subscription paused for ${orgName} (${planName}).${note ? ` Reason: ${note}` : ""}`,
      };

    case "subscription_resumed":
      return {
        subject: `Your ${APP} subscription has been resumed — ${orgName}`,
        bodyHtml: wrap(`
          <h2 style="color:#fff;margin-bottom:8px;">Subscription resumed</h2>
          <p>Hi <strong>${orgName}</strong>,</p>
          <p>Great news — your <strong>${planName}</strong> subscription is active again.</p>
          <p>All your features are restored immediately.</p>`),
        bodyText: `Subscription resumed for ${orgName} (${planName}).`,
      };

    case "trial_extended":
      return {
        subject: `Your ${APP} trial has been extended — ${orgName}`,
        bodyHtml: wrap(`
          <h2 style="color:#fff;margin-bottom:8px;">Trial extended 🎉</h2>
          <p>Hi <strong>${orgName}</strong>,</p>
          <p>Your free trial has been extended by <strong>${trialDays} days</strong>.</p>
          <p>New trial end date: <strong>${trialEnd}</strong>.</p>
          ${note ? `<p><em>Note: ${note}</em></p>` : ""}`),
        bodyText: `Trial extended for ${orgName} by ${trialDays} days (ends ${trialEnd}).`,
      };

    case "trial_converted":
      return {
        subject: `Welcome to ${APP} ${planName}! — ${orgName}`,
        bodyHtml: wrap(`
          <h2 style="color:#fff;margin-bottom:8px;">Trial converted to paid 🚀</h2>
          <p>Hi <strong>${orgName}</strong>,</p>
          <p>Your trial has been converted to an active <strong>${planName}</strong> subscription.</p>
          <p>Thank you for choosing ${APP}!</p>`),
        bodyText: `Trial converted to ${planName} for ${orgName}.`,
      };

    case "subscription_reactivated":
      return {
        subject: `Your ${APP} subscription has been reactivated — ${orgName}`,
        bodyHtml: wrap(`
          <h2 style="color:#fff;margin-bottom:8px;">Subscription reactivated</h2>
          <p>Hi <strong>${orgName}</strong>,</p>
          <p>Your <strong>${planName}</strong> subscription has been reactivated.</p>
          <p>All your features are available again immediately.</p>`),
        bodyText: `Subscription reactivated for ${orgName} (${planName}).`,
      };

    case "renewal_reminder":
      return {
        subject: `Action needed: your ${APP} ${planName} plan ends soon — ${orgName}`,
        bodyHtml: wrap(`
          <h2 style="color:#fff;margin-bottom:8px;">Renewal reminder</h2>
          <p>Hi <strong>${orgName}</strong>,</p>
          <p>Your <strong>${planName}</strong> subscription is scheduled to end on
             <strong>${trialEnd}</strong> (${trialDays} day(s) left).</p>
          <p>To keep your assistants, knowledge bases and analytics running without
             interruption, renew before the end date.</p>`),
        bodyText: `Renewal reminder for ${orgName}: ${planName} ends ${trialEnd} (${trialDays} days left). Renew to avoid interruption.`,
      };

    case "subscription_expired":
      return {
        subject: `Your ${APP} subscription has expired — renew to restore access — ${orgName}`,
        bodyHtml: wrap(`
          <h2 style="color:#f87171;margin-bottom:8px;">Subscription expired</h2>
          <p>Hi <strong>${orgName}</strong>,</p>
          <p>Your <strong>${planName}</strong> subscription ended on <strong>${trialEnd}</strong>.</p>
          <p>Premium features (voice, analytics, API access and higher usage limits) are
             now restricted. Your data is safe and will be retained.</p>
          <p style="margin-top:16px;">Renew your subscription to instantly restore full access.</p>`),
        bodyText: `Subscription expired for ${orgName} (${planName}) on ${trialEnd}. Renew to restore access. Your data is safe.`,
      };

    default:
      return {
        subject:  `${APP} subscription update — ${orgName}`,
        bodyHtml: wrap(`<p>Your subscription has been updated. Please log in for details.</p>`),
        bodyText: `Subscription update for ${orgName}.`,
      };
  }
}

// ── Queue a notification ──────────────────────────────────────────────────────

export async function queueNotification(payload: NotificationPayload): Promise<string> {
  const { subject, bodyHtml, bodyText } = buildTemplate(payload.type, {
    orgName: payload.orgName,
    ...payload.data,
  });

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

// ── Audit log helper ──────────────────────────────────────────────────────────

export async function writeSubscriptionAudit(params: {
  orgId:       string;
  actorUserId?: string;
  actorLabel:  "admin" | "system" | "webhook";
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
