import { NextRequest } from "next/server";
import { getDraftHandler, putDraftHandler } from "@/modules/agent-versioning/api/handlers";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return getDraftHandler(req, agentId);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return putDraftHandler(req, agentId);
}
