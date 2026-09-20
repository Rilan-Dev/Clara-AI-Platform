import { NextRequest } from "next/server";
import { listBranchesHandler, createBranchHandler } from "@/modules/agent-versioning/api/handlers";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return listBranchesHandler(req, agentId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return createBranchHandler(req, agentId);
}
