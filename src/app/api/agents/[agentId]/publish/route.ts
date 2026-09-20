import { NextRequest } from "next/server";
import { getPublishReviewHandler, publishHandler, rollbackHandler, listDeploymentsHandler } from "@/modules/agent-versioning/api/handlers";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  // ?versionId=… → publish review · otherwise deployment history.
  if (req.nextUrl.searchParams.get("versionId")) {
    return getPublishReviewHandler(req, agentId);
  }
  return listDeploymentsHandler(req, agentId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return publishHandler(req, agentId);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return rollbackHandler(req, agentId);
}
