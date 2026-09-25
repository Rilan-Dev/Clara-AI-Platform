import { NextRequest } from "next/server";
import { postAgentTranslate } from "@/modules/assistant/api/translate";

type Params = { params: Promise<{ agentId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return postAgentTranslate(req, agentId);
}
