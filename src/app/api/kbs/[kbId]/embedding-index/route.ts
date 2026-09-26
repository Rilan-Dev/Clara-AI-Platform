import { NextRequest } from "next/server";
import { getEmbeddingIndex, postEmbeddingIndex } from "@/modules/knowledge-bases/api/embedding-index";

// A status poll or a start may spend a few seconds re-embedding a page.
export const maxDuration = 60;

type Params = { params: Promise<{ kbId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return getEmbeddingIndex(req, kbId);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { kbId } = await params;
  return postEmbeddingIndex(req, kbId);
}
