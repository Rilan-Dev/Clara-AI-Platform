/**
 * src/lib/notifications.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Email notification placeholders for subscription lifecycle events.
 *
 * Each function logs the notification intent and returns a typed payload.
 * Wire up to your email provider (Resend, SendGrid, Postmark, etc.) by
 * implementing the `sendEmail()` function below and calling it from each
 * notification helper.
 *
 * To enable real sending:
 *   1. Install your provider SDK (e.g. `npm install resend`)
 *   2. Set NOTIFICATION_FROM_EMAIL and provider API key in .env
 *   3. Replace the `sendEmail` stub with the real call
 */

export type EmailPayload = {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
};

// ── Stub: replace with real email-send call ───────────────────────────────────
async function sendEmail(payload: EmailPayload): Promise<void> {
  // STUB — log only. Replace with:
  //   await resend.emails.send({ from: FROM, to: payload.to, subject: payload.subject, html: payload.html });
  console.log("[notifications] STUB — would send email:", {
    to:      payload.to,
    subject: payload.subject,
  });
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function wrap(body: string): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e;">
      <div style="background:#6366f1;padding:24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:20px;">Clara AI</h2>
      </div>
      <div style="padding:28px;background:#f9f9fb;border-radius:0 0 8px 8px;">
        ${body}
      </div>
      <p style="font-size:11px;color:#888;text-align:center;margin-top:16px;">
        Clara AI · Subscription Notifications
      </p>
    </div>`;
}

function plain(body: string): string {
  // Strip simple HTML for text version
  return body.replace(/<[^>]+>/g, "").replace(/\s{2,}/g, " ").trim();
}

// ── Notification functions ────────────────────────────────────────────────────

/** Fired when admin changes an org's plan */
export async function notifyPlanChanged(opts: {
  orgName:   string;
  adminEmail: string;
  orgEmail:   string;
  oldPlan:   string;
  newPlan:   string;
}): Promise<void> {
  const html = wrap(`
    <h3>Plan changed for <strong>${opts.orgName}</strong></h3>
    <p>Your subscription plan has been updated by an administrator.</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:8px;color:#666;">Previous plan</td><td style="padding:8px;font-weight:600;">${opts.oldPlan}</td></tr>
      <tr><td style="padding:8px;color:#666;">New plan</td><td style="padding:8px;font-weight:600;color:#6366f1;">${opts.newPlan}</td></tr>
    </table>
    <p style="margin-top:20px;">If you have questions, contact support.</p>
  `);
  await sendEmail({ to: opts.orgEmail, subject: `Your Clara AI plan has been updated to ${opts.newPlan}`, html, text: plain(html) });
  await sendEmail({ to: opts.adminEmail, subject: `[Admin] Plan changed for ${opts.orgName}: ${opts.oldPlan} → ${opts.newPlan}`, html, text: plain(html) });
}

/** Fired when a subscription is cancelled */
export async function notifySubscriptionCancelled(opts: {
  orgName:    string;
  orgEmail:   string;
  adminEmail: string;
  effectiveAt: string;   // ISO date string
  reason?:    string;
}): Promise<void> {
  const html = wrap(`
    <h3>Subscription cancelled — <strong>${opts.orgName}</strong></h3>
    <p>Your Clara AI subscription has been cancelled.</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:8px;color:#666;">Effective date</td><td style="padding:8px;font-weight:600;">${new Date(opts.effectiveAt).toLocaleDateString()}</td></tr>
      ${opts.reason ? `<tr><td style="padding:8px;color:#666;">Reason</td><td style="padding:8px;">${opts.reason}</td></tr>` : ""}
    </table>
    <p style="margin-top:20px;">You will retain access until the effective date. Contact support to reinstate.</p>
  `);
  await sendEmail({ to: opts.orgEmail, subject: `Your Clara AI subscription has been cancelled`, html, text: plain(html) });
  await sendEmail({ to: opts.adminEmail, subject: `[Admin] Subscription cancelled for ${opts.orgName}`, html, text: plain(html) });
}

/** Fired when a subscription is paused */
export async function notifySubscriptionPaused(opts: {
  orgName:    string;
  orgEmail:   string;
  adminEmail: string;
  reason?:    string;
}): Promise<void> {
  const html = wrap(`
    <h3>Subscription paused — <strong>${opts.orgName}</strong></h3>
    <p>Your Clara AI subscription has been temporarily paused by an administrator.</p>
    ${opts.reason ? `<p><strong>Reason:</strong> ${opts.reason}</p>` : ""}
    <p>Access to paid features will be restricted until the subscription is resumed. Contact support for assistance.</p>
  `);
  await sendEmail({ to: opts.orgEmail, subject: `Your Clara AI subscription has been paused`, html, text: plain(html) });
  await sendEmail({ to: opts.adminEmail, subject: `[Admin] Subscription paused for ${opts.orgName}`, html, text: plain(html) });
}

/** Fired when a subscription is resumed */
export async function notifySubscriptionResumed(opts: {
  orgName:    string;
  orgEmail:   string;
  adminEmail: string;
}): Promise<void> {
  const html = wrap(`
    <h3>Subscription resumed — <strong>${opts.orgName}</strong></h3>
    <p>Good news! Your Clara AI subscription has been reinstated. All features are now accessible.</p>
  `);
  await sendEmail({ to: opts.orgEmail, subject: `Your Clara AI subscription has been resumed`, html, text: plain(html) });
  await sendEmail({ to: opts.adminEmail, subject: `[Admin] Subscription resumed for ${opts.orgName}`, html, text: plain(html) });
}

/** Fired when a trial is extended */
export async function notifyTrialExtended(opts: {
  orgName:     string;
  orgEmail:    string;
  adminEmail:  string;
  newTrialEnd: string;  // ISO date string
  daysAdded:   number;
}): Promise<void> {
  const html = wrap(`
    <h3>Trial extended — <strong>${opts.orgName}</strong></h3>
    <p>Your Clara AI free trial has been extended by ${opts.daysAdded} day${opts.daysAdded !== 1 ? "s" : ""}.</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:8px;color:#666;">New trial end date</td><td style="padding:8px;font-weight:600;color:#6366f1;">${new Date(opts.newTrialEnd).toLocaleDateString()}</td></tr>
    </table>
    <p style="margin-top:20px;">Enjoy the extended access — no credit card required.</p>
  `);
  await sendEmail({ to: opts.orgEmail, subject: `Your Clara AI trial has been extended`, html, text: plain(html) });
  await sendEmail({ to: opts.adminEmail, subject: `[Admin] Trial extended for ${opts.orgName} (${opts.daysAdded}d)`, html, text: plain(html) });
}

/** Fired when a trial is converted to a paid plan */
export async function notifyTrialConverted(opts: {
  orgName:    string;
  orgEmail:   string;
  adminEmail: string;
  planName:   string;
}): Promise<void> {
  const html = wrap(`
    <h3>Trial converted — <strong>${opts.orgName}</strong></h3>
    <p>Your Clara AI trial has been converted to a paid <strong>${opts.planName}</strong> subscription.</p>
    <p style="margin-top:20px;">Welcome to Clara AI! You now have full access to all ${opts.planName} features.</p>
  `);
  await sendEmail({ to: opts.orgEmail, subject: `Welcome to Clara AI ${opts.planName}!`, html, text: plain(html) });
  await sendEmail({ to: opts.adminEmail, subject: `[Admin] Trial converted for ${opts.orgName} → ${opts.planName}`, html, text: plain(html) });
}

/** Generic subscription event notification (e.g. payment failed) */
export async function notifySubscriptionEvent(opts: {
  orgEmail:   string;
  subject:    string;
  message:    string;
}): Promise<void> {
  const html = wrap(`<p>${opts.message}</p>`);
  await sendEmail({ to: opts.orgEmail, subject: opts.subject, html, text: plain(html) });
}
