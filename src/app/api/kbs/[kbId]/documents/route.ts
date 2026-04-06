/**
 * POST /api/kbs/[kbId]/documents   — upload one or more files
 * GET  /api/kbs/[kbId]/documents   — list documents with status
 *
 * Increase body size limit for large file uploads in next.config.ts if needed.
 */
import { NextRequest } from "next/server";
import {
  uploadDocumentsHandler,
  listDocumentsHandler,
} from "@/modules/knowledge-bases/api/documents";

// Allow up to 5 minutes for large document processing
export const maxDuration = 300;

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return listDocumentsHandler(req, kbId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return uploadDocumentsHandler(req, kbId);
}
