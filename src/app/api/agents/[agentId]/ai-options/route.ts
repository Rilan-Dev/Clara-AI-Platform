import { NextRequest } from "next/server";
import { agentAIOptionsHandler } from "@/modules/ai-governance/api/providers";

type Params = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return agentAIOptionsHandler(req, agentId);
}
