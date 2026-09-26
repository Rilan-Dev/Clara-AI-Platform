import { NextRequest, NextResponse } from "next/server";
import { handlePreflight } from "@/modules/embed/core/validate-embed";
import { postEmbedTranslate } from "@/modules/assistant/api/translate";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return postEmbedTranslate(req);
}
