/**
 * src/modules/auth/api/auth.ts
 * Route handlers: register (user-only + org-level), login, logout, me, sessions, org members.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  createUser, getUserByEmail, getUserById,
  createSession, deleteSession, deleteAllUserSessions,
  getSessionByTokenHash, addOrgMember, listOrgMembers,
  removeOrgMember, writeAuditLog, touchLastLogin, updateUser,
  recordFailedLogin, recordSuccessfulLogin, LOGIN_MAX_FAILURES,
} from "../core/db";
import { hit, clear, LOGIN_RATE, rateLimitResponse } from "@/lib/rate-limit";
import { hashPassword, verifyPassword } from "../core/password";
import {
  generateToken, hashToken, sessionExpiresAt,
  buildSetCookieHeader, buildClearCookieHeader, extractToken,
} from "../core/tokens";
import { requireAuth, requireOrgPermission } from "../core/rbac";
import { withTransaction, queryOne } from "@/lib/db";
import type { RoleName } from "../core/models";

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip") ?? "unknown";
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Mode 1 (user-only):  { email, password, fullName }
// Mode 2 (org-level):  { email, password, fullName, orgName, planId? }

export async function registerHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const body = await req.json();
    const { email, password, fullName, orgName, planId } = body ?? {};

    if (!email?.trim())    return NextResponse.json({ error: "email is required" }, { status: 400 });
    if (!password)         return NextResponse.json({ error: "password is required" }, { status: 400 });
    if (!fullName?.trim()) return NextResponse.json({ error: "fullName is required" }, { status: 400 });
    if (password.length < 8)
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

    const existing = await getUserByEmail(email);
    if (existing)
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });

    const passwordHash = await hashPassword(password);

    // ── Org-level signup ──────────────────────────────────────────────────────
    if (orgName?.trim()) {
      if (!orgName.trim() || orgName.trim().length < 2)
        return NextResponse.json({ error: "Organisation name must be at least 2 characters" }, { status: 400 });

      const resolvedPlanId = (planId && ["free","starter","pro"].includes(planId)) ? planId : "free";
      const plan = await queryOne("SELECT id FROM subscription_plans WHERE id = $1", [resolvedPlanId]);
      if (!plan) return NextResponse.json({ error: "Invalid plan selected" }, { status: 400 });

      const result = await withTransaction(async (client) => {
        // 1. User
        const uRows = await client.query(
          `INSERT INTO users (email, password_hash, full_name, status, email_verified)
           VALUES ($1,$2,$3,'active',FALSE) RETURNING *`,
          [email.toLowerCase().trim(), passwordHash, fullName.trim()]
        );
        const userRow = uRows.rows[0]!;

        // 2. Org (unique slug)
        const slugBase = orgName.trim().toLowerCase()
          .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "org";
        let slug = slugBase; let n = 2;
        while ((await client.query("SELECT id FROM organisations WHERE slug=$1",[slug])).rows.length > 0)
          slug = `${slugBase}-${n++}`;

        const oRows = await client.query(
          `INSERT INTO organisations (name, slug) VALUES ($1,$2) RETURNING *`,
          [orgName.trim(), slug]
        );
        const orgRow = oRows.rows[0]!;

        // 3. Org AI settings
        await client.query(
          `INSERT INTO org_ai_settings (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING`,
          [orgRow.id]
        );

        // 4. Role lookup
        const roleRow = (await client.query("SELECT id FROM roles WHERE name='org_admin'")).rows[0];
        if (!roleRow) throw new Error("org_admin role not found — run migrations first");

        // 5. Org member
        await client.query(
          `INSERT INTO org_members (org_id, user_id, role_id)
           VALUES ($1,$2,$3) ON CONFLICT (org_id, user_id) DO NOTHING`,
          [orgRow.id, userRow.id, roleRow.id]
        );

        // 6. Subscription — starts active on the chosen plan immediately.
        // No automatic free trial; platform admins can grant trial extensions
        // manually from Subscriptions management if needed.
        const planVersionRows = await client.query<Record<string, unknown>>(
          `
          SELECT sp.id AS plan_id, pv.id AS plan_version_id, COALESCE(pv.version, 1) AS version,
                 COALESCE(pv.name, sp.name) AS name, COALESCE(pv.description, sp.description) AS description,
                 COALESCE(pv.price_usd, sp.price_usd) AS price_usd, COALESCE(pv.max_kbs, sp.max_kbs) AS max_kbs,
                 COALESCE(pv.max_docs_per_kb, sp.max_docs_per_kb) AS max_docs_per_kb,
                 COALESCE(pv.max_req_day, sp.max_req_day) AS max_req_day,
                 COALESCE(pv.max_storage_mb, sp.max_storage_mb) AS max_storage_mb,
                 COALESCE(pv.voice_enabled, sp.voice_enabled) AS voice_enabled,
                 COALESCE(pv.api_access, sp.api_access) AS api_access,
                 COALESCE(pv.custom_branding, sp.custom_branding) AS custom_branding,
                 COALESCE(pv.sso_enabled, sp.sso_enabled) AS sso_enabled,
                 COALESCE(pv.analytics_level, sp.analytics_level) AS analytics_level,
                 COALESCE(pv.priority_support, sp.priority_support) AS priority_support,
                 COALESCE(pv.features, sp.features) AS features
          FROM subscription_plans sp
          LEFT JOIN LATERAL (
            SELECT * FROM subscription_plan_versions
            WHERE plan_id = sp.id AND status = 'published'
            ORDER BY version DESC LIMIT 1
          ) pv ON TRUE
          WHERE sp.id = $1
          `,
          [resolvedPlanId],
        );
        const planData = planVersionRows.rows[0]!;
        const snapshot = {
          planId: resolvedPlanId,
          version: planData.version,
          name: planData.name,
          description: planData.description,
          priceUsd: planData.price_usd,
          maxKbs: planData.max_kbs,
          maxDocsPerKb: planData.max_docs_per_kb,
          maxReqDay: planData.max_req_day,
          maxStorageMb: planData.max_storage_mb,
          voiceEnabled: planData.voice_enabled,
          apiAccess: planData.api_access,
          customBranding: planData.custom_branding,
          ssoEnabled: planData.sso_enabled,
          analyticsLevel: planData.analytics_level,
          prioritySupport: planData.priority_support,
          features: planData.features,
        };
        await client.query(
          `INSERT INTO org_subscriptions
             (org_id, plan_id, plan_version_id, plan_snapshot, price_snapshot, status, current_period_start, current_period_end)
           VALUES ($1,$2,$3,$4::jsonb,$5,'active',now(), now() + INTERVAL '1 month')
           ON CONFLICT (org_id) DO NOTHING`,
          [orgRow.id, resolvedPlanId, planData.plan_version_id ?? null, JSON.stringify(snapshot), planData.price_usd]
        );

        return { userRow, orgRow };
      });

      const token = generateToken();
      await createSession(result.userRow.id, hashToken(token), sessionExpiresAt(), getIp(req), req.headers.get("user-agent") ?? undefined);
      await writeAuditLog({ userId: result.userRow.id, orgId: result.orgRow.id, action: "user.register_org", resourceType: "organisation", resourceId: result.orgRow.id, newData: { planId: resolvedPlanId }, ipAddress: getIp(req) });

      const res = NextResponse.json({
        user: { id: result.userRow.id, email: result.userRow.email, fullName: result.userRow.full_name, emailVerified: false },
        org:  { id: result.orgRow.id, name: result.orgRow.name, slug: result.orgRow.slug },
        planId: resolvedPlanId, token,
      }, { status: 201 });
      res.headers.set("Set-Cookie", buildSetCookieHeader(token, sessionExpiresAt()));
      return res;
    }

    // ── User-only signup ──────────────────────────────────────────────────────
    const user    = await createUser(email, passwordHash, fullName, body?.avatarUrl);
    const token   = generateToken();
    const expires = sessionExpiresAt();
    await createSession(user.id, hashToken(token), expires, getIp(req), req.headers.get("user-agent") ?? undefined);
    await writeAuditLog({ userId: user.id, action: "user.register", resourceType: "user", resourceId: user.id, ipAddress: getIp(req) });

    const res = NextResponse.json({ user, token }, { status: 201 });
    res.headers.set("Set-Cookie", buildSetCookieHeader(token, expires));
    return res;
  } catch (err) {
    // Phase 6.3: never leak raw internals — log server-side, return a generic 500.
    console.error("[auth] register:", err);
    return NextResponse.json(
      { error: "Registration failed due to an internal error. Please try again.", code: "INTERNAL_ERROR", status: 500 },
      { status: 500 }
    );
  }
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3, "email is required").email("Invalid email address"),
  password: z.string().min(1, "password is required"),
});

export async function loginHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // ── Phase 6.1: IP-scoped failed-login rate limit (5 failures / 15 min) ──
    // Every attempt passes the gate (cheap DoS cap on the bcrypt endpoint);
    // the bucket is cleared on SUCCESS, so only failures accumulate —
    // brute-force protection without penalising repeated sign-ins.
    const ip = getIp(req);
    const failBucket = `login:fail:ip:${ip}`;
    const gate = hit(failBucket, LOGIN_RATE.limit, LOGIN_RATE.windowMs);
    if (!gate.allowed) {
      const rl = rateLimitResponse(gate.retryAfterSec, "Too many failed login attempts. Please try again later.");
      return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
    }

    // ── Phase 6.1: Zod input validation ──────────────────────────────────────
    const parsed = loginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body", code: "INVALID_INPUT", status: 400 },
        { status: 400 }
      );
    }
    const { email, password } = parsed.data;

    const userWithHash = await getUserByEmail(email);
    if (!userWithHash) {
      await hashPassword("dummy-anti-timing-run");
      // Unknown email still counts as a failed attempt from this IP — do NOT
      // clear the bucket, otherwise alternating real/unknown emails would
      // reset the brute-force counter.
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // ── Phase 6.1: account lockout (10 consecutive failures → 30 min lock) ──
    if (userWithHash.lockedUntil && new Date(userWithHash.lockedUntil).getTime() > Date.now()) {
      const retryAfterSec = Math.max(1, Math.ceil((new Date(userWithHash.lockedUntil).getTime() - Date.now()) / 1000));
      return NextResponse.json(
        {
          error: `Account temporarily locked after repeated failed login attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s) or contact an administrator.`,
          code: "ACCOUNT_LOCKED",
          status: 403,
          retryAfter: retryAfterSec,
        },
        { status: 403, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    if (!await verifyPassword(password, userWithHash.passwordHash)) {
      const { failures, lockedUntil } = await recordFailedLogin(userWithHash.id);
      if (failures >= LOGIN_MAX_FAILURES && lockedUntil) {
        await writeAuditLog({
          userId: userWithHash.id, action: "auth.account_locked",
          resourceType: "user", resourceId: userWithHash.id,
          newData: { failures, lockedUntil }, ipAddress: ip,
        });
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (userWithHash.status === "suspended")
      return NextResponse.json({ error: "Account is suspended" }, { status: 403 });

    // Success — reset both the IP failure bucket and the account counter.
    clear(failBucket);
    await recordSuccessfulLogin(userWithHash.id);

    const token   = generateToken();
    const expires = sessionExpiresAt();
    await createSession(userWithHash.id, hashToken(token), expires, ip, req.headers.get("user-agent") ?? undefined);
    await touchLastLogin(userWithHash.id);
    await writeAuditLog({ userId: userWithHash.id, action: "user.login", resourceType: "user", resourceId: userWithHash.id, ipAddress: ip });

    const user = {
      ...userWithHash,
      passwordHash: undefined,
      failedLoginAttempts: undefined,
      lockedUntil: undefined,
    };
    delete user.passwordHash;
    delete (user as Record<string, unknown>).failedLoginAttempts;
    delete (user as Record<string, unknown>).lockedUntil;
    const res = NextResponse.json({ user, token });
    res.headers.set("Set-Cookie", buildSetCookieHeader(token, expires));
    return res;
  } catch (err) {
    // Phase 6.3: never leak raw internals — log server-side, return a generic 500.
    console.error("[auth] login:", err);
    return NextResponse.json(
      { error: "Login failed due to an internal error. Please try again.", code: "INTERNAL_ERROR", status: 500 },
      { status: 500 }
    );
  }
}

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

export async function logoutHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const token = extractToken(req);
    if (token) {
      const session = await getSessionByTokenHash(hashToken(token));
      if (session) await deleteSession(session.id);
    }
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", buildClearCookieHeader());
    return res;
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── PATCH /api/auth/me ────────────────────────────────────────────────────────

export async function updateMeHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    const body = await req.json() as { fullName?: string; avatarUrl?: string | null };
    if (body.fullName !== undefined && !body.fullName.trim())
      return NextResponse.json({ error: "fullName cannot be empty" }, { status: 400 });
    // Skip DB write when using the skip-auth fake user (no real user row exists)
    const isSkipAuthUser = auth.user.id === "00000000-0000-0000-0000-000000000000";
    const updated = isSkipAuthUser
      ? { ...auth.user, ...(body.fullName ? { fullName: body.fullName.trim() } : {}), ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}) }
      : await updateUser(auth.user.id, { fullName: body.fullName?.trim(), avatarUrl: body.avatarUrl });
    if (!isSkipAuthUser) {
      await writeAuditLog({ userId: auth.user.id, action: "user.update_profile", resourceType: "user", resourceId: auth.user.id, newData: body, ipAddress: getIp(req) });
    }
    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

export async function meHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    return NextResponse.json({ user: auth.user, session: { id: auth.session.id, expiresAt: auth.session.expiresAt } });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── DELETE /api/auth/sessions ─────────────────────────────────────────────────

export async function logoutAllHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await deleteAllUserSessions(auth.user.id);
    const res = NextResponse.json({ success: true });
    res.headers.set("Set-Cookie", buildClearCookieHeader());
    return res;
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST /api/orgs/:orgId/members ─────────────────────────────────────────────

export async function inviteOrgMemberHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "user:invite");
    const body = await req.json();
    const { userId, email, role } = body ?? {};

    const validRoles: RoleName[] = ["org_admin", "project_manager", "kb_editor", "kb_viewer"];
    if (!role || !validRoles.includes(role))
      return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });

    // Resolve the target: by id OR by email. Email invitations create the
    // account on the spot (random password) and email a set-password link —
    // the standard "invite anyone with an email" business flow.
    let target = userId ? await getUserById(userId) : null;
    let isNewUser = false;
    let inviteToken: string | null = null;

    if (!target) {
      const normalizedEmail = (email ?? "").toString().toLowerCase().trim();
      if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
        return NextResponse.json({ error: "userId or a valid email is required" }, { status: 400 });
      }
      target = await getUserByEmail(normalizedEmail);
      if (!target) {
        const tempPassword = randomBytes(12).toString("base64url");
        const fullName = normalizedEmail.split("@")[0]!.replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        const { hashPassword } = await import("../core/password");
        target = await createUser(normalizedEmail, await hashPassword(tempPassword), fullName);
        isNewUser = true;
      }
    }

    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const member = await addOrgMember(orgId, target.id, role as RoleName, auth.user.id);

    // ── Invitation email ─────────────────────────────────────────────────────
    // New users get a set-password link (14-day token); existing users simply
    // get told they now have access.
    let emailSent = false;
    try {
      const org = await queryOne<{ name: string; slug: string }>(
        "SELECT name, slug FROM organisations WHERE id = $1", [orgId]
      );
      const orgName = org?.name ?? "your organisation";
      const { sendPlatformEmail, appUrl } = await import("@/lib/email");
      const { renderEmailTemplate } = await import("@/lib/email-templates");

      if (isNewUser) {
        const { createInvitationToken } = await import("./password-reset");
        inviteToken = await createInvitationToken(target.id, orgId, orgName);
        const link = appUrl(`/login/reset?token=${inviteToken}`);
        const rendered = await renderEmailTemplate("org_invitation_new_user", {
          userName: target.fullName,
          orgName,
          role: role.replace("_", " "),
          inviteUrl: link,
        });
        // rendered === null when a platform admin deactivated the template.
        if (rendered) {
          await sendPlatformEmail({
            to: target.email,
            subject: rendered.subject,
            html: rendered.html,
          });
          emailSent = true;
        } else {
          console.log("[invite-member] org_invitation_new_user template deactivated — email skipped");
        }
      } else {
        const rendered = await renderEmailTemplate("org_invitation_existing_user", {
          userName: target.fullName,
          orgName,
          role: role.replace("_", " "),
          loginUrl: appUrl("/login"),
        });
        if (rendered) {
          await sendPlatformEmail({
            to: target.email,
            subject: rendered.subject,
            html: rendered.html,
          });
          emailSent = true;
        } else {
          console.log("[invite-member] org_invitation_existing_user template deactivated — email skipped");
        }
      }
    } catch (mailErr) {
      console.error("[invite-member] invitation email failed:", (mailErr as Error).message);
    }

    await writeAuditLog({ userId: auth.user.id, orgId, action: "org.invite_member", resourceType: "user", resourceId: target.id, newData: { role, email: target.email }, ipAddress: getIp(req) });
    return NextResponse.json({ ...member, invited: true, isNewUser, emailSent }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── GET /api/orgs/:orgId/members ──────────────────────────────────────────────

export async function listOrgMembersHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "user:read");
    return NextResponse.json(await listOrgMembers(orgId));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── DELETE /api/orgs/:orgId/members/:userId ───────────────────────────────────

export async function removeOrgMemberHandler(req: NextRequest, orgId: string, userId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "user:remove");
    if (!await removeOrgMember(orgId, userId))
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    await writeAuditLog({ userId: auth.user.id, orgId, action: "org.remove_member", resourceType: "user", resourceId: userId, ipAddress: getIp(req) });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── PATCH /api/orgs/:orgId/members/:userId — change a member's role ──────────

export async function updateOrgMemberRoleHandler(
  req: NextRequest, orgId: string, userId: string
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "user:invite"); // same privilege tier as inviting
    const { role } = await req.json() as { role?: RoleName };

    const validRoles: RoleName[] = ["org_admin", "project_manager", "kb_editor", "kb_viewer"];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }

    const { query } = await import("@/lib/db");
    const { getRoleByName } = await import("../core/db");
    const roleRow = await getRoleByName(role);
    if (!roleRow) return NextResponse.json({ error: `Role "${role}" not found` }, { status: 400 });

    const rows = await query(
      `UPDATE org_members SET role_id = $1 WHERE org_id = $2 AND user_id = $3
       RETURNING id`,
      [roleRow.id, orgId, userId]
    );
    if (!rows[0]) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    await writeAuditLog({
      userId: auth.user.id, orgId, action: "org.update_member_role",
      resourceType: "user", resourceId: userId, newData: { role }, ipAddress: getIp(req),
    });
    return NextResponse.json({ ok: true, role });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
