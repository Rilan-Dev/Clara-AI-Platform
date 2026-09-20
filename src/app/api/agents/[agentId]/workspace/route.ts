import { NextRequest } from "next/server";
import { getWorkspaceContextHandler } from "@/modules/agent-versioning/api/handlers";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return getWorkspaceContextHandler(req, agentId);
}
