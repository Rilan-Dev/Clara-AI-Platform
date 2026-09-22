/**
 * src/modules/auth/core/rbac.ts
 * RBAC middleware and permission-checking helpers.
 */

import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  getSessionWithUserByTokenHash,
  getKbAccessContext,
  getAgentAccessContext,
  getOrgAccessContext,
} from "./db";
import { hashToken, extractToken } from "./tokens";
import type { AuthContext, OrgMember, PermissionKey } from "./models";

export async function requireAuth(request: Request): Promise<AuthContext> {
  if (process.env.NODE_ENV !== "production" && process.env.SKIP_AUTH === "true") {
    const fakeUser = { id: "40000000-0000-0000-0000-000000000001", email: "admin@clara.local", fullName: "Platform Admin", isSuperAdmin: true, status: "active", avatarUrl: null, emailVerified: true, lastLoginAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const fakeSession = { id: "skip-auth", userId: "40000000-0000-0000-0000-000000000001", expiresAt: new Date(Date.now() + 86400000).toISOString(), ipAddress: null, userAgent: null, createdAt: new Date().toISOString() };
    return { user: fakeUser as unknown as AuthContext["user"], session: fakeSession as unknown as AuthContext["session"] };
  }

  await ensureMigrated();
  const token = extractToken(request);
  if (!token) throw NextResponse.json({ error: "Authentication required" }, { status: 401 });

  // Single JOIN round trip — the session→user pair previously cost two
  // sequential round trips on every authenticated request.
  const authPair = await getSessionWithUserByTokenHash(hashToken(token));
  if (!authPair) throw NextResponse.json({ error: "Session expired or invalid" }, { status: 401 });

  const user = authPair.user;
  if (user.status !== "active") throw NextResponse.json({ error: "Account is suspended" }, { status: 403 });
  await enforceOnboardingMutationGate(request, user.id, user.isSuperAdmin);
  return { user, session: authPair.session };
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

  // The auth JOIN already loaded email_verified — no extra query for it.
  // One round trip for both entitlement flags (previously two sequential
  // queries: email check + separate EXISTS probe).
  const row = await queryOne<{ email_verified: boolean; has_entitled_org: boolean; has_incomplete_org: boolean }>(
    `SELECT
       (SELECT u.email_verified FROM users u WHERE u.id = $1) AS email_verified,
       EXISTS (
         SELECT 1
           FROM org_members om
           JOIN org_subscriptions os ON os.org_id = om.org_id
           JOIN subscription_plans sp ON sp.id = os.plan_id
          WHERE om.user_id = $1
            AND os.status IN ('active','trialing')
            AND (sp.price_usd > 0 OR sp.enabled = TRUE)
       ) AS has_entitled_org,
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

  if (!row?.email_verified) {
    throw NextResponse.json(
      { error: "Verify your email before using Clara AI features.", code: "EMAIL_VERIFICATION_REQUIRED", status: 403 },
      { status: 403 },
    );
  }

  if (row?.has_incomplete_org && !row?.has_entitled_org) {
    throw NextResponse.json(
      {
        error: "Complete the remaining organization onboarding step before using Clara AI.",
        code: "ONBOARDING_INCOMPLETE",
        status: 402,
        nextAction: "OPEN_BILLING",
        reason: "PAYMENT_REQUIRED",
      },
      { status: 402 },
    );
  }

  if (!row?.has_entitled_org) {
    throw NextResponse.json(
      {
        error: "An active paid subscription is required to use Clara AI features.",
        code: "SUBSCRIPTION_REQUIRED",
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
  // Single round trip: org + membership + role permissions in one query.
  const [ctx] = await getOrgAccessContext(orgId, auth.user.id);
  if (!ctx || !ctx.membership) return false;
  return ctx.permissions.has(permission);
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
): Promise<{ orgId: string; membership: OrgMember; permissions: Set<PermissionKey> }> {
  requireTenantScope(auth);
  // Single round trip: kb → agent → org traversal, membership and role
  // permissions in one query (previously 3 sequential round trips). The
  // returned context lets handlers reuse orgId instead of re-fetching the KB
  // just to learn its org.
  const [ctx] = await getKbAccessContext(kbId, auth.user.id);
  if (!ctx) throw NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
  if (!ctx.membership || !ctx.permissions.has(permission)) {
    throw NextResponse.json(
      { error: `Forbidden — requires permission: ${permission}` },
      { status: 403 },
    );
  }
  return { orgId: ctx.orgId, membership: ctx.membership, permissions: ctx.permissions };
}

export async function requireAgentPermission(
  auth: AuthContext,
  agentId: string,
  permission: PermissionKey,
): Promise<{ orgId: string; membership: OrgMember; permissions: Set<PermissionKey> }> {
  requireTenantScope(auth);
  // Single round trip (previously 3 sequential round trips). The returned
  // context lets handlers reuse orgId instead of re-fetching the agent row.
  const [ctx] = await getAgentAccessContext(agentId, auth.user.id);
  if (!ctx) throw NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (!ctx.membership || !ctx.permissions.has(permission)) {
    throw NextResponse.json(
      { error: `Forbidden — requires permission: ${permission}` },
      { status: 403 },
    );
  }
  return { orgId: ctx.orgId, membership: ctx.membership, permissions: ctx.permissions };
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
