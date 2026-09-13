import { NextRequest } from "next/server";
import {
  getAgentAISettingsHandler,
  patchAgentAISettingsHandler,
} from "@/modules/organisations/api/agent-ai-settings";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return getAgentAISettingsHandler(req, agentId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return patchAgentAISettingsHandler(req, agentId);
}
