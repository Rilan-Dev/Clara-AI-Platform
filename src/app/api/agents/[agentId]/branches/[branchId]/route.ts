import { NextRequest } from "next/server";
import { archiveBranchHandler } from "@/modules/agent-versioning/api/handlers";

type Params = { params: Promise<{ agentId: string; branchId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { agentId, branchId } = await params;
  return archiveBranchHandler(req, agentId, branchId);
}
