import { NextRequest } from "next/server";
import { listVersionsHandler, saveVersionHandler } from "@/modules/agent-versioning/api/handlers";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return listVersionsHandler(req, agentId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return saveVersionHandler(req, agentId);
}
