import { NextRequest } from "next/server";
import {
  createAgentHandler,
  listAgentsHandler,
} from "@/modules/organisations/api/agents";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  return listAgentsHandler(req, orgId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  return createAgentHandler(req, orgId);
}
