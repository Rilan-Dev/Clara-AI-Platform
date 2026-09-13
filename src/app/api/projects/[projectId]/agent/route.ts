import { NextRequest } from "next/server";
import {
  getProjectAgentHandler,
  assignProjectAgentHandler,
} from "@/modules/agents/api/agents";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  return getProjectAgentHandler(req, projectId);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  return assignProjectAgentHandler(req, projectId);
}
