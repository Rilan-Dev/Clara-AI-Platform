/**
 * src/lib/email.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified transactional email sender for the whole platform.
 *
 * Two providers, ONE active at a time (platform admin switches in
 * Settings → Email Delivery; the choice is stored in platform_env_settings
 * as EMAIL_PROVIDER and overlays process.env, so a save takes effect on the
 * very next send — no restart needed):
 *
 *   1. Resend  (EMAIL_PROVIDER=resend, RESEND_API_KEY)     — production primary
 *   2. SMTP    (EMAIL_PROVIDER=smtp, SMTP_HOST/PORT/USER…) — any SMTP server
 *      (Gmail example: smtp.gmail.com:465 SSL + 16-char app password)
 *   3. Console log                                        — development fallback
 *
 * Every email is branded with the same Clara wrapper so password resets,
 * subscription lifecycle mails and invitations look consistent. Subject and
 * body come from the DB-editable templates in src/lib/email-templates.ts
 * whenever a caller uses renderEmailTemplate().
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
  provider: "resend" | "smtp" | "console";
  error?: string;
  messageId?: string;
};

export type EmailProviderName = "resend" | "smtp" | "console";

// ── Configuration ─────────────────────────────────────────────────────────────
//
// process.env is the single source of truth at runtime: it is seeded from the
// DB at startup (loadRuntimeSettings) and kept live by setPlatformEnvSetting,
// which writes through on every admin save.

export type EmailConfig = {
  provider: "resend" | "smtp" | "console";
  fromName: string;
  fromAddress: string;          // provider-specific sender
  resendApiKey: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    fromAddress: string;        // SMTP_FROM_ADDRESS || EMAIL_FROM_ADDRESS
  };
};

export function getEmailConfig(): EmailConfig {
  const providerEnv = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  const fromName = (process.env.EMAIL_FROM_NAME ?? "Clara AI").trim();
  const globalFrom = (process.env.EMAIL_FROM_ADDRESS ?? "").trim();
  const resendApiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const smtpHost = (process.env.SMTP_HOST ?? "").trim();
  const smtpUser = (process.env.SMTP_USER ?? "").trim();
  const smtpPassword = (process.env.SMTP_PASSWORD ?? "").trim();

  // Resolve the active provider — a provider is only "on" when it has its
  // credentials, otherwise we silently fall back to console mode.
  let provider: "resend" | "smtp" | "console";
  if (providerEnv === "smtp" && smtpHost) {
    provider = "smtp";
  } else if (providerEnv === "smtp" && !smtpHost && resendApiKey) {
    provider = "resend"; // switched to SMTP but not configured yet → resend
  } else if (providerEnv === "resend" && resendApiKey) {
    provider = "resend";
  } else if (resendApiKey) {
    provider = "resend"; // legacy default: key present but no explicit choice
  } else if (smtpHost) {
    provider = "smtp";
  } else {
    provider = "console";
  }

  // Sender per provider:
  //  - Resend  → must be on a verified domain (EMAIL_FROM_ADDRESS)
  //  - SMTP    → SMTP_FROM_ADDRESS (Gmail requires the authenticated address)
  const domainFallback = process.env.EMAIL_FROM_DOMAIN?.trim() || "clara.ai";
  const resendFrom = globalFrom || `noreply@${domainFallback}`;
  const smtpFrom = (process.env.SMTP_FROM_ADDRESS ?? "").trim() || globalFrom || smtpUser;

  const port = parseInt(process.env.SMTP_PORT ?? "465", 10);
  const secureEnv = (process.env.SMTP_SECURE ?? "").trim().toLowerCase();
  // Default: port 465 → implicit SSL; 587/25 → STARTTLS.
  const secure = secureEnv !== "" ? secureEnv === "true" : port === 465;

  return {
    provider,
    fromName,
    fromAddress: provider === "smtp" ? smtpFrom : resendFrom,
    resendApiKey,
    smtp: { host: smtpHost, port, secure, user: smtpUser, password: smtpPassword, fromAddress: smtpFrom },
  };
}

export function emailFrom(): string {
  const cfg = getEmailConfig();
  return `${cfg.fromName} <${cfg.fromAddress}>`;
}

export function hasEmailProvider(): boolean {
  return getEmailConfig().provider !== "console";
}

export function getEmailProviderConfigStatus(): {
  provider: EmailProviderName;
  configured: boolean;
  reason?: string;
} {
  const cfg = getEmailConfig();
  if (cfg.provider === "resend") {
    if (!cfg.resendApiKey) return { provider: cfg.provider, configured: false, reason: "Resend API key is not configured." };
    if (!cfg.fromAddress || !cfg.fromAddress.includes("@")) {
      return { provider: cfg.provider, configured: false, reason: "Resend sender address is not configured." };
    }
    return { provider: cfg.provider, configured: true };
  }
  if (cfg.provider === "smtp") {
    if (!cfg.smtp.host) return { provider: cfg.provider, configured: false, reason: "SMTP host is not configured." };
    if (!cfg.smtp.user) return { provider: cfg.provider, configured: false, reason: "SMTP username is not configured." };
    if (!cfg.smtp.password) return { provider: cfg.provider, configured: false, reason: "SMTP password/app password is not configured." };
    if (!cfg.smtp.fromAddress || !cfg.smtp.fromAddress.includes("@")) {
      return { provider: cfg.provider, configured: false, reason: "SMTP sender address is not configured." };
    }
    return { provider: cfg.provider, configured: true };
  }
  return { provider: "console", configured: false, reason: "No email provider is configured." };
}

// ── SMTP transporter cache ────────────────────────────────────────────────────
// nodemailer transporters are pooled (5 keep-alive connections). Credentials are
// captured per transporter; whenever an SMTP setting changes we drop the cache
// (see resetEmailTransportCache) so the next send picks up new credentials.

type SmtpTransport = {
  sendMail: (opts: {
    from: string; to: string; subject: string; html: string; text: string;
  }) => Promise<{ messageId: string; response?: string }>;
};

let _smtpTransport: SmtpTransport | null = null;
let _smtpSignature = "";

function smtpSignature(cfg: EmailConfig): string {
  return [cfg.smtp.host, cfg.smtp.port, cfg.smtp.secure, cfg.smtp.user, cfg.smtp.password, cfg.smtp.fromAddress].join("|");
}

export function resetEmailTransportCache(): void {
  _smtpTransport = null;
  _smtpSignature = "";
}

async function getSmtpTransport(cfg: EmailConfig): Promise<SmtpTransport> {
  const sig = smtpSignature(cfg);
  if (_smtpTransport && _smtpSignature === sig) return _smtpTransport;
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.password } : undefined,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  _smtpTransport = transport as unknown as SmtpTransport;
  _smtpSignature = sig;
  return _smtpTransport;
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
  const cfg = getEmailConfig();
  const text = email.text ?? htmlToText(email.html);
  const from = emailFrom();

  // Development fallback — no provider configured.
  if (cfg.provider === "console") {
    console.log(`[email] 📧 DEV MODE — no provider, would send:
  to:      ${email.to}
  subject: ${email.subject}
  text:    ${text.slice(0, 180)}...`);
    return { sent: false, provider: "console" };
  }

  if (cfg.provider === "smtp") {
    try {
      const transport = await getSmtpTransport(cfg);
      const info = await transport.sendMail({
        from, to: email.to, subject: email.subject, html: email.html, text,
      });
      console.log(`[email] ✅ [smtp] Sent "${email.subject}" to ${email.to} (${info.messageId})`);
      return { sent: true, provider: "smtp", messageId: info.messageId };
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[email] ❌ [smtp] Failed to send to ${email.to}:`, message);
      return { sent: false, provider: "smtp", error: message };
    }
  }

  // Resend
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(cfg.resendApiKey);
    const result = await resend.emails.send({
      from, to: email.to, subject: email.subject, html: email.html, text,
    });

    if (result.error) {
      console.error(`[email] ❌ [resend] Error for ${email.to}:`, result.error.message);
      return { sent: false, provider: "resend", error: result.error.message };
    }
    console.log(`[email] ✅ [resend] Sent "${email.subject}" to ${email.to}`);
    return { sent: true, provider: "resend", messageId: result.data?.id };
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[email] ❌ [resend] Failed to send to ${email.to}:`, message);
    return { sent: false, provider: "resend", error: message };
  }
}

// ── Reuse the canonical app URL helper ────────────────────────────────────────

export { appUrl };

// ── Request-aware public origin ───────────────────────────────────────────────
//
// Implementation lives in the dependency-free src/lib/public-origin.ts (see
// the docs there for why a bare env-based appUrl() breaks emailed links on
// unconfigured deploys). Re-exported here so every email-sending call site
// can pull it from the same module it already imports.

export { resolvePublicOrigin, appUrlFor } from "@/lib/public-origin";
