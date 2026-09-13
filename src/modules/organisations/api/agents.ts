/**
 * Route handlers for tenant agent CRUD (the former "projects").
 * Platform admins are intentionally excluded — agents are org-managed.
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { getOrganisationById, createAgent, listAgents, getAgentById, updateAgent, deleteAgent, AgentValidationError } from "../core/db";
import { requireAuth, requireOrgPermission, requireAgentPermission } from "@/modules/auth/core/rbac";
import type { UpdateAgentInput } from "../core/models";

export async function createAgentHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "project:create");
    const org = await getOrganisationById(orgId);
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    const body = await req.json();
    if (!body?.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
    return NextResponse.json(
      await createAgent(orgId, { name: body.name.trim(), description: body.description?.trim() || undefined, createdBy: auth.user.id }),
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof AgentValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[agents] createAgent:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function listAgentsHandler(req: NextRequest, orgId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireOrgPermission(auth, orgId, "project:read");
    const org = await getOrganisationById(orgId);
    if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    return NextResponse.json(await listAgents(orgId));
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[agents] listAgents:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function getAgentHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json(agent);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[agents] getAgent:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function updateAgentHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const body = await req.json();

    // Identity / lifecycle fields every caller may use
    const input: UpdateAgentInput = {
      name: body.name?.trim() || undefined,
      description: body.description?.trim() || undefined,
    };

    // Persona fields (Identity / Behaviour / Language / Voice / generation) —
    // accepted so the agent's own assistant configuration stays API-editable.
    for (const key of [
      "status", "assistantName", "avatarUrl", "systemPrompt", "welcomeMessage",
      "outOfScopeReply", "rules", "defaultLanguage", "allowedLanguages",
      "alwaysRespondIn", "voiceProvider", "voiceId", "speed", "chatModel",
      "temperature", "maxTokens", "citeSources", "strictMode",
    ] as const) {
      if (body[key] !== undefined) (input as Record<string, unknown>)[key] = body[key];
    }

    const agent = await updateAgent(agentId, input);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json(agent);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    if (err instanceof AgentValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[agents] updateAgent:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function deleteAgentHandler(req: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:delete");
    const deleted = await deleteAgent(agentId);
    if (!deleted) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[agents] deleteAgent:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
