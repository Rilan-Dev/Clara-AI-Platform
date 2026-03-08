import { NextRequest } from "next/server";
import { reprocessDocumentHandler } from "@/modules/knowledge-bases/api/documents";
type Params = { params: Promise<{ kbId: string; docId: string }> };
export async function POST(req: NextRequest, { params }: Params) {
  const { kbId, docId } = await params;
  return reprocessDocumentHandler(req, kbId, docId);
}
