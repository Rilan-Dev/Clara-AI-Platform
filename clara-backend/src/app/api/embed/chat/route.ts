/**
 * POST /api/embed/chat
 * OPTIONS /api/embed/chat  (CORS preflight)
 * ─────────────────────────────────────────────────────────────────────────────
 * Public streaming chat endpoint — authenticated by API key.
 * Wraps the internal RAG + LLM pipeline with:
 *   - API key validation
 *   - CORS headers
 *   - Rate limiting
 *   - Analytics logging
 *
 * Request body:
 *   { messages: [{role, content}], sessionId?: string }
 *
 * The kbId is resolved from the API key — the caller never needs to pass it.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import {
  validateEmbedRequest,
  buildCorsHeaders,
  handlePreflight,
} from "@/modules/embed/core/validate-embed";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { searchKbEmbedded } from "@/modules/embed/core/search";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { logQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";
import type { ChatMessage } from "@/modules/ai-core/types";
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

    const origin = req.headers.get("origin");
    const corsHeaders = buildCorsHeaders(origin, ctx.allowedOrigins, req.nextUrl.origin);

    const body = (await req.json()) as {
      messages?: Array<{ role: string; content: string }>;
      sessionId?: string;
    };

    const messages = (body.messages ?? []).filter(
      (m) => m.role && m.content && typeof m.content === "string"
    );

    if (messages.length === 0) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400, headers: corsHeaders });
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== "user") {
      return NextResponse.json({ error: "Last message must be from user" }, { status: 400, headers: corsHeaders });
    }

    const query = lastMessage.content.trim();

    // Load KB + config
    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);

    if (!kb || !config) {
      return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });
    }

    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "chat" });
    if (!resolved.flags.publicEmbedEnabled) {
      return NextResponse.json(
        { error: "Public embed is disabled for this knowledge base" },
        { status: 403, headers: corsHeaders },
      );
    }

    const providerConfig = toProviderConfig(resolved);

    // RAG search — with timeout so slow Qdrant never hangs the response
    const t0 = Date.now();
    let searchResults: Awaited<ReturnType<typeof searchKbEmbedded>> = [];
    try {
      const searchPromise = searchKbEmbedded(kb.qdrantCollection, query, 8, { providerConfig });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("search_timeout")), 8000)
      );
      searchResults = await Promise.race([searchPromise, timeoutPromise]);
    } catch (searchErr) {
      const msg = (searchErr as Error).message;
      if (msg !== "search_timeout") throw searchErr;
      // On timeout we proceed with empty context — AI will say it couldn't find info
      console.warn("[embed/chat] RAG search timed out, proceeding without context");
    }

    // Deduplicate by snippet prefix and sort by score
    const seen = new Set<string>();
    const dedupedResults = searchResults.filter(r => {
      const key = r.snippet.slice(0, 80).toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Build rich context — include title and full snippet for each source
    const context = dedupedResults.length > 0
      ? dedupedResults
          .slice(0, 6)
          .map((r, i) => `[S${i + 1}] **${r.title}**\n${r.snippet.trim()}`)
          .join("\n\n---\n\n")
      : "No relevant information was found in the knowledge base for this query.";

    const latencyMs = Date.now() - t0;

    // Log analytics (fire-and-forget)
    void logQueryEvent({
      kbId: kb.id,
      queryText: query,
      sourceCount: dedupedResults.length,
      latencyMs,
      sessionId: body.sessionId,
    });

    // Build system prompt from KB config — pass surface:"embed" so the prompt
    // never contains rag_search tool-call instructions (context is pre-injected)
    const systemPrompt = buildSystemPrompt(config, { kbName: kb.name, surface: "embed" });

    const chatMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\nContext from knowledge base:\n${context || "No relevant context found."}`,
      },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Stream the response
    const provider = ProviderFactory.getProvider(providerConfig);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (event: unknown) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

        // Emit sources as first event so callers can display citations
        if (dedupedResults.length > 0) {
          write({
            type: "sources",
            payload: dedupedResults.slice(0, 6).map((r, i) => ({
              index: i + 1,
              title: r.title,
              snippet: r.snippet.slice(0, 200),
              score: r.score,
            })),
          });
        }

        (async () => {
          try {
              const completionStream = provider.chatStream(chatMessages, {
                temperature: resolved.temperature ?? config.temperature,
                maxTokens: resolved.maxTokens ?? config.maxTokens,
              });

            for await (const delta of completionStream) {
              if (delta) write({ type: "token", payload: delta });
            }
          } catch (err) {
            write({ type: "error", payload: (err as Error).message });
          } finally {
            write({ type: "done" });
            controller.close();
          }
        })();
      },
    });

    return new NextResponse(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[embed/chat]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
