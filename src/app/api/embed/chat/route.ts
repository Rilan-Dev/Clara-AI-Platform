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
import { getDemoAIConfig } from "@/modules/ai-core/demo-config";
import {
  buildConversationAwareSearchQuery,
  buildRecentConversationContextBlock,
  withChartInstructions,
} from "@/modules/assistant/api/conversation-context";

function isDemoRequest(req: NextRequest): boolean {
  return (req.headers.get("authorization") ?? "").trim() === "Bearer DEMO_MODE";
}

function isBroadCoverageQuery(query: string): boolean {
  const normalized = query.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return [
    "what does my insurance cover",
    "what does insurance cover",
    "what is covered by my insurance",
    "what does my policy cover",
    "what is my insurance",
    "tell me about my insurance",
    "what insurance do you offer",
    "what policies do you offer",
    "what is omen insurance",
    "what is oman insurance",
    "what is omen united insurance",
    "what is oman united insurance",
    "who is omen united insurance",
    "who is oman united insurance",
  ].some((phrase) => normalized === phrase || normalized.startsWith(`${phrase} `));
}

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
    const isDemo = isDemoRequest(req);

    const body = (await req.json()) as {
      messages?: Array<{ role: string; content: string }>;
      sessionId?: string;
    };
    const messages = (body.messages ?? []).filter(
      (message) => message.role && message.content && typeof message.content === "string",
    );

    if (!messages.length) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400, headers: corsHeaders });
    }
    if (messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json({ error: "Last message must be from user" }, { status: 400, headers: corsHeaders });
    }

    const query = messages[messages.length - 1].content.trim();
    const retrievalQuery = isBroadCoverageQuery(query)
      ? `${query}. Retrieve a broad overview of the insurance products, company information, coverage benefits, exclusions, claims, and policy areas available in the knowledge base. Include relevant home, health, travel, motor, personal accident, and life coverage facts when present.`
      : buildConversationAwareSearchQuery(messages, query);
    const recentConversationContextBlock = buildRecentConversationContextBlock(messages);

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfig(ctx.kbId),
    ]);
    if (!kb || !config) {
      return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });
    }

    const demoConfig = isDemo ? await getDemoAIConfig() : null;
    if (isDemo && !demoConfig) {
      return NextResponse.json(
        { error: "Demo AI provider is not configured. Configure the provider and API key in Platform Admin → Demo." },
        { status: 503, headers: corsHeaders },
      );
    }

    // Demo mode supplies the public API credential, not a second set of runtime
    // model/language settings. Resolve the selected KB through project -> org ->
    // platform precedence so chat and voice use the same effective configuration.
    const resolved = await resolveAIConfig({ kbId: ctx.kbId, surface: "chat" });
    if (!resolved.flags.publicEmbedEnabled) {
      return NextResponse.json({ error: "Public embed is disabled for this knowledge base" }, { status: 403, headers: corsHeaders });
    }
    if (isDemo && demoConfig!.provider !== resolved.provider) {
      return NextResponse.json(
        {
          error: "Demo API provider does not match the selected knowledge base configuration.",
          configuredProvider: resolved.provider,
          demoProvider: demoConfig!.provider,
        },
        { status: 503, headers: corsHeaders },
      );
    }

    const resolvedProviderConfig = toProviderConfig(resolved);
    const providerConfig: ProviderConfig = isDemo
      ? {
          provider: resolved.provider,
          apiKey: demoConfig!.apiKey,
          chatModel: resolved.chatModel,
          embeddingModel: resolved.embeddingModel,
          embeddingDimension: resolvedProviderConfig.embeddingDimension,
        }
      : resolvedProviderConfig;

    const allowedLanguages = resolved.allowedLanguages;
    const maxTokens = resolved.maxTokens ?? config.maxTokens;
    const temperature = resolved.temperature ?? config.temperature;

    console.info("[embed/chat] runtime configuration", {
      demo: isDemo,
      orgId: resolved.orgId ?? ctx.orgId,
      projectId: resolved.projectId,
      kbId: ctx.kbId,
      provider: providerConfig.provider,
      chatModel: providerConfig.chatModel,
      embeddingModel: providerConfig.embeddingModel,
      allowedLanguages,
      defaultLanguage: resolved.defaultLanguage,
      apiKeyConfigured: Boolean(providerConfig.apiKey),
      sources: resolved.sources,
    });

    const t0 = Date.now();
    let searchResults: Awaited<ReturnType<typeof searchKbEmbedded>> = [];
    try {
      const searchPromise = searchKbEmbedded(kb.qdrantCollection, retrievalQuery, 8, { providerConfig });
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("search_timeout")), 15000));
      searchResults = await Promise.race([searchPromise, timeoutPromise]);
    } catch (searchErr) {
      if ((searchErr as Error).message !== "search_timeout") throw searchErr;
      console.warn("[embed/chat] RAG search timed out (>15s)", { kbId: ctx.kbId });
    }

    const seen = new Set<string>();
    const dedupedResults = searchResults.filter((result) => {
      const key = result.snippet.slice(0, 80).toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const context = dedupedResults.length
      ? dedupedResults.slice(0, 6).map((result, index) => `[S${index + 1}] **${result.title}**\n${result.snippet.trim()}`).join("\n\n---\n\n")
      : "No relevant information was found in the knowledge base for this query.";

    const latencyMs = Date.now() - t0;
    void logQueryEvent({
      kbId: kb.id,
      queryText: query,
      sourceCount: dedupedResults.length,
      latencyMs,
      sessionId: body.sessionId,
    });

    const systemPrompt = withChartInstructions(
      buildSystemPrompt(config, {
        kbName: kb.name,
        surface: "embed",
        allowedLanguages,
      }),
    );

    const demoAnswerRule = isDemo
      ? `\n\nDEMO SCOPE REQUIREMENT: This is the public Omen United Insurance demo. The retrieved context is authoritative evidence that the visitor's question is in scope whenever it contains relevant insurance/company information. Treat "Omen", "Oman", "Omen United", and "Oman United Insurance" as valid references to the configured Omen United Insurance knowledge base, including minor spelling mistakes. If retrieved sources contain relevant facts, answer the question directly from those sources. NEVER output the configured out-of-scope reply when relevant sources are present. For questions such as "what is omen insurance", explain what the company/insurance is using the retrieved facts rather than refusing or asking the visitor to choose a policy.`
      : "";

    const chatMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${systemPrompt}${demoAnswerRule}\n\nContext from knowledge base:\n${context}${recentConversationContextBlock ? `\n\n${recentConversationContextBlock}` : ""}`,
      },
      ...messages.map((message) => ({ role: message.role as "user" | "assistant", content: message.content })),
    ];

    const provider = ProviderFactory.getProvider(providerConfig);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        if (dedupedResults.length) {
          write({
            type: "sources",
            payload: dedupedResults.slice(0, 6).map((result, index) => ({
              index: index + 1,
              title: result.title,
              snippet: result.snippet.slice(0, 200),
              score: result.score,
            })),
          });
        }

        (async () => {
          try {
            const completionStream = provider.chatStream(chatMessages, {
              temperature,
              maxTokens,
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
      headers: { ...corsHeaders, "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[embed/chat]:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}