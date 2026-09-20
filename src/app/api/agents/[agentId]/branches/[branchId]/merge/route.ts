import { NextRequest } from "next/server";
import { reviewMergeHandler, executeMergeHandler } from "@/modules/agent-versioning/api/handlers";

type Params = { params: Promise<{ agentId: string; branchId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId, branchId } = await params;
  return reviewMergeHandler(req, agentId, branchId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId, branchId } = await params;
  return executeMergeHandler(req, agentId, branchId);
}
