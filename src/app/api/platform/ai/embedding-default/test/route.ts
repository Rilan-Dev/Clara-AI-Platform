import { NextRequest } from "next/server";
import { testEmbeddingDefaultHandler } from "@/modules/ai-governance/api/providers";

export async function POST(req: NextRequest) {
  return testEmbeddingDefaultHandler(req);
}
