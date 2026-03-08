/**
 * src/modules/organisations/api/orgs.ts
 * Route handlers for /api/orgs and /api/orgs/[orgId]
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  createOrganisation,
  listOrganisations,
  getOrganisationById,
  updateOrganisation,
  deleteOrganisation,
} from "../core/db";
import { getAuthContext, requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import { addOrgMember } from "@/modules/auth/core/db";

// POST /api/orgs — create organisation
export async function createOrgHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await getAuthContext(req);
    const body = await req.json();
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const org = await createOrganisation({
      name:    body.name.trim(),
      slug:    body.slug?.trim() || undefined,
      logoUrl: body.logoUrl?.trim() || undefined,
    });
    // Auto-add the creator as org_admin
    if (auth?.user?.id) {
      await addOrgMember(org.id, auth.user.id, "org_admin", auth.user.id);
    }
    return NextResponse.json(org, { status: 201 });
  } catch (err) {
    console.error("[orgs] createOrg:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET /api/orgs — list all organisations
export async function listOrgsHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await getAuthContext(req);
    const orgs = await listOrganisations();
    // If authenticated, filter to orgs the user is a member of (unless super admin)
    if (auth && !auth.user.isSuperAdmin) {
      const { query } = await import("@/lib/db");
      const memberOrgIds = new Set(
        (await query<{ org_id: string }>(
          "SELECT org_id FROM org_members WHERE user_id = $1",
          [auth.user.id]
        )).map((r) => r.org_id)
      );
      return NextResponse.json(orgs.filter((o) => memberOrgIds.has(o.id)));
    }
    return NextResponse.json(orgs);
  } catch (err) {
    console.error("[orgs] listOrgs:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET /api/orgs/[orgId] — get single organisation
export async function getOrgHandler(
  req: NextRequest,
  orgId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "org:read");
    const org = await getOrganisationById(orgId);
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    return NextResponse.json(org);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH /api/orgs/[orgId] — update organisation
export async function updateOrgHandler(
  req: NextRequest,
  orgId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "org:update");
    const body = await req.json();
    const org = await updateOrganisation(orgId, {
      name:    body.name?.trim()    || undefined,
      logoUrl: body.logoUrl?.trim() || undefined,
    });
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    return NextResponse.json(org);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/orgs/[orgId] — delete organisation
export async function deleteOrgHandler(
  req: NextRequest,
  orgId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "org:delete");
    const deleted = await deleteOrganisation(orgId);
    if (!deleted) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
