import { NextRequest, NextResponse } from "next/server";
import { postRagSearch } from "@/modules/assistant/api/rag";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";

/**
 * Direct KB search is an authenticated, tenant-scoped API.
 * Public embeds use /api/embed/rag with their separately validated credentials.
 * A caller-supplied KB id alone does not grant access to its knowledge.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.clone().json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const kbId = typeof payload.kbId === "string" ? payload.kbId.trim() : "";
    if (!kbId) {
      // Legacy catalog documents are not tenant-bound; documentId alone is
      // insufficient to establish which user's permissions must be checked.
      return NextResponse.json(
        { error: "A knowledge base ID is required; document-only search is unavailable." },
        { status: 400 },
      );
    }

    const auth = await requireAuth(request);
    await requireKbPermission(auth, kbId, "kb:read");
    if (payload.scope === "draft") {
      // Reading published knowledge does not imply access to unpublished edits.
      await requireKbPermission(auth, kbId, "kb:update");
    }

    // Preserve the original request body for the shared grounding handler.
    return postRagSearch(request);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[rag/search] failed:", error);
    return NextResponse.json({ error: "RAG search unavailable" }, { status: 500 });
  }
}
