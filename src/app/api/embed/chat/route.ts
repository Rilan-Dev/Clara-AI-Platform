import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db/migrate";
import { validateEmbedRequest, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { getAssistantConfigByKb, getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { groundClaraContext, groundingServerTiming } from "@/modules/rag/grounding";
import { buildTurnGuidance } from "@/modules/rag/turn-guidance";
import { ProviderFactory } from "@/modules/ai-core/factory";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";
import { admitQueryEvent, admissionDeniedResponse } from "@/lib/quota-admission";
import type { ChatMessage } from "@/modules/ai-core/types";
import { AIConfigResolutionError, toProviderConfig } from "@/modules/ai-core/resolve";
import { resolveAIConfigCached } from "@/modules/ai-core/resolve-cache";
import { getPlatformDefaultSarvamRealtimeLlmModel } from "@/modules/voice-core/model-catalog";
import {
  noteBrainRequestSucceeded,
  recordBrainRuntimeFailure,
  recordEmbeddingRuntimeFailure,
} from "@/modules/platform-health/core/incidents";
import { encodeNDJSONEvent } from "@/modules/embed/core/ndjson";
import {
  buildConversationAwareSearchQuery,
  buildRecentConversationContextBlock,
  recentMessages,
  withChartInstructions,
} from "@/modules/assistant/api/conversation-context";
import { netTraceError, netTraceRequest } from "@/lib/net-trace";

function publicAIErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("credential") ||
    message.includes("api key") ||
    message.includes("apikey") ||
    message.includes("authorization") ||
    message.includes("bearer ") ||
    (message.includes("provider") && (message.includes("key") || message.includes("secret") || message.includes("token")))
  ) {
    return "This assistant is temporarily unavailable. Please try again later.";
  }
  if (message.includes("rate limit") || message.includes("too many requests") || message.includes("quota")) {
    return "This assistant is busy right now. Please try again in a moment.";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "The assistant took too long to respond. Please try again.";
  }
  return "The assistant could not complete that request. Please try again.";
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Network-tab-style trace (lib/net-trace.ts): summary rows gated by
  // NET_TRACE, failure capture ALWAYS on; responses echo x-request-id so the
  // docker/vercel log row maps 1:1 to the browser devtools Network row.
  const trace = netTraceRequest({
    route: "embed/chat",
    url: "/api/embed/chat",
    headers: req.headers,
  });
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
    // Conversation-aware search text; nothing tenant- or domain-specific.
    const retrievalQuery = buildConversationAwareSearchQuery(messages, query);
    const recentConversationContextBlock = buildRecentConversationContextBlock(messages);
    // Realtime voice is a transport concern: every brain provider gets the
    // spoken-reply guidance, the short retrieval width and the fast-turn
    // model mode (previously only Sarvam did).
    const realtimeVoice = body.realtimeVoice === true;
    trace.setReqBody({ messages: messages.length, sessionId: body.sessionId, realtimeVoice });
    trace.field("kb", ctx.kbId);
    trace.field("org", ctx.orgId);

    // Retrieval starts NOW, alongside the configuration lookups and quota
    // admission below, instead of after them. It reads only the KB bound to
    // the embed credential; nothing is returned to the visitor unless the
    // turn is admitted. This route owns the query event (admitted below,
    // finalised with the answer), so grounding must not log it again.
    const t0 = Date.now();
    const retrievalStart = t0;
    const groundingPromise = groundClaraContext({
      kbId: ctx.kbId,
      query,
      searchQuery: retrievalQuery,
      topK: realtimeVoice ? 4 : 8,
      surface: "embed",
      admission: "external",
      sessionId: body.sessionId ?? null,
      channel: realtimeVoice ? "voice" : "chat",
    }).catch((error: unknown) => {
      // Public widget degrades silently by design — the raw cause is still
      // captured Network-tab style (always on) and the platform admin gets
      // the incident banner + email from the recorder below.
      netTraceError("embed/chat/retrieval", error, {
        stage: "answering without evidence",
        req: trace.id, kb: ctx.kbId,
      });
      void recordEmbeddingRuntimeFailure(error, { surface: "Public widget chat retrieval" });
      return null;
    });

    const [kb, config] = await Promise.all([
      getKnowledgeBaseById(ctx.kbId),
      getAssistantConfigByKb(ctx.kbId),
    ]);
    if (!kb || !config) {
      return NextResponse.json({ error: "KB configuration not found" }, { status: 404, headers: corsHeaders });
    }

    let resolved;
    try {
      resolved = await resolveAIConfigCached({ kbId: ctx.kbId, surface: "chat" });
    } catch (error) {
      if (error instanceof AIConfigResolutionError) {
        const publicMessage = publicAIErrorMessage(error);
        trace.fail(error, { status: 503, resBody: { error: publicMessage } });
        return NextResponse.json(
          { error: publicMessage },
          { status: 503, headers: { ...corsHeaders, "x-request-id": trace.id } },
        );
      }
      throw error;
    }
    if (!resolved.flags.publicEmbedEnabled) {
      return NextResponse.json(
        { error: "Public embed is disabled for this knowledge base" },
        { status: 403, headers: corsHeaders },
      );
    }

    // Sarvam has a dedicated low-latency realtime LLM; other providers keep
    // their configured chat model (a native realtime model is not a chat model).
    const sarvamRealtime = realtimeVoice && resolved.provider === "sarvam";
    const providerConfig = {
      ...toProviderConfig(resolved),
      ...(sarvamRealtime
        ? {
            chatModel:
              resolved.realtimeModel ??
              getPlatformDefaultSarvamRealtimeLlmModel(),
          }
        : {}),
    };
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

    // The same grounding service as the native realtime voices: cross-lingual
    // retrieval, capability handling, KB topics and provider-neutral turn
    // guidance — started above, in parallel with admission.
    const grounding = await groundingPromise;
    if (grounding && !grounding.ok && (grounding.status === 404 || grounding.status === 400)) {
      void finalizeQueryEvent(eventId, { answerText: "", status: "error", latencyMs: Date.now() - t0 });
      return NextResponse.json({ error: grounding.error }, { status: grounding.status, headers: corsHeaders });
    }
    const groundedResult = grounding?.ok ? grounding.result : null;
    console.info("[realtime-latency] retrieval complete", {
      realtimeVoice,
      ms: Date.now() - retrievalStart,
      sourceCount: groundedResult?.sources.length ?? 0,
      timings: groundedResult?.timings,
    });
    void finalizeQueryEvent(eventId, {
      answerText: "",
      status: "pending",
      latencyMs: Date.now() - t0,
      sourceCount: groundedResult?.sources.length ?? 0,
    });

    const seen = new Set<string>();
    const sources = (groundedResult?.sources ?? []).filter((result) => {
      const key = result.snippet.slice(0, 100).toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);

    // A retrieval miss is not a conversation failure. Let the configured provider
    // handle ordinary conversation naturally; the shared system prompt still
    // prevents unsupported factual/domain claims when no evidence is available.

    const provider = ProviderFactory.getProvider(providerConfig);
    const llmStart = Date.now();
    const baseSystemPrompt = buildSystemPrompt(config, {
      kbName: kb.name,
      kbDescription: kb.description,
      surface: "embed",
      allowedLanguages,
      responseLanguage: groundedResult?.responseLanguage ?? null,
    });
    const systemPrompt = withChartInstructions(
      recentConversationContextBlock
        ? `${baseSystemPrompt}\n\n${recentConversationContextBlock}`
        : baseSystemPrompt,
    );

    const guidance =
      groundedResult?.guidance ??
      buildTurnGuidance({
        grounded: false,
        intent: "out_of_scope",
        fallbackReply: config.outOfScopeReply,
        topics: kb.description ?? null,
        channel: realtimeVoice ? "voice" : "chat",
      });
    const evidence = groundedResult?.intent === "capability"
      ? groundedResult.context
      : sources.map((result, index) => `[S${index + 1}] ${result.snippet}`).join("\n\n");
    const context = [guidance, evidence].filter(Boolean).join("\n\n");

    const usageRef: { value: { promptTokens: number; completionTokens: number } | null } = { value: null };
    const completion = provider.chatStream(
      [
        { role: "system", content: systemPrompt },
        ...recentMessages(messages).map((message): ChatMessage => ({
          role: message.role as ChatMessage["role"],
          content: message.content,
        })),
        { role: "system", content: `Knowledge base context:\n${context}` },
      ],
      {
        // The assistant's configured reply length on every surface. A
        // hardcoded 350-token voice cap cut spoken answers off mid-word
        // (Tamil/Indic scripts use several tokens per word); brevity for
        // voice comes from the prompt, not truncation.
        maxTokens,
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
            // Raw provider/edge errors must not reach the visitor — capture
            // Network-tab style (always on) and show the curated event.
            netTraceError("embed/chat/stream", error, {
              req: trace.id, kb: ctx.kbId,
              provider: resolved.provider, model: provider.getModelName("chat"),
            });
            // A dead brain credential (401/429) must reach the platform admin
            // as an incident — banner + email — not just container logs.
            void recordBrainRuntimeFailure(error, {
              surface: "embed chat answer",
              provider: resolved.provider,
              model: provider.getModelName("chat"),
            });
            streamError = publicAIErrorMessage(error);
            safeWrite({ type: "error", payload: streamError });
          } finally {
            // A completed stream proves the brain provider is alive — clear
            // any runtime-failing answer-engine incident (rate-limited no-op).
            if (!streamError) void noteBrainRequestSucceeded(resolved.provider);
            safeWrite({ type: "done" });
            close();
            req.signal.removeEventListener("abort", onAbort);
            // Summary row (NET_TRACE gated) — duration mirrors the Network
            // tab's full stream time; failures above were always captured.
            trace.end({
              status: 200,
              note: streamError ? "stream-error-event" : "stream-complete",
            });
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

    const serverTiming = groundingServerTiming(groundedResult?.timings, "rag-");
    // x-request-id echoes the net-trace correlation id — the browser Network
    // tab row and the docker/vercel log row share the same id.
    return new NextResponse(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        ...(serverTiming ? { "Server-Timing": `${serverTiming}, pre-llm;dur=${llmStart - t0}` } : {}),
        "x-request-id": trace.id,
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    // Unclassified error — raw internals only in the server log (always-on
    // capture); visitors get the sanitized public message + x-request-id.
    const publicMessage = publicAIErrorMessage(error);
    trace.fail(error, {
      status: error instanceof AIConfigResolutionError ? 503 : 500,
      resBody: { error: publicMessage },
    });
    return NextResponse.json(
      { error: publicMessage },
      { status: error instanceof AIConfigResolutionError ? 503 : 500, headers: { "Cache-Control": "no-store", "x-request-id": trace.id } },
    );
  }
}
