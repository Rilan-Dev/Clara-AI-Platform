import { NextRequest } from "next/server";
import { restoreVersionHandler } from "@/modules/agent-versioning/api/handlers";

type Params = { params: Promise<{ agentId: string; versionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId, versionId } = await params;
  return restoreVersionHandler(req, agentId, versionId);
}
