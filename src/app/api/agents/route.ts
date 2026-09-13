import { NextRequest } from "next/server";
import { createAgentHandler, listAgentsHandler } from "@/modules/agents/api/agents";

export async function GET(req: NextRequest) {
  return listAgentsHandler(req);
}

export async function POST(req: NextRequest) {
  return createAgentHandler(req);
}
