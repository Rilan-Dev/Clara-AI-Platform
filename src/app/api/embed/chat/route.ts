import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { validateEmbedRequest, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { getAssistantConfigByKb, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { searchKbEmbedded } from "@/modules/embed/core/search";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";
import { admitQueryEvent, admissionDeniedResponse } from "@/lib/quota-admission";
import type { ChatMessage } from "@/modules/ai-core/types";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import { encodeNDJSONEvent } from "@/modules/embed/core/ndjson";
import {
  buildConversationAwareSearchQuery,
  buildRecentConversationContextBlock,
  withChartInstructions,
} from "@/modules/assistant/api/conversation-context";

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
      getAssistantConfigByKb(ctx.kbId),
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
    if (!providerConfig.apiKey) {
      const envName = resolved.provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
      return NextResponse.json(
        { error: `${resolved.provider} is selected for this tenant, but ${envName} is not configured on the server.` },
        { status: 503, headers: corsHeaders },
      );
    }

    // ── WS-1.2: atomic quota admission (org-wide, rolling 24h) ────────────
    // Advisory-locked check-and-insert: concurrent embed requests cannot race
    // past the limit, and quota state cannot diverge from the audit trail.
    // Enforced before retrieval/LLM work so over-limit orgs cost nothing.

    const allowedLanguages = resolved.allowedLanguages;
    const maxTokens = resolved.maxTokens ?? config.maxTokens;
    const temperature = resolved.temperature ?? config.temperature;

    console.info("[embed/chat] runtime configuration", {
      orgId: resolved.orgId ?? ctx.orgId,
      projectId: resolved.agentId,
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

    // Audit trail + daily quota, atomically admitted (status='pending') so
    // the prompt is audited, the quota counts even when retrieval later
    // fails, and a crossing of 80% of the daily limit carries a warning the
    // widget can surface as a dismissible banner.
    const admission = await admitQueryEvent({
      kbId: ctx.kbId,
      queryText: query,
      sessionId: body.sessionId,
      orgId: ctx.orgId,
      surface: "embed",
    });
    if (!admission.admitted) {
      return admissionDeniedResponse(admission) as NextResponse;
    }
    const eventId = admission.eventId;
    const quotaWarning = admission.warning;

    let searchResults: Awaited<ReturnType<typeof searchKbEmbedded>> = [];
    try {
      const searchPromise = searchKbEmbedded(kb.qdrantCollection, retrievalQuery, 8, { providerConfig });
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("search_timeout")), 15000));
      searchResults = await Promise.race([searchPromise, timeoutPromise]);
      void finalizeQueryEvent(eventId, { answerText: "", status: "pending", latencyMs: Date.now() - t0, sourceCount: searchResults.length });
    } catch (searchErr) {
      if ((searchErr as Error).message !== "search_timeout") {
        console.error("[embed/chat] RAG search failed", searchErr);
        void finalizeQueryEvent(eventId, { answerText: "", status: "error", latencyMs: Date.now() - t0 });
        return NextResponse.json(
          { error: "Knowledge-base search failed. Please verify the embedding configuration and try again." },
          { status: 502, headers: corsHeaders },
        );
      }
      console.warn("[embed/chat] RAG search timed out (>15s)", { kbId: ctx.kbId });
    }

    const seen = new Set<string>();
    const sources = searchResults.filter((result) => {
      const key = result.snippet.slice(0, 100).toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);

    const provider = ProviderFactory.getProvider(providerConfig);
    const baseSystemPrompt = buildSystemPrompt(config, {
      kbName: kb.name,
      surface: "embed",
      allowedLanguages,
    });
    const systemPrompt = withChartInstructions(
      recentConversationContextBlock
        ? `${baseSystemPrompt}\n\n${recentConversationContextBlock}`
        : baseSystemPrompt,
    );

    const context = sources.length
      ? sources.map((result, index) => `[S${index + 1}] ${result.snippet}`).join("\n\n")
      : "No relevant information was found in the knowledge base for this query.";

    // WS-1.1: provider-reported token usage for the usage-event spine.
    // (Ref object — TS narrows a closure-written `let` to null at read time.)
    const usageRef: { value: { promptTokens: number; completionTokens: number } | null } = { value: null };
    const completion = provider.chatStream(
      [
        { role: "system", content: systemPrompt },
        ...messages.map((message): ChatMessage => ({
          role: message.role as ChatMessage["role"],
          content: message.content,
        })),
        { role: "system", content: `Knowledge base context:\n${context}` },
      ],
      { maxTokens, temperature, onUsage: (u) => { usageRef.value = u; } },
    );

    // Voice flows that surface sources to the customer are already covered by
    // the request-time insert above — the stream finalises the answer.

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (event: { type: string; payload?: unknown }) => {
          controller.enqueue(encoder.encode(encodeNDJSONEvent(event)));
        };

        if (sources.length > 0) {
          write({
            type: "sources",
            payload: sources.map((result, index) => ({
              index: index + 1,
              title: result.title,
              snippet: result.snippet.slice(0, 200),
              score: result.score,
            })),
          });
        }

        // WS-1.2: 80% soft warning — the widget renders a dismissible banner.
        if (quotaWarning) {
          write({ type: "quota_warning", payload: quotaWarning });
        }

        void (async () => {
          let answerBuffer = "";
          let streamError: string | null = null;
          try {
            for await (const chunk of completion) {
              if (chunk) {
                answerBuffer += chunk;
                write({ type: "token", payload: chunk });
              }
            }
          } catch (error) {
            console.error("[embed/chat] provider stream failed", error);
            streamError = error instanceof Error ? error.message : "AI provider stream failed";
            write({ type: "error", payload: streamError });
          } finally {
            write({ type: "done" });
            controller.close();
            // Persist the AI-generated answer + metering for the platform
            // audit trail and the usage-event spine.
            void finalizeQueryEvent(eventId, {
              answerText: answerBuffer,
              status: streamError ? "error" : "ok",
              metering: {
                model: resolved.chatModel ?? provider.getModelName("chat"),
                provider: resolved.provider,
                promptTokens: usageRef.value?.promptTokens ?? 0,
                completionTokens: usageRef.value?.completionTokens ?? 0,
              },
              // WS-1.5: user stopped the stream — partial answer, cancelled flag.
              cancelled: req.signal.aborted,
            });
          }
        })();
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[embed/chat] request failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
