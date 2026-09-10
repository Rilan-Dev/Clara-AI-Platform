/**
 * PATCH  /api/kbs/[kbId]/documents/[docId]/chunks/[chunkId]  — update chunk text
 * DELETE /api/kbs/[kbId]/documents/[docId]/chunks/[chunkId]  — delete single chunk
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getDocumentById } from "@/modules/knowledge-bases/core/documents-db";
import {
  updateChunk,
  deleteChunk,
} from "@/modules/admin/core/vector-store-kb";
import { AuthContext } from "@/modules/auth/core/models";

// Add this helper function to check if user is platform admin
async function denyPlatformAdmin(auth: AuthContext): Promise<void> {
  if (auth.user.isSuperAdmin) {
    throw NextResponse.json(
      { error: "Platform admins cannot modify document chunks" },
      { status: 403 }
    );
  }
}

type Params = { params: Promise<{ kbId: string; docId: string; chunkId: string }> };

// ── PATCH — update chunk text and re-embed ────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { kbId, docId, chunkId } = await params;

    const auth = await requireAuth(req);
    await denyPlatformAdmin(auth); // Add this check
    await requireKbPermission(auth, kbId, "document:create");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });

    const doc = await getDocumentById(docId);
    if (!doc || doc.kbId !== kbId)
      return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const body = (await req.json()) as { text?: string; chunkIndex?: number };
    if (!body.text?.trim())
      return NextResponse.json({ error: "text is required" }, { status: 400 });

    await updateChunk(
      kb.qdrantCollection,
      chunkId,
      body.text.trim(),
      body.chunkIndex ?? 0,
      { kbId, documentId: docId, title: doc.title, originalFilename: doc.originalFilename }
    );

    return NextResponse.json({ pointId: chunkId, text: body.text.trim() });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[chunks/chunkId] PATCH:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ── DELETE — remove single chunk ──────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await ensureMigrated();
    const { kbId, docId, chunkId } = await params;

    const auth = await requireAuth(req);
    await denyPlatformAdmin(auth); // Add this check
    await requireKbPermission(auth, kbId, "document:delete");

    const kb = await getKnowledgeBaseById(kbId);
    if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });

    const doc = await getDocumentById(docId);
    if (!doc || doc.kbId !== kbId)
      return NextResponse.json({ error: "Document not found" }, { status: 404 });

    await deleteChunk(kb.qdrantCollection, chunkId);
    return NextResponse.json({ deleted: true, pointId: chunkId });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[chunks/chunkId] DELETE:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
