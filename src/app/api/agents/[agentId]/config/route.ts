import { NextRequest } from "next/server";
import {
  getAgentConfigHandler,
  putAgentConfigHandler,
  patchAgentConfigHandler,
} from "@/modules/knowledge-bases/api/agent-config";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return getAgentConfigHandler(req, agentId);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return putAgentConfigHandler(req, agentId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return patchAgentConfigHandler(req, agentId);
}
