/**
 * src/modules/auth/core/rbac.ts
 * RBAC middleware and permission-checking helpers.
 */

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  getSessionByTokenHash,
  getUserById,
  getOrgMembership,
  getPermissionsForRole,
  getOrgIdForKb,
  getOrgIdForAgent,
} from "./db";
import { hashToken, extractToken } from "./tokens";
import type { AuthContext, PermissionKey } from "./models";

export async function requireAuth(request: Request): Promise<AuthContext> {
  if (process.env.SKIP_AUTH === "true") {
    const fakeUser = { id: "40000000-0000-0000-0000-000000000001", email: "admin@clara.local", fullName: "Platform Admin", isSuperAdmin: true, status: "active", avatarUrl: null, emailVerified: true, lastLoginAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const fakeSession = { id: "skip-auth", userId: "40000000-0000-0000-0000-000000000001", expiresAt: new Date(Date.now() + 86400000).toISOString(), ipAddress: null, userAgent: null, createdAt: new Date().toISOString() };
    return { user: fakeUser as unknown as AuthContext["user"], session: fakeSession as unknown as AuthContext["session"] };
  }

  await ensureMigrated();
  const token = extractToken(request);
  if (!token) throw NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const session = await getSessionByTokenHash(hashToken(token));
  if (!session) throw NextResponse.json({ error: "Session expired or invalid" }, { status: 401 });

  const user = await getUserById(session.userId);
  if (!user) throw NextResponse.json({ error: "User not found" }, { status: 401 });
  if (user.status !== "active") throw NextResponse.json({ error: "Account is suspended" }, { status: 403 });
  await enforceOnboardingMutationGate(request, user.id, user.isSuperAdmin);
  return { user, session };
}

const ONBOARDING_MUTATION_ALLOWLIST = [
  "/api/auth/",
  "/api/subscriptions/",
  "/api/webhooks/",
  "/api/cron/",
  "/api/health",
] as const;

function isOnboardingAllowedMutation(pathname: string): boolean {
  return ONBOARDING_MUTATION_ALLOWLIST.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/**
 * Fail closed for incomplete paid onboarding. This runs at the authentication
 * boundary so feature mutation routes cannot accidentally bypass the gate.
 * Billing/auth/recovery endpoints stay available so the user can complete
 * onboarding. Existing organizations with at least one active subscription
 * are not blocked globally; org-specific APIs still enforce membership.
 */
async function enforceOnboardingMutationGate(request: Request, userId: string, isSuperAdmin: boolean): Promise<void> {
  if (isSuperAdmin || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;

  const pathname = new URL(request.url).pathname;
  if (isOnboardingAllowedMutation(pathname)) return;

  const row = await queryOne<{ has_active_org: boolean; has_incomplete_org: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1
           FROM org_members om
           JOIN org_subscriptions os ON os.org_id = om.org_id
          WHERE om.user_id = $1 AND os.status IN ('active','trialing')
       ) AS has_active_org,
       EXISTS (
         SELECT 1
           FROM org_members om
           JOIN org_subscriptions os ON os.org_id = om.org_id
           JOIN subscription_plans sp ON sp.id = os.plan_id
          WHERE om.user_id = $1
            AND sp.price_usd > 0
            AND os.status IN ('pending_email','payment_required','payment_pending','payment_failed','payment_cancelled','payment_review','past_due')
       ) AS has_incomplete_org`,
    [userId],
  );

  if (!row?.has_active_org && row?.has_incomplete_org) {
    throw NextResponse.json(
      {
        error: "Complete email verification and payment before using Clara AI.",
        code: "ONBOARDING_INCOMPLETE",
        status: 402,
      },
      { status: 402 },
    );
  }
}

export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  try { return await requireAuth(request); } catch { return null; }
}

/**
 * Tenant isolation boundary. Platform admins manage the SaaS platform itself,
 * not tenant agents, KBs, documents, members, or tenant AI configuration.
 */
export function requireTenantScope(auth: AuthContext): void {
  if (auth.user.isSuperAdmin) {
    throw NextResponse.json(
      { error: "Platform admins cannot access tenant resources" },
      { status: 403 },
    );
  }
}

export async function hasOrgPermission(
  auth: AuthContext,
  orgId: string,
  permission: PermissionKey,
): Promise<boolean> {
  if (auth.user.isSuperAdmin) return false;
  const membership = await getOrgMembership(orgId, auth.user.id);
  if (!membership) return false;
  const perms = await getPermissionsForRole(membership.roleId);
  return perms.has(permission);
}

export async function requireOrgPermission(
  auth: AuthContext,
  orgId: string,
  permission: PermissionKey,
): Promise<void> {
  requireTenantScope(auth);
  if (!(await hasOrgPermission(auth, orgId, permission))) {
    throw NextResponse.json(
      { error: `Forbidden — requires permission: ${permission}` },
      { status: 403 },
    );
  }
}

export async function requireKbPermission(
  auth: AuthContext,
  kbId: string,
  permission: PermissionKey,
): Promise<void> {
  requireTenantScope(auth);
  const orgId = await getOrgIdForKb(kbId);
  if (!orgId) throw NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
  await requireOrgPermission(auth, orgId, permission);
}

export async function requireAgentPermission(
  auth: AuthContext,
  agentId: string,
  permission: PermissionKey,
): Promise<void> {
  requireTenantScope(auth);
  const orgId = await getOrgIdForAgent(agentId);
  if (!orgId) throw NextResponse.json({ error: "Agent not found" }, { status: 404 });
  await requireOrgPermission(auth, orgId, permission);
}

export async function requireSuperAdmin(auth: AuthContext): Promise<void> {
  if (!auth.user.isSuperAdmin) {
    throw NextResponse.json({ error: "Forbidden — super admin access required" }, { status: 403 });
  }
}

export function withAuth<T extends unknown[]>(
  handler: (req: Request, ...args: T) => Promise<NextResponse>,
) {
  return async (req: Request, ...args: T): Promise<NextResponse> => {
    try { return await handler(req, ...args); }
    catch (err) {
      if (err instanceof NextResponse) return err;
      console.error("[rbac] unhandled error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
