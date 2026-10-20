import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getDocumentById } from "@/modules/knowledge-bases/core/documents-db";
import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { updateChunk, deleteChunk } from "@/modules/admin/core/vector-store-kb";

type Params = { params: Promise<{ kbId: string; docId: string; chunkId: string }> };

/**
 * Permission to edit a document does not grant permission to edit every point
 * in the KB's shared Qdrant collection. Bind the exact point to BOTH server-
 * validated KB and document identities before any destructive operation.
 */
async function getOwnedChunkIndex(
  collectionName: string,
  chunkId: string,
  kbId: string,
  docId: string,
): Promise<number | null> {
  const points = await getQdrantClient().retrieve(collectionName, {
    ids: [chunkId],
    with_payload: true,
    with_vector: false,
  });
  const payload = points[0]?.payload;
  if (payload?.kbId !== kbId || payload?.documentId !== docId) return null;
  const index = payload.chunkIndex;
  return typeof index === "number" && Number.isSafeInteger(index) && index >= 0
    ? index
    : Number.NaN;
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { kbId, docId, chunkId } = await params;
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:create");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    if (kb.status !== "active") {
      return NextResponse.json({ error: "Knowledge base is archived" }, { status: 400 });
    }
    const doc = await getDocumentById(docId);
    if (!doc || doc.kbId !== kbId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as {
      text?: unknown;
      chunkIndex?: unknown;
    } | null;
    if (typeof body?.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const originalIndex = await getOwnedChunkIndex(kb.qdrantCollection, chunkId, kbId, docId);
    if (originalIndex === null) {
      return NextResponse.json({ error: "Chunk not found" }, { status: 404 });
    }
    if (Number.isNaN(originalIndex)) {
      return NextResponse.json({ error: "Invalid stored chunk index" }, { status: 409 });
    }
    const chunkIndex = body.chunkIndex === undefined ? originalIndex : body.chunkIndex;
    if (typeof chunkIndex !== "number" || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: "chunkIndex must be a non-negative integer" }, { status: 400 });
    }

    await updateChunk(
      kb.qdrantCollection,
      chunkId,
      body.text.trim(),
      chunkIndex,
      { kbId, documentId: docId, title: doc.title, originalFilename: doc.originalFilename },
    );
    return NextResponse.json({ pointId: chunkId, text: body.text.trim(), chunkIndex });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[api/kbs/documents/chunks] update failed", err);
    return NextResponse.json({ error: "Unable to update document chunk" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await ensureMigrated();
    const { kbId, docId, chunkId } = await params;
    const auth = await requireAuth(req);
    await requireKbPermission(auth, kbId, "document:delete");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
    const doc = await getDocumentById(docId);
    if (!doc || doc.kbId !== kbId) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const originalIndex = await getOwnedChunkIndex(kb.qdrantCollection, chunkId, kbId, docId);
    if (originalIndex === null) {
      return NextResponse.json({ error: "Chunk not found" }, { status: 404 });
    }
    await deleteChunk(kb.qdrantCollection, chunkId, kbId);
    return NextResponse.json({ deleted: true, pointId: chunkId });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[api/kbs/documents/chunks] delete failed", err);
    return NextResponse.json({ error: "Unable to delete document chunk" }, { status: 500 });
  }
}
