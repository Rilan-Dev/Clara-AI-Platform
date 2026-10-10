import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-contract";

/**
 * Demo session resolver. In production this is NextAuth; here the active
 * identity is passed via the `x-user-id` header (or defaults to the first
 * org admin). The important part for Phase 1 is the enforcement that follows:
 * org members can only ever see their own organisation's rows.
 */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  orgId: string | null;
};

export async function getUser(req: Request): Promise<SessionUser> {
  const headerId = req.headers.get("x-user-id");
  let user = headerId
    ? await db.user.findUnique({ where: { id: headerId } })
    : null;
  if (!user) {
    // fall back to the seeded org admin of the first non-enterprise org
    user = await db.user.findFirst({
      where: { role: "org_admin", orgId: { not: null } },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!user) throw new ApiError(401, "NO_SESSION", "No user identity found.");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
  };
}

export async function requireOrgUser(req: Request) {
  const user = await getUser(req);
  if (!user.orgId) {
    throw new ApiError(
      403,
      "NO_ORG_SCOPE",
      "This action requires an organisation-scoped user."
    );
  }
  return { user, orgId: user.orgId };
}

export async function requirePlatformAdmin(req: Request) {
  const user = await getUser(req);
  if (user.role !== "platform_admin") {
    throw new ApiError(
      403,
      "PLATFORM_ADMIN_ONLY",
      "This view is restricted to platform administrators."
    );
  }
  return user;
}

/**
 * Multi-tenant isolation guard (plan §6.4): every query path includes orgId
 * scoping. Org members asking for another org get a 403, not empty data.
 */
export function assertOrgScope(
  user: SessionUser,
  requestedOrgId?: string | null
): string {
  if (user.role === "platform_admin") {
    if (!requestedOrgId) {
      throw new ApiError(
        422,
        "ORG_REQUIRED",
        "Platform admins must pass an orgId for organisation-scoped reads."
      );
    }
    return requestedOrgId;
  }
  if (requestedOrgId && requestedOrgId !== user.orgId) {
    throw new ApiError(
      403,
      "CROSS_ORG_ACCESS_DENIED",
      "Organisation data is scoped; cross-organisation reads are refused."
    );
  }
  return user.orgId as string;
}
