import { NextRequest } from "next/server";
import { getDefaultsHandler, putEmbeddingDefaultHandler } from "@/modules/ai-governance/api/providers";

export async function GET(req: NextRequest) {
  return getDefaultsHandler(req);
}

export async function PUT(req: NextRequest) {
  return putEmbeddingDefaultHandler(req);
}
