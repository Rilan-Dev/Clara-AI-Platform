import { NextRequest, NextResponse } from "next/server";
import { postChat } from "@/modules/assistant/api/chat";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";

/**
 * Workspace chat is tenant-authenticated. Published visitors use the separate
 * /api/embed/chat endpoint, which validates a KB-bound embed credential.
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
      // Legacy document_catalog has no owner/tenant field to authorize.
      return NextResponse.json(
        { error: "Chat requires a tenant-bound knowledge base ID." },
        { status: payload.documentId ? 410 : 400 },
      );
    }

    const auth = await requireAuth(request);
    await requireKbPermission(auth, kbId, "kb:read");
    if (payload.scope === "draft") {
      await requireKbPermission(auth, kbId, "kb:update");
    }

    // Do not consume the original streaming request body.
    return postChat(request);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[chat] authentication boundary failed:", error);
    return NextResponse.json({ error: "Chat unavailable" }, { status: 500 });
  }
}
