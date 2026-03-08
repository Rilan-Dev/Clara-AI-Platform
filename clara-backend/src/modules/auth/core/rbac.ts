/**
 * src/modules/auth/core/rbac.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * RBAC middleware and permission-checking helpers.
 *
 * Usage in route handlers:
 *
 *   const auth = await requireAuth(req);                // or throw 401
 *   await requireOrgPermission(auth, orgId, 'kb:create'); // or throw 403
 *   await requireKbPermission(auth, kbId, 'document:create');
 */

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  getSessionByTokenHash,
  getUserById,
  getOrgMembership,
  getPermissionsForRole,
  getOrgIdForKb,
  getOrgIdForProject,
} from "./db";
import { hashToken, extractToken } from "./tokens";
import type { AuthContext, PermissionKey } from "./models";

// ── Auth extraction ───────────────────────────────────────────────────────────

/**
 * Resolves the authenticated user from a request.
 * Returns AuthContext on success, throws NextResponse(401) on failure.
 */
export async function requireAuth(request: Request): Promise<AuthContext> {
  await ensureMigrated();

  const token = extractToken(request);
  if (!token) {
    throw NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const tokenHash = hashToken(token);
  const session = await getSessionByTokenHash(tokenHash);
  if (!session) {
    throw NextResponse.json({ error: "Session expired or invalid" }, { status: 401 });
  }

  const user = await getUserById(session.userId);
  if (!user) {
    throw NextResponse.json({ error: "User not found" }, { status: 401 });
  }
  if (user.status !== "active") {
    throw NextResponse.json({ error: "Account is suspended" }, { status: 403 });
  }

  return { user, session };
}

/**
 * Soft version — returns null instead of throwing on unauthenticated requests.
 * Useful for routes that have both public and protected behaviour.
 */
export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  try {
    return await requireAuth(request);
  } catch {
    return null;
  }
}

// ── Permission helpers ────────────────────────────────────────────────────────

/**
 * Check if a user has a specific permission within an organisation.
 * super_admins always pass.
 */
export async function hasOrgPermission(
  auth: AuthContext,
  orgId: string,
  permission: PermissionKey
): Promise<boolean> {
  if (auth.user.isSuperAdmin) return true;

  const membership = await getOrgMembership(orgId, auth.user.id);
  if (!membership) return false;

  const perms = await getPermissionsForRole(membership.roleId);
  return perms.has(permission);
}

/**
 * Require the user to have a permission within an org.
 * Throws NextResponse(403) if denied.
 */
export async function requireOrgPermission(
  auth: AuthContext,
  orgId: string,
  permission: PermissionKey
): Promise<void> {
  const allowed = await hasOrgPermission(auth, orgId, permission);
  if (!allowed) {
    throw NextResponse.json(
      { error: `Forbidden — requires permission: ${permission}` },
      { status: 403 }
    );
  }
}

/**
 * Require permission scoped to a knowledge base.
 * Resolves orgId automatically from kbId.
 */
export async function requireKbPermission(
  auth: AuthContext,
  kbId: string,
  permission: PermissionKey
): Promise<void> {
  const orgId = await getOrgIdForKb(kbId);
  if (!orgId) {
    throw NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
  }
  await requireOrgPermission(auth, orgId, permission);
}

/**
 * Require permission scoped to a project.
 */
export async function requireProjectPermission(
  auth: AuthContext,
  projectId: string,
  permission: PermissionKey
): Promise<void> {
  const orgId = await getOrgIdForProject(projectId);
  if (!orgId) {
    throw NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  await requireOrgPermission(auth, orgId, permission);
}

/**
 * Require the authenticated user to be a super_admin.
 */
export async function requireSuperAdmin(auth: AuthContext): Promise<void> {
  if (!auth.user.isSuperAdmin) {
    throw NextResponse.json(
      { error: "Forbidden — super admin access required" },
      { status: 403 }
    );
  }
}

// ── Convenience wrapper ───────────────────────────────────────────────────────

/**
 * Wraps a handler so RBAC errors (thrown NextResponses) are caught
 * and returned properly.
 *
 * Usage:
 *   export const POST = withAuth(async (req) => { ... });
 */
export function withAuth<T extends unknown[]>(
  handler: (req: Request, ...args: T) => Promise<NextResponse>
) {
  return async (req: Request, ...args: T): Promise<NextResponse> => {
    try {
      return await handler(req, ...args);
    } catch (err) {
      if (err instanceof NextResponse) return err;
      console.error("[rbac] unhandled error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
