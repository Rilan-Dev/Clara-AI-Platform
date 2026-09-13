/**
 * src/modules/auth/api/password-reset.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-service credential flows:
 *
 *   POST /api/auth/forgot-password  { email }
 *     → emails a single-use reset link (1h expiry). Always 200 — never leaks
 *       whether an account exists.
 *
 *   POST /api/auth/reset-password   { token, password }
 *     → sets the new password, marks the token used, revokes ALL sessions.
 *
 *   POST /api/auth/change-password  { currentPassword, newPassword }   (authed)
 *     → verifies the current password, updates, revokes every OTHER session.
 */

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query, execute } from "@/lib/db";
import { requireAuth } from "../core/rbac";
import { hashToken } from "../core/tokens";
import { hashPassword, verifyPassword } from "../core/password";
import { getUserByEmail, deleteAllUserSessions } from "../core/db";
import { sendPlatformEmail, appUrl } from "@/lib/email";
import { renderEmailTemplate } from "@/lib/email-templates";

const RESET_TTL_MS   = 60 * 60 * 1000;        // 1 hour
const INVITE_TTL_MS  = 14 * 24 * 60 * 60 * 1000; // 14 days
const MIN_PASSWORD   = 8;

// ── Shared token helpers ──────────────────────────────────────────────────────

function newResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

async function insertResetToken(
  userId: string,
  purpose: "password_reset" | "org_invitation",
  ttlMs: number,
  ip: string | null,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const { raw, hash } = newResetToken();
  await execute(
    `INSERT INTO password_reset_tokens (user_id, token_hash, purpose, expires_at, request_ip, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [userId, hash, purpose, new Date(Date.now() + ttlMs).toISOString(), ip, JSON.stringify(metadata)]
  );
  return raw;
}

export async function createInvitationToken(
  userId: string,
  orgId: string,
  orgName: string,
): Promise<string> {
  return insertResetToken(userId, "org_invitation", INVITE_TTL_MS, null, { orgId, orgName });
}

function getIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

// ── POST /api/auth/forgot-password ────────────────────────────────────────────

export async function forgotPasswordHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { email } = await req.json().catch(() => ({}) as { email?: string });
    const normalized = (email ?? "").toString().toLowerCase().trim();

    // Always the same response — do not leak account existence.
    const okResponse = NextResponse.json({
      ok: true,
      message: "If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).",
    });

    if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return okResponse;

    const user = await getUserByEmail(normalized);
    if (!user || user.status !== "active") return okResponse;

    // Invalidate previous unused reset tokens for this user (latest link wins).
    await execute(
      `UPDATE password_reset_tokens SET used_at = now()
       WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL`,
      [user.id]
    );

    const raw = await insertResetToken(user.id, "password_reset", RESET_TTL_MS, getIp(req));

    const link = appUrl(`/login/reset?token=${raw}`);
    const rendered = await renderEmailTemplate("password_reset", {
      userName: user.fullName,
      resetUrl: link,
    });

    // Fire-and-forget — the response must not depend on email delivery.
    sendPlatformEmail({ to: user.email, subject: rendered.subject, html: rendered.html }).catch((e) =>
      console.error("[forgot-password] email failed:", (e as Error).message)
    );

    return okResponse;
  } catch (err) {
    console.error("[POST /api/auth/forgot-password]", err);
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}

// ── POST /api/auth/reset-password ─────────────────────────────────────────────

export async function resetPasswordHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { token, password } = await req.json().catch(() => ({}) as { token?: string; password?: string });
    const rawToken = (token ?? "").toString().trim();
    const newPassword = (password ?? "").toString();

    if (!rawToken) return NextResponse.json({ error: "Reset token is required." }, { status: 400 });
    if (newPassword.length < MIN_PASSWORD) {
      return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 });
    }

    const row = await query<{ id: string; user_id: string; email: string; full_name: string }>(
      `SELECT t.id, t.user_id, u.email, u.full_name
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1
          AND t.used_at IS NULL
          AND t.expires_at > now()`,
      [hashToken(rawToken)]
    );

    const entry = row[0];
    if (!entry) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await execute(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
      passwordHash,
      entry.user_id,
    ]);

    // Single-use token + revoke every active session (force re-login everywhere).
    await execute(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [entry.id]);
    await deleteAllUserSessions(entry.user_id);

    const rendered = await renderEmailTemplate("password_changed", {
      userName: entry.full_name,
      loginUrl: appUrl("/login"),
    });
    sendPlatformEmail({ to: entry.email, subject: rendered.subject, html: rendered.html }).catch(() => {});

    return NextResponse.json({ ok: true, message: "Password updated — you can now sign in with your new password." });
  } catch (err) {
    console.error("[POST /api/auth/reset-password]", err);
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}

// ── POST /api/auth/change-password (authenticated) ────────────────────────────

export async function changePasswordHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    const { currentPassword, newPassword } = await req.json().catch(
      () => ({}) as { currentPassword?: string; newPassword?: string }
    );

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return NextResponse.json({ error: "currentPassword and newPassword are required." }, { status: 400 });
    }
    if (newPassword.length < MIN_PASSWORD) {
      return NextResponse.json({ error: `New password must be at least ${MIN_PASSWORD} characters.` }, { status: 400 });
    }

    const user = await getUserByEmail(auth.user.email);
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    if (!await verifyPassword(currentPassword, user.passwordHash)) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    await execute(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
      passwordHash,
      auth.user.id,
    ]);

    // Revoke every session except the one making this request.
    await execute(`DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, [
      auth.user.id,
      auth.session.id,
    ]);

    const rendered = await renderEmailTemplate("password_changed", {
      userName: auth.user.fullName,
      loginUrl: appUrl("/login"),
    });
    sendPlatformEmail({ to: auth.user.email, subject: rendered.subject, html: rendered.html }).catch(() => {});

    return NextResponse.json({ ok: true, message: "Password changed successfully." });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[POST /api/auth/change-password]", err);
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}
