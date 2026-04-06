/**
 * src/modules/auth/api/auth.ts
 * Route handlers: register (user-only + org-level), login, logout, me, sessions, org members.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  createUser, getUserByEmail, getUserById,
  createSession, deleteSession, deleteAllUserSessions,
  getSessionByTokenHash, addOrgMember, listOrgMembers,
  removeOrgMember, writeAuditLog, touchLastLogin, updateUser,
} from "../core/db";
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

        // 6. Subscription (14-day trial)
        await client.query(
          `INSERT INTO org_subscriptions
             (org_id, plan_id, status, current_period_start, current_period_end)
           VALUES ($1,$2,'trialing',now(), now() + INTERVAL '14 days')
           ON CONFLICT (org_id) DO NOTHING`,
          [orgRow.id, resolvedPlanId]
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
    console.error("[auth] register:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

export async function loginHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const body = await req.json();
    const { email, password } = body ?? {};
    if (!email || !password)
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });

    const userWithHash = await getUserByEmail(email);
    if (!userWithHash) {
      await hashPassword("dummy-anti-timing-run");
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (!await verifyPassword(password, userWithHash.passwordHash))
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    if (userWithHash.status === "suspended")
      return NextResponse.json({ error: "Account is suspended" }, { status: 403 });

    const token   = generateToken();
    const expires = sessionExpiresAt();
    await createSession(userWithHash.id, hashToken(token), expires, getIp(req), req.headers.get("user-agent") ?? undefined);
    await touchLastLogin(userWithHash.id);
    await writeAuditLog({ userId: userWithHash.id, action: "user.login", resourceType: "user", resourceId: userWithHash.id, ipAddress: getIp(req) });

    const user = {
      ...userWithHash,
      passwordHash: undefined,
    };
    delete user.passwordHash;
    const res = NextResponse.json({ user, token });
    res.headers.set("Set-Cookie", buildSetCookieHeader(token, expires));
    return res;
  } catch (err) {
    console.error("[auth] login:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
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
    const { userId, role } = body ?? {};
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    const validRoles: RoleName[] = ["org_admin", "project_manager", "kb_editor", "kb_viewer"];
    if (!role || !validRoles.includes(role))
      return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });

    const target = await getUserById(userId);
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const member = await addOrgMember(orgId, userId, role as RoleName, auth.user.id);
    await writeAuditLog({ userId: auth.user.id, orgId, action: "org.invite_member", resourceType: "user", resourceId: userId, newData: { role }, ipAddress: getIp(req) });
    return NextResponse.json(member, { status: 201 });
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
