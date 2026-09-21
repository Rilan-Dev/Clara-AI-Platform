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
import { getPlatformDefaultSarvamRealtimeLlmModel } from "@/modules/voice-core/model-catalog";
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
      realtimeVoice?: boolean;
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

    const realtimeVoice = body.realtimeVoice === true && resolved.provider === "sarvam";
    const providerConfig = {
      ...toProviderConfig(resolved),
      ...(realtimeVoice
        ? {
            chatModel:
              resolved.realtimeModel ??
              getPlatformDefaultSarvamRealtimeLlmModel(),
          }
        : {}),
    };
    const embeddingConfig = toProviderConfig(resolved, "embedding");
    if (!providerConfig.apiKey) {
      const envName =
        resolved.provider === "openai" ? "OPENAI_API_KEY"
        : resolved.provider === "gemini" ? "GEMINI_API_KEY"
        : "SARVAM_API_KEY";
      return NextResponse.json(
        { error: `${resolved.provider} is selected for this tenant, but ${envName} is not configured on the server.` },
        { status: 503, headers: corsHeaders },
      );
    }

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
      realtimeVoice,
    });

    const t0 = Date.now();
    const retrievalStart = t0;

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
      const searchPromise = searchKbEmbedded(
        resolved.knowledgeCollection ?? kb.qdrantCollection,
        retrievalQuery,
        realtimeVoice ? 4 : 8,
        { providerConfig: embeddingConfig, realtimeVoice },
      );
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("search_timeout")), 15000));
      searchResults = await Promise.race([searchPromise, timeoutPromise]);
      console.info("[realtime-latency] retrieval complete", { realtimeVoice, ms: Date.now() - retrievalStart, sourceCount: searchResults.length });
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

    // Strict grounding boundary: no sufficiently relevant evidence means the
    // provider must not be asked to answer from general knowledge.
    if (sources.length === 0 && config.strictMode !== false) {
      const reply =
        config.outOfScopeReply?.trim() ||
        "I can only answer questions about the topics I have been set up for.";
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const write = (event: { type: string; payload?: unknown }) =>
            controller.enqueue(encoder.encode(encodeNDJSONEvent(event)));
          if (quotaWarning) write({ type: "quota_warning", payload: quotaWarning });
          write({ type: "token", payload: reply });
          write({ type: "done" });
          controller.close();
        },
      });
      void finalizeQueryEvent(eventId, {
        answerText: reply,
        status: "ok",
        latencyMs: Date.now() - t0,
        sourceCount: 0,
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
    }

    const provider = ProviderFactory.getProvider(providerConfig);
    const llmStart = Date.now();
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
      {
        maxTokens: realtimeVoice
          ? Math.min(maxTokens ?? 350, 350)
          : maxTokens,
        temperature,
        reasoningEffort: realtimeVoice ? null : undefined,
        onUsage: (u) => { usageRef.value = u; },
      },
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const safeWrite = (event: { type: string; payload?: unknown }) => {
          if (closed || req.signal.aborted) return false;
          try {
            controller.enqueue(encoder.encode(encodeNDJSONEvent(event)));
            return true;
          } catch {
            closed = true;
            return false;
          }
        };
        const close = () => {
          if (closed) return;
          closed = true;
          try { controller.close(); } catch {}
        };
        const onAbort = () => {
          closed = true;
          try { controller.close(); } catch {}
        };
        req.signal.addEventListener("abort", onAbort, { once: true });

        if (sources.length > 0) {
          safeWrite({
            type: "sources",
            payload: sources.map((result, index) => ({
              index: index + 1,
              title: result.title,
              snippet: result.snippet.slice(0, 200),
              score: result.score,
            })),
          });
        }

        if (quotaWarning) {
          safeWrite({ type: "quota_warning", payload: quotaWarning });
        }

        void (async () => {
          let answerBuffer = "";
          let streamError: string | null = null;
          try {
            for await (const chunk of completion) {
              if (chunk) {
                if (answerBuffer.length === 0) {
                  console.info("[realtime-latency] first LLM token", { realtimeVoice, ms: Date.now() - llmStart });
                }
                answerBuffer += chunk;
                if (!safeWrite({ type: "token", payload: chunk })) break;
              }
            }
          } catch (error) {
            console.error("[embed/chat] provider stream failed", error);
            streamError = error instanceof Error ? error.message : "AI provider stream failed";
            safeWrite({ type: "error", payload: streamError });
          } finally {
            safeWrite({ type: "done" });
            close();
            req.signal.removeEventListener("abort", onAbort);
            console.info("[realtime-latency] stream complete", {
              realtimeVoice,
              ms: Date.now() - llmStart,
              totalMs: Date.now() - t0,
              chars: answerBuffer.length,
            });
            void finalizeQueryEvent(eventId, {
              answerText: answerBuffer,
              status: streamError ? "error" : "ok",
              metering: {
                model: resolved.chatModel ?? provider.getModelName("chat"),
                provider: resolved.provider,
                promptTokens: usageRef.value?.promptTokens ?? 0,
                completionTokens: usageRef.value?.completionTokens ?? 0,
              },
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
