/** Route handlers for tenant project CRUD. Platform admins are intentionally excluded. */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getOrganisationById, createProject, listProjects, getProjectById, updateProject, deleteProject } from "../core/db";
import { requireAuth, requireOrgPermission, requireProjectPermission } from "@/modules/auth/core/rbac";

export async function createProjectHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "project:create");
    const org = await getOrganisationById(orgId);
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    const body = await req.json();
    if (!body?.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
    return NextResponse.json(await createProject(orgId, { name: body.name.trim(), description: body.description?.trim() || undefined }), { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[projects] createProject:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function listProjectsHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "project:read");
    const org = await getOrganisationById(orgId);
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    return NextResponse.json(await listProjects(orgId));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function getProjectHandler(req: NextRequest, projectId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireProjectPermission(auth, projectId, "project:read");
    const project = await getProjectById(projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function updateProjectHandler(req: NextRequest, projectId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireProjectPermission(auth, projectId, "project:update");
    const body = await req.json();
    const project = await updateProject(projectId, { name: body.name?.trim() || undefined, description: body.description?.trim() || undefined });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function deleteProjectHandler(req: NextRequest, projectId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireProjectPermission(auth, projectId, "project:delete");
    const deleted = await deleteProject(projectId);
    if (!deleted) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
