/**
 * src/modules/agents/api/agents.ts
 * Agent CRUD + project assignment handlers.
 *
 * Auth model (org self-service — platform admins are intentionally locked out):
 *  - Platform admins get 403: they only see aggregate counts on the dashboard
 *    and never manage organisation content (projects, agents, KBs, AI config).
 *  - Org users act only within their own organisation and need the
 *    agent:read / agent:create / agent:update / agent:delete permissions
 *    (granted by migration 036).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { getProjectById } from "@/modules/organisations/core/db";
import { requireAuth, requireOrgPermission } from "@/modules/auth/core/rbac";
import {
  AgentValidationError,
  createAgent, listAgents, getAgentById, updateAgent, deleteAgent,
  getActiveAgentForProject, listProjectsForAgent, assignAgentToProject,
} from "../core/db";
import type { ProjectAgentAssignment } from "../core/models";

export type AgentWithProjects = Awaited<ReturnType<typeof getAgentById>> & {
  projects: ProjectAgentAssignment[];
  orgProjects: { id: string; name: string }[];
};

/** Platform admins only see counts — organisation content is org-managed. */
function adminForbidden(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Agents are managed by organisations. Platform admins only see aggregate counts on the dashboard.",
    },
    { status: 403 },
  );
}

async function memberOrgIds(userId: string): Promise<string[]> {
  const rows = await query<{ org_id: string }>(
    "SELECT org_id FROM org_members WHERE user_id = $1",
    [userId],
  );
  return rows.map((r) => String(r.org_id));
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listAgentsHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) return adminForbidden();

    const orgId = req.nextUrl.searchParams.get("orgId");

    // Org user: only agents from organisations they belong to
    const ids = await memberOrgIds(auth.user.id);
    const target = orgId && ids.includes(orgId) ? orgId : null;
    const agents = await listAgents(target);
    if (target) return NextResponse.json(agents);
    return NextResponse.json(agents.filter((a) => ids.includes(a.orgId)));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[agents] list:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createAgentHandler(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) return adminForbidden();

    const body = await req.json();
    const name = body?.name?.trim();
    if (!name) return badRequest("name is required");

    let orgId: string | null = body?.orgId?.trim() || null;
    if (!orgId) {
      const ids = await memberOrgIds(auth.user.id);
      orgId = ids[0] ?? null;
      if (!orgId) return badRequest("You do not belong to an organisation yet");
    }
    await requireOrgPermission(auth, orgId, "agent:create");

    const agent = await createAgent({
      orgId,
      name,
      description: body?.description?.trim() || undefined,
      assistantName: body?.assistantName?.trim() || undefined,
      systemPrompt: body?.systemPrompt?.trim() || undefined,
      welcomeMessage: body?.welcomeMessage?.trim() || undefined,
      createdBy: auth.user.id,
    });
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof AgentValidationError) return badRequest(err.message);
    console.error("[agents] create:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── Read one (with linked projects) ──────────────────────────────────────────

export async function getAgentHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) return adminForbidden();

    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    await requireOrgPermission(auth, agent.orgId, "agent:read");

    const projects = await listProjectsForAgent(agentId);
    // Eligible projects in the agent's org (for the assign control). Included
    // here because the org projects API is intentionally closed to platform
    // admins — this response is already auth-scoped to the agent's org.
    const orgProjects = await query<{ id: string; name: string }>(
      "SELECT id, name FROM projects WHERE org_id = $1 ORDER BY name",
      [agent.orgId],
    );
    return NextResponse.json({
      ...agent,
      projects,
      orgProjects: orgProjects.map((p) => ({ id: String(p.id), name: p.name })),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[agents] get:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateAgentHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) return adminForbidden();

    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    await requireOrgPermission(auth, agent.orgId, "agent:update");

    const body = await req.json();
    const updated = await updateAgent(agentId, body ?? {});
    if (!updated) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof AgentValidationError) return badRequest(err.message);
    console.error("[agents] update:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteAgentHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) return adminForbidden();

    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    await requireOrgPermission(auth, agent.orgId, "agent:delete");

    const deleted = await deleteAgent(agentId);
    if (!deleted) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[agents] delete:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── Project assignment ────────────────────────────────────────────────────────

export async function getProjectAgentHandler(req: NextRequest, projectId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) return adminForbidden();

    const project = await getProjectById(projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    await requireOrgPermission(auth, project.orgId, "agent:read");

    const agent = await getActiveAgentForProject(projectId);
    return NextResponse.json({ agent });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[agents] getProjectAgent:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function assignProjectAgentHandler(req: NextRequest, projectId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    if (auth.user.isSuperAdmin) return adminForbidden();

    const project = await getProjectById(projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    await requireOrgPermission(auth, project.orgId, "agent:update");

    const body = await req.json();
    const agentId = body?.agentId === null ? null : (body?.agentId?.trim() || null);
    if (body?.agentId != null && !agentId) return badRequest("agentId must be a valid id or null");

    const result = await assignAgentToProject(projectId, agentId, auth.user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof AgentValidationError) return badRequest(err.message);
    console.error("[agents] assignProjectAgent:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
