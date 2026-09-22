/**
 * src/modules/auth/api/email-verification.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Email verification flow for the signup funnel:
 *
 *   POST /api/auth/verify-email          { token }
 *     → marks users.email_verified = TRUE, sends the welcome email
 *       (exactly-once via users.welcome_email_sent_at, migration 049).
 *       Public endpoint — the emailed token IS the credential (single-use,
 *       24h expiry, HMAC-hashed at rest exactly like password resets).
 *
 *   POST /api/auth/resend-verification   { email? }
 *     → re-issues a verification link for an unverified account. Always 200
 *       (never leaks account existence); rate limited 3 / 10 min per email.
 *       With an empty body, the authenticated session identifies the user
 *       (used by the post-checkout "verify your email" reminder card).
 *
 * Welcome email timing — first of these moments wins, exactly once:
 *   * the verification link is clicked, or
 *   * the FIRST successful login (users who never click the verify link
 *     still receive their confirmation + welcome email).
 *
 * Link origins — every emailed URL is built from resolvePublicOrigin()
 * (env NEXT_PUBLIC_APP_URL → request headers → localhost dev fallback) so
 * links never silently point at localhost on an unconfigured deploy.
 *
 * Security model (shared with password resets — same token table):
 *   * 32 random bytes emailed to the user, only the SHA-256 hash is stored.
 *   * Single use (used_at) + expiring (expires_at = +24h).
 *   * Resending invalidates previous unused links (latest link wins).
 */

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, execute } from "@/lib/db";
import { hit, clear, VERIFICATION_RESEND_RATE, rateLimitResponse } from "@/lib/rate-limit";
import { hashToken } from "../core/tokens";
import { getUserByEmail, writeAuditLog } from "../core/db";
import { requireAuth } from "../core/rbac";
import { sendPlatformEmail } from "@/lib/email";
import { resolvePublicOrigin } from "@/lib/public-origin";
import { renderEmailTemplate } from "@/lib/email-templates";
import type { User } from "../core/models";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Re-exported for dynamic-import call sites (auth.ts uses `await import()`
 * to keep this module out of the register/login hot path): resolves the
 * public origin from the live request so emailed links always point at the
 * domain the user is actually on.
 */
export { resolvePublicOrigin as resolvePublicOriginFor } from "@/lib/public-origin";

// ── Token helpers ─────────────────────────────────────────────────────────────

function newVerificationToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

/**
 * Issues a fresh verification token for the user. Any unused verification
 * token is invalidated first, so only the most recent emailed link works
 * (identical semantics to password-reset "latest link wins").
 */
export async function createEmailVerificationToken(userId: string, ip: string | null): Promise<string> {
  await execute(
    `UPDATE password_reset_tokens SET used_at = now()
      WHERE user_id = $1 AND purpose = 'email_verification' AND used_at IS NULL`,
    [userId]
  );
  const { raw, hash } = newVerificationToken();
  await execute(
    `INSERT INTO password_reset_tokens (user_id, token_hash, purpose, expires_at, request_ip, metadata)
     VALUES ($1, $2, 'email_verification', $3, $4, '{}'::jsonb)`,
    [userId, hash, new Date(Date.now() + VERIFY_TTL_MS).toISOString(), ip]
  );
  return raw;
}

/** Renders + fire-and-forget sends the verification email. Never throws. */
export async function sendVerificationEmail(
  user: Pick<User, "id" | "email" | "fullName">,
  ip: string | null,
  origin?: string
): Promise<boolean> {
  try {
    const raw = await createEmailVerificationToken(user.id, ip);
    const base = origin ?? resolvePublicOrigin();
    const link = `${base}/login/verify-email?token=${raw}`;
    const rendered = await renderEmailTemplate("email_verification", {
      userName: user.fullName,
      verifyUrl: link,
    });
    // rendered === null when a platform admin deactivated the template —
    // fall back to the welcome email so a brand-new account still gets
    // its onboarding message.
    if (!rendered) {
      console.log("[email-verification] email_verification template deactivated — trying welcome_email");
      await sendWelcomeEmail(user, origin);
      return false;
    }
    const result = await sendPlatformEmail({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
    });
    if (!result.sent) {
      console.error(
        "[email-verification] delivery failed:",
        result.error ?? "email provider did not accept the message",
      );
    }
    return result.sent;
  } catch (err) {
    console.error("[email-verification] could not queue verification email:", (err as Error).message);
    return false;
  }
}

/** Renders + fire-and-forget sends the welcome email. Never throws. */
export async function sendWelcomeEmail(
  user: Pick<User, "id" | "email" | "fullName">,
  origin?: string
): Promise<boolean> {
  try {
    const base = origin ?? resolvePublicOrigin();
    const rendered = await renderEmailTemplate("welcome_email", {
      userName: user.fullName,
      dashboardUrl: `${base}/dashboard`,
    });
    if (!rendered) {
      console.log("[email-verification] welcome_email template deactivated — email skipped");
      return false;
    }
    const result = await sendPlatformEmail({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
    });
    if (!result.sent) {
      console.error(
        "[email-verification] welcome delivery failed:",
        result.error ?? "email provider did not accept the message",
      );
    }
    return result.sent;
  } catch (err) {
    console.error("[email-verification] could not queue welcome email:", (err as Error).message);
    return false;
  }
}

/**
 * Exactly-once welcome email (migration 049).
 *
 * The welcome mail now fires at the FIRST of these moments:
 *   * the verification link is clicked, or
 *   * the first successful login (users who never click the verify link
 *     still get their onboarding + login-confirmation email).
 *
 * Atomically claims users.welcome_email_sent_at BEFORE sending, so two
 * concurrent logins — or a login racing the verify click — can never both
 * send. The claim is kept even when the template is deactivated by an
 * admin: that suppression is a deliberate platform choice, not a failure
 * to retry.
 */
export async function sendWelcomeEmailOnce(
  user: Pick<User, "id" | "email" | "fullName">,
  origin?: string
): Promise<boolean> {
  try {
    const claimed = await query<{ id: string }>(
      `UPDATE users SET welcome_email_sent_at = now(), updated_at = now()
        WHERE id = $1 AND welcome_email_sent_at IS NULL
        RETURNING id`,
      [user.id]
    );
    if (!claimed[0]) return false; // already welcomed — nothing to do
    return await sendWelcomeEmail(user, origin);
  } catch (err) {
    console.error("[email-verification] welcome-once claim failed:", (err as Error).message);
    return false;
  }
}

// ── POST /api/auth/verify-email ───────────────────────────────────────────────

export async function verifyEmailHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { token } = await req.json().catch(() => ({}) as { token?: string });
    const rawToken = (token ?? "").toString().trim();

    if (!rawToken) {
      return NextResponse.json(
        { error: "Verification token is required.", code: "INVALID_INPUT", status: 400 },
        { status: 400 }
      );
    }

    const rows = await query<{ id: string; user_id: string; email: string; full_name: string; email_verified: boolean }>(
      `SELECT t.id, t.user_id, u.email, u.full_name, u.email_verified
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1
          AND t.purpose = 'email_verification'
          AND t.used_at IS NULL
          AND t.expires_at > now()`,
      [hashToken(rawToken)]
    );
    const entry = rows[0];

    if (!entry) {
      return NextResponse.json(
        {
          error: "This verification link is invalid or has expired. Please sign in and request a new one.",
          code: "TOKEN_INVALID",
          status: 400,
        },
        { status: 400 }
      );
    }

    // Already verified (e.g. double click / resend + old link)? Token is
    // still consumed — reply success so the user isn't confused.
    await execute(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [entry.id]);

    if (entry.email_verified) {
      return NextResponse.json({ ok: true, alreadyVerified: true, email: entry.email });
    }

    await execute(
      `UPDATE users SET email_verified = TRUE, updated_at = now() WHERE id = $1`,
      [entry.user_id]
    );
    await writeAuditLog({
      userId: entry.user_id,
      action: "user.email_verified",
      resourceType: "user",
      resourceId: entry.user_id,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    // Registration confirmation + welcome in one message (fire-and-forget,
    // exactly-once — a login that already welcomed this user won't re-send).
    await sendWelcomeEmailOnce(
      { id: entry.user_id, email: entry.email, fullName: entry.full_name },
      resolvePublicOrigin(req)
    );

    return NextResponse.json({ ok: true, email: entry.email });
  } catch (err) {
    console.error("[POST /api/auth/verify-email]", err);
    return NextResponse.json(
      { error: "Verification failed due to an internal error. Please try again.", code: "INTERNAL_ERROR", status: 500 },
      { status: 500 }
    );
  }
}

// ── POST /api/auth/resend-verification ────────────────────────────────────────

export async function resendVerificationHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { email } = await req.json().catch(() => ({}) as { email?: string });
    let normalized = (email ?? "").toString().toLowerCase().trim();

    // Authenticated fallback: the post-checkout "resend verification" card
    // (and any logged-in surface) can call this without knowing the email —
    // the session already identifies the user. Verified accounts get the
    // same generic 200 below, so this never leaks verification state.
    if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      try {
        const auth = await requireAuth(req);
        normalized = auth.user.email.toLowerCase();
      } catch {
        normalized = "";
      }
    }

    // Always the same response — do not leak account existence.
    const okResponse = NextResponse.json({
      ok: true,
      message: "If that account is awaiting verification, a new link is on its way. Check your inbox (and spam folder).",
    });

    if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return okResponse;

    // Rate limit per email: 3 requests / 10 minutes.
    const bucket = `verify:resend:${normalized}`;
    const gate = hit(bucket, VERIFICATION_RESEND_RATE.limit, VERIFICATION_RESEND_RATE.windowMs);
    if (!gate.allowed) {
      const rl = rateLimitResponse(gate.retryAfterSec, "Too many verification requests. Please try again later.");
      return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
    }

    const user = await getUserByEmail(normalized);
    if (!user || user.status !== "active") { clear(bucket); return okResponse; }

    // Nothing to do for verified accounts — identical response either way.
    if (user.emailVerified) { clear(bucket); return okResponse; }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await sendVerificationEmail(user, ip, resolvePublicOrigin(req));

    return okResponse;
  } catch (err) {
    console.error("[POST /api/auth/resend-verification]", err);
    return NextResponse.json(
      { error: "Something went wrong — please try again.", code: "INTERNAL_ERROR", status: 500 },
      { status: 500 }
    );
  }
}
