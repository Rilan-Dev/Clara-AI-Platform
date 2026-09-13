import { NextRequest } from "next/server";
import {
  getAgentHandler,
  updateAgentHandler,
  deleteAgentHandler,
} from "@/modules/agents/api/agents";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return getAgentHandler(req, agentId);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return updateAgentHandler(req, agentId);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return deleteAgentHandler(req, agentId);
}
