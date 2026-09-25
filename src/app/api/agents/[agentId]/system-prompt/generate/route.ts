import { NextRequest } from "next/server";
import { generateSystemPromptHandler } from "@/modules/assistant/api/system-prompt-generator";

// Two model calls (classify + write) — allow them to finish on serverless.
export const maxDuration = 60;

type Params = { params: Promise<{ agentId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { agentId } = await params;
  return generateSystemPromptHandler(req, agentId);
}
