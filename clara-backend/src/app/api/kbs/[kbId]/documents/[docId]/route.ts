/**
 * GET    /api/kbs/[kbId]/documents/[docId]  — get document + job status (poll)
 * DELETE /api/kbs/[kbId]/documents/[docId]  — delete document + Qdrant chunks
 */
import { NextRequest } from "next/server";
import {
  getDocumentHandler,
  deleteDocumentHandler,
} from "@/modules/knowledge-bases/api/documents";

type Params = { params: Promise<{ kbId: string; docId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { kbId, docId } = await params;
  return getDocumentHandler(req, kbId, docId);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { kbId, docId } = await params;
  return deleteDocumentHandler(req, kbId, docId);
}
