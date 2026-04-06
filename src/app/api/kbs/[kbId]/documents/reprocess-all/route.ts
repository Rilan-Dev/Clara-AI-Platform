import { NextRequest } from "next/server";
import { reprocessAllDocumentsHandler } from "@/modules/knowledge-bases/api/documents";

type Params = { params: Promise<{ kbId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return reprocessAllDocumentsHandler(req, kbId);
}
