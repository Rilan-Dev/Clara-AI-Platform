import { NextRequest } from "next/server";
import { checkDefaultUpdateHandler, applyDefaultUpdateHandler } from "@/modules/agent-versioning/api/handlers";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return checkDefaultUpdateHandler(req, agentId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return applyDefaultUpdateHandler(req, agentId);
}
