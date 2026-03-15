/**
 * POST /api/embed/search
 * OPTIONS /api/embed/search
 * ─────────────────────────────────────────────────────────────────────────────
 * Public RAG search endpoint — returns raw KB chunks only, no LLM inference.
 * Used by the voice hook to fetch context before injecting into OpenAI Realtime.
 *
 * Why separate from /api/embed/chat:
 *   - /api/embed/chat runs the full LLM pipeline → streams an AI answer
 *   - The voice hook needs raw context to inject into OpenAI Realtime
 *   - Injecting an AI-generated answer as "context" causes double-LLM confusion
 *     and makes the AI say "I can only answer from documents"
 *
 * Request body: { query: string, limit?: number }
 * Response:     { context: string, sources: [...] }
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

    const validation = await validateEmbedRequest(req);
    if (!validation.ok) return validation.response;
    const { ctx } = validation;

    const origin      = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins);

    const body = (await req.json()) as { query?: string; limit?: number };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400, headers: corsHeaders });
    }

    const limit = Math.min(Math.max(Number(body.limit ?? 6), 1), 12);

    const kb = await getKnowledgeBaseById(ctx.kbId);
    if (!kb) {
      return NextResponse.json({ error: "KB not found" }, { status: 404, headers: corsHeaders });
    }

    const resolved       = await resolveAIConfig({ kbId: ctx.kbId, surface: "chat" });
    const providerConfig = toProviderConfig(resolved);
    const results        = await searchKbEmbedded(kb.qdrantCollection, query, limit, { providerConfig });

    const context = results
      .map((r, i) => `[S${i + 1}] ${r.title}\n${r.snippet}`)
      .join("\n\n");

    const sources = results.map((r, i) => ({
      index:      i + 1,
      id:         r.id,
      title:      r.title,
      snippet:    r.snippet.slice(0, 300),
      score:      r.score,
      documentId: r.documentId,
    }));

    return NextResponse.json({ context, sources, kbId: ctx.kbId }, { headers: corsHeaders });
  } catch (err) {
    console.error("[embed/search]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
