/**
 * src/lib/email.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified transactional email sender for the whole platform.
 *
 * Provider order:
 *   1. Resend (RESEND_API_KEY)          — production primary
 *   2. Console log                      — development fallback (no provider)
 *
 * Every email is branded with the same Clara wrapper so password resets,
 * subscription lifecycle mails and invitations look consistent.
 *
 * Usage:
 *   import { sendPlatformEmail } from "@/lib/email";
 *   await sendPlatformEmail({ to, subject, html, text });
 */

import { appUrl } from "@/lib/stripe";

export type PlatformEmail = {
  to:      string;
  subject: string;
  html:    string;
  text?:   string;
};

export type EmailSendResult = {
  sent:   boolean;
  provider: "resend" | "console";
  error?: string;
};

// ── Configuration ─────────────────────────────────────────────────────────────

export function emailFrom(): string {
  const domain = process.env.EMAIL_FROM_DOMAIN ?? "clara.ai";
  return `Clara AI <noreply@${domain}>`;
}

export function hasEmailProvider(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    process.env.SMTP_HOST
  );
}

// ── Branded wrapper ───────────────────────────────────────────────────────────

export function wrapEmail(body: string, opts?: { ctaUrl?: string; ctaLabel?: string }): string {
  const cta = opts?.ctaUrl
    ? `<div style="text-align:center;margin:28px 0;">
         <a href="${opts.ctaUrl}"
            style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;
                   font-weight:600;font-size:14px;padding:12px 28px;border-radius:10px;">
           ${opts.ctaLabel ?? "Open Clara AI"}
         </a>
       </div>
       <p style="font-size:12px;color:#888;word-break:break-all;">
         Or copy this link: ${opts.ctaUrl}
       </p>`
    : "";
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                max-width:560px;margin:0 auto;color:#1a1a2e;">
      <div style="background:#0f0f14;padding:22px 24px;border-radius:12px 12px 0 0;">
        <span style="font-size:20px;font-weight:800;color:#ffffff;">Clara AI</span>
        <span style="float:right;font-size:11px;color:#818cf8;letter-spacing:0.08em;">AI ASSISTANT PLATFORM</span>
      </div>
      <div style="padding:28px 26px;background:#ffffff;border:1px solid #eee;border-top:0;
                  border-radius:0 0 12px 12px;">
        ${body}
        ${cta}
      </div>
      <p style="font-size:11px;color:#999;text-align:center;margin-top:14px;">
        You are receiving this because you have a Clara AI account.
        If this wasn't you, please contact support immediately.
      </p>
    </div>`;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<a[^>]*href="([^"]+)"[^>]*>[^<]*<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Sender ────────────────────────────────────────────────────────────────────

export async function sendPlatformEmail(email: PlatformEmail): Promise<EmailSendResult> {
  const text = email.text ?? htmlToText(email.html);

  // Development fallback — no provider configured.
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email] 📧 DEV MODE — no provider, would send:
  to:      ${email.to}
  subject: ${email.subject}
  text:    ${text.slice(0, 180)}...`);
    return { sent: false, provider: "console" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from:  emailFrom(),
      to:    email.to,
      subject: email.subject,
      html:  email.html,
      text,
    });

    if (result.error) {
      console.error(`[email] ❌ Resend error for ${email.to}:`, result.error.message);
      return { sent: false, provider: "resend", error: result.error.message };
    }
    console.log(`[email] ✅ Sent "${email.subject}" to ${email.to}`);
    return { sent: true, provider: "resend" };
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[email] ❌ Failed to send to ${email.to}:`, message);
    return { sent: false, provider: "resend", error: message };
  }
}

// ── Reuse the canonical app URL helper ────────────────────────────────────────

export { appUrl };
