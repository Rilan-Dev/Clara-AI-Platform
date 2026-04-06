/**
 * src/modules/organisations/api/projects.ts
 * Route handlers for /api/orgs/[orgId]/projects and /api/projects/[projectId]
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getOrganisationById } from "../core/db";
import {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  deleteProject,
} from "../core/db";

// POST /api/orgs/[orgId]/projects
export async function createProjectHandler(
  req: NextRequest,
  orgId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const org = await getOrganisationById(orgId);
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

    const body = await req.json();
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const project = await createProject(orgId, {
      name:        body.name.trim(),
      description: body.description?.trim() || undefined,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error("[projects] createProject:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET /api/orgs/[orgId]/projects
export async function listProjectsHandler(
  _req: NextRequest,
  orgId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const org = await getOrganisationById(orgId);
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    const projects = await listProjects(orgId);
    return NextResponse.json(projects);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET /api/projects/[projectId]
export async function getProjectHandler(
  _req: NextRequest,
  projectId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const project = await getProjectById(projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]
export async function updateProjectHandler(
  req: NextRequest,
  projectId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const body = await req.json();
    const project = await updateProject(projectId, {
      name:        body.name?.trim()        || undefined,
      description: body.description?.trim() || undefined,
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]
export async function deleteProjectHandler(
  _req: NextRequest,
  projectId: string
): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const deleted = await deleteProject(projectId);
    if (!deleted) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
