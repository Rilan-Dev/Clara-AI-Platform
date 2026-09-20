import { NextRequest } from "next/server";
import { getVersionHandler } from "@/modules/agent-versioning/api/handlers";

type Params = { params: Promise<{ agentId: string; versionId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId, versionId } = await params;
  return getVersionHandler(req, agentId, versionId);
}
