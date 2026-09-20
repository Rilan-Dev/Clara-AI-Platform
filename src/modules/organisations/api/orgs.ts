/** Route handlers for organisation profiles. */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { createOrganisation, listOrganisations, getOrganisationById, updateOrganisation, deleteOrganisation } from "../core/db";
import { getAuthContext, requireAuth, requireOrgPermission, requireSuperAdmin } from "@/modules/auth/core/rbac";
import { addOrgMember } from "@/modules/auth/core/db";

/**
 * Platform admins only see aggregate counts (dashboard) and billing
 * (subscriptions). Organisation profiles are self-managed by org users —
 * so the read/update/delete/list endpoints below reject super admins.
 */
function adminForbidden(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Organisation details are managed by the organisation itself. Platform admins only see aggregate counts and billing.",
    },
    { status: 403 },
  );
}

export async function createOrgHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireSuperAdmin(auth);
    const body = await req.json();
    if (!body?.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const org = await createOrganisation({ name: body.name.trim(), slug: body.slug?.trim() || undefined, logoUrl: body.logoUrl?.trim() || undefined });
    await addOrgMember(org.id, auth.user.id, "org_admin", auth.user.id);
    return NextResponse.json(org, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[orgs] createOrg:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function listOrgsHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await getAuthContext(req);
    if (auth?.user.isSuperAdmin) return adminForbidden();
    if (!auth) {
      // listOrganisations() has no auth guard of its own — reject explicitly.
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    const orgs = await listOrganisations();
    const memberOrgIds = new Set((await query<{ org_id: string }>("SELECT org_id FROM org_members WHERE user_id = $1", [auth.user.id])).map((r) => r.org_id));
    return NextResponse.json(orgs.filter((o) => memberOrgIds.has(o.id)));
  } catch (err) {
    console.error("[orgs] listOrgs:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function getOrgHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    // Platform admins may READ any org — the admin console org settings page
    // needs the org profile alongside the AI configuration they manage.
    // Mutations below still require org membership.
    if (!auth.user.isSuperAdmin) {
      await requireOrgPermission(auth, orgId, "org:read");
    }
    const org = await getOrganisationById(orgId);
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    return NextResponse.json(org);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function updateOrgHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) return adminForbidden();
    await requireOrgPermission(auth, orgId, "org:update");
    const body = await req.json();
    const org = await updateOrganisation(orgId, { name: body.name?.trim() || undefined, logoUrl: body.logoUrl?.trim() || undefined });
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    return NextResponse.json(org);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function deleteOrgHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) return adminForbidden();
    await requireOrgPermission(auth, orgId, "org:delete");
    const deleted = await deleteOrganisation(orgId);
    if (!deleted) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
