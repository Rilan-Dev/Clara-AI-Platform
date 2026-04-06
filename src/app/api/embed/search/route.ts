/**
 * POST /api/embed/search
 * Returns raw KB chunks only — no LLM. Used by voice hook and phone calls.
 * Internal phone calls use x-phone-internal + x-kb-id headers (no embed key).
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  validateEmbedRequest,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { searchKbEmbedded } from "@/modules/embed/core/search";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await ensureMigrated();

    // ── Internal phone call path (no embed key needed) ───────────────────────
    const isInternal   = req.headers.get("x-phone-internal") === "1";
    const internalKbId = req.headers.get("x-kb-id") ?? "";

    let kbId: string;
    let corsHeaders: Record<string, string> = {};

    if (isInternal && internalKbId) {
      kbId = internalKbId;
    } else {
      const validation = await validateEmbedRequest(req);
      if (!validation.ok) return validation.response;
      kbId        = validation.ctx.kbId;
      corsHeaders = buildCorsHeaders(req.headers.get("origin"), validation.ctx.allowedOrigins, req.nextUrl.origin);
    }

    const body  = (await req.json()) as { query?: string; limit?: number };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400, headers: corsHeaders });
    }

    const limit = Math.min(Math.max(Number(body.limit ?? 6), 1), 12);
    const kb    = await getKnowledgeBaseById(kbId);
    if (!kb) {
      return NextResponse.json({ error: "KB not found" }, { status: 404, headers: corsHeaders });
    }

    const resolved       = await resolveAIConfig({ kbId, surface: "chat" });
    const providerConfig = toProviderConfig(resolved);
    const results        = await searchKbEmbedded(kb.qdrantCollection, query, limit, { providerConfig });

    const context = results.map((r, i) => `[S${i + 1}] ${r.title}\n${r.snippet}`).join("\n\n");
    const sources = results.map((r, i) => ({
      index:      i + 1,
      id:         r.id,
      title:      r.title,
      snippet:    r.snippet.slice(0, 300),
      score:      r.score,
      documentId: r.documentId,
    }));

    return NextResponse.json({ context, sources, kbId }, { headers: corsHeaders });
  } catch (err) {
    console.error("[embed/search]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
