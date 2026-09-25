import { NextRequest, NextResponse } from "next/server";
import { postTranslate } from "@/modules/assistant/api/translate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return postTranslate(req);
}
