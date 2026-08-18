/**
 * POST /api/embed/chat
 * OPTIONS /api/embed/chat
 * Public visitor chat endpoint. Demo traffic uses the Platform Admin -> Demo
 * provider for generation while preserving the KB's configured embedding
 * provider for vector retrieval.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { validateEmbedRequest, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { getAssistantConfig, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { searchKbEmbedded } from "@/modules/embed/core/search";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { logQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";
import type { ChatMessage, ProviderConfig } from "@/modules/ai-core/types";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import { getPlatformEnvSettings } from "@/modules/phone/core/db";
import {
  buildConversationAwareSearchQuery,
  buildRecentConversationContextBlock,
  withChartInstructions,
} from "@/modules/assistant/api/conversation-context";

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
    const retrievalQuery = buildConversationAwareSearchQuery(messages, query);
    const recentConversationContextBlock = buildRecentConversationContextBlock(messages);

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

    // Keep retrieval on the KB/org's configured embedding provider. This is
    // important because Qdrant vectors must be queried with the same embedding
    // space used during ingestion. Demo provider selection only controls the
    // final answer generation.
    const ragProviderConfig = toProviderConfig(resolved);
    let providerConfig: ProviderConfig = ragProviderConfig;

    if (ctx.keyId === "demo-key") {
      const settings = await getPlatformEnvSettings();
      const demoProvider =
        settings.find((s) => s.key === "DEMO_AI_PROVIDER")?.value?.trim().toLowerCase() ||
        process.env.DEMO_AI_PROVIDER?.trim().toLowerCase() ||
        "gemini";

      if (demoProvider === "gemini") {
        const demoApiKey =
          settings.find((s) => s.key === "DEMO_GEMINI_API_KEY")?.value?.trim() ||
          process.env.DEMO_GEMINI_API_KEY?.trim() ||
          process.env.GEMINI_API_KEY?.trim();
        if (!demoApiKey) {
          return NextResponse.json(
            { error: "Demo Gemini API key is not configured. Set DEMO_GEMINI_API_KEY in Platform Admin → Demo." },
            { status: 503, headers: corsHeaders },
          );
        }
        providerConfig = {
          provider: "gemini",
          apiKey: demoApiKey,
          chatModel:
            settings.find((s) => s.key === "DEMO_GEMINI_CHAT_MODEL")?.value?.trim() ||
            process.env.DEMO_GEMINI_CHAT_MODEL?.trim() ||
            process.env.GEMINI_CHAT_MODEL ||
            "gemini-2.5-flash",
          // Embedding values are intentionally not used for the generation
          // provider; ragProviderConfig owns vector retrieval.
          embeddingModel: undefined,
          embeddingDimension: undefined,
        };
      } else {
        const demoApiKey =
          settings.find((s) => s.key === "DEMO_OPENAI_API_KEY")?.value?.trim() ||
          process.env.DEMO_OPENAI_API_KEY?.trim();
        if (!demoApiKey) {
          return NextResponse.json(
            { error: "Demo OpenAI API key is not configured. Set DEMO_OPENAI_API_KEY in Platform Admin → Demo." },
            { status: 503, headers: corsHeaders },
          );
        }
        providerConfig = { ...ragProviderConfig, provider: "openai", apiKey: demoApiKey };
      }
    }

    const t0 = Date.now();
    let searchResults: Awaited<ReturnType<typeof searchKbEmbedded>> = [];
    try {
      const searchPromise = searchKbEmbedded(kb.qdrantCollection, retrievalQuery, 8, {
        providerConfig: ragProviderConfig,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("search_timeout")), 15000)
      );
      searchResults = await Promise.race([searchPromise, timeoutPromise]);
    } catch (searchErr) {
      const msg = (searchErr as Error).message;
      if (msg !== "search_timeout") throw searchErr;
      console.warn("[embed/chat] RAG search timed out (>15s), proceeding without context");
    }

    const seen = new Set<string>();
    const dedupedResults = searchResults.filter(r => {
      const key = r.snippet.slice(0, 80).toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const context = dedupedResults.length > 0
      ? dedupedResults
          .slice(0, 6)
          .map((r, i) => `[S${i + 1}] **${r.title}**\n${r.snippet.trim()}`)
          .join("\n\n---\n\n")
      : "No relevant information was found in the knowledge base for this query.";

    const latencyMs = Date.now() - t0;

    void logQueryEvent({
      kbId: kb.id,
      queryText: query,
      sourceCount: dedupedResults.length,
      latencyMs,
      sessionId: body.sessionId,
    });

    const systemPrompt = withChartInstructions(buildSystemPrompt(config, { kbName: kb.name, surface: "embed" }));
    const chatMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\nContext from knowledge base:\n${context || "No relevant context found."}${recentConversationContextBlock ? `\n\n${recentConversationContextBlock}` : ""}`,
      },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const provider = ProviderFactory.getProvider(providerConfig);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (event: unknown) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

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
