import { NextRequest, NextResponse } from "next/server";
import { getAgentById } from "@/modules/organisations/core/db";
import { requireAuth, requireAgentPermission } from "@/modules/auth/core/rbac";
import {
  getAgentAISettings,
  upsertAgentAISettings,
} from "../core/agent-ai-settings-db";
import type { PatchAgentAISettingsInput } from "../core/agent-ai-types";

export async function getAgentAISettingsHandler(
  req: NextRequest,
  agentId: string,
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:read");
    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    const settings = await getAgentAISettings(agentId);
    return NextResponse.json({
      agent: { id: agent.id, orgId: agent.orgId, name: agent.name },
      settings,
    });
  } catch (error) {
    console.error("[agent-ai-settings] GET", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function patchAgentAISettingsHandler(
  req: NextRequest,
  agentId: string,
): Promise<NextResponse> {
  try {
    const auth = await requireAuth(req);
    await requireAgentPermission(auth, agentId, "project:update");
    const agent = await getAgentById(agentId);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    const body = (await req.json()) as PatchAgentAISettingsInput;
    const settings = await upsertAgentAISettings(agent.id, agent.orgId, body);
    return NextResponse.json(settings);
  } catch (error) {
    console.error("[agent-ai-settings] PATCH", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
