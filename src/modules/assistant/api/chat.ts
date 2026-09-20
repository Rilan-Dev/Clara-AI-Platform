import { TextEncoder } from "node:util";

import { NextRequest, NextResponse } from "next/server";

import { ProviderFactory } from "@/modules/ai-core/factory";
import type { ChatMessage } from "@/modules/ai-core/types";
import {
  embedQuery,
  searchSimilarDocuments,
  getDocumentById,
  type DocumentRecord,
} from "@/modules/admin/core";
import {
  assistantPrompts,
  buildLanguageGuidance,
  resolveLanguagePreferences,
} from "@/modules/assistant/core/config";
import { getKnowledgeBaseById, getAssistantConfigByKb } from "@/modules/knowledge-bases/core/db";
import { searchKbEmbedded } from "@/modules/embed/core/search";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";
import { getPlatformDefaultSarvamRealtimeLlmModel } from "@/modules/voice-core/model-catalog";
import { admitQueryEvent, admissionDeniedResponse } from "@/lib/quota-admission";
import { hit, rateLimitResponse, CHAT_RATE } from "@/lib/rate-limit";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { getAuthContext } from "@/modules/auth/core/rbac";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import { SentenceTranslator, translateQueryForRag } from "@/modules/language-core/pipeline";
import { toTranslateLanguageCode } from "@/modules/language-core/model-catalog";
import {
  CHART_RESPONSE_INSTRUCTIONS,
  buildConversationAwareSearchQuery,
  buildRecentConversationContextBlock,
  withChartInstructions,
} from "@/modules/assistant/api/conversation-context";

// ── P1 FIX: Read max-tokens from env (was hardcoded 500) ──────────────────────
//
// 500 tokens covers ~375 words — too short for detailed insurance answers that
// must cite multiple policy clauses or walk through a multi-step claims process.
// The env var OPENAI_CHAT_MAX_TOKENS defaults to 1500 if not set.
const CHAT_MAX_TOKENS: number = (() => {
  const raw = Number(process.env.OPENAI_CHAT_MAX_TOKENS ?? "1500");
  return Number.isFinite(raw) && raw > 0 ? raw : 1500;
})();

// ── P2 FIX: Substantial-answer threshold for citation validation ───────────────
//
// Old behaviour: every streamed answer without [S1]-style citation tags had the
// "I couldn't find supporting context" fallback appended — including valid
// 800-char policy explanations that simply didn't use citation syntax.
//
// New behaviour: if the buffered answer is >= SUBSTANTIAL_ANSWER_THRESHOLD chars
// it is treated as a complete response even without citation tags. The fallback
// is only appended when the answer is very short AND no valid citation is found.
const SUBSTANTIAL_ANSWER_THRESHOLD = 60;

type ClientMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function normaliseSuggestions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const result: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    result.push(trimmed);
    if (result.length >= 5) break;
  }
  return result;
}

// ── Phase 6.4: chat rate limit (60 req / min / org) ──────────────────────────
// Returns a 429 response when the caller's org (or IP, when the org cannot
// be resolved) has exceeded the per-minute chat budget, else null.
function chatRateGate(orgId: string | null, request: NextRequest): NextResponse | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip") ?? "unknown";
  const key = `chat:${orgId ? `org:${orgId}` : `ip:${ip}`}`;
  const gate = hit(key, CHAT_RATE.limit, CHAT_RATE.windowMs);
  if (!gate.allowed) {
    const rl = rateLimitResponse(
      gate.retryAfterSec,
      "Chat request limit reached. Please try again shortly."
    );
    return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
  }
  return null;
}

function buildFriendlyFallbackMessage(
  document: DocumentRecord,
  suggestions: string[],
  customIntro?: string
): string {
  const lines: string[] = [];
  lines.push(`Hi! I'm here to help with "${document.title}".`);
  lines.push(
    customIntro ||
      "That question doesn't seem to match anything in the selected document."
  );
  const trimmedSuggestions = suggestions.slice(0, 4);
  if (trimmedSuggestions.length > 0) {
    lines.push(
      `Try asking about:\n${trimmedSuggestions.map((s) => `- ${s}`).join("\n")}`
    );
  } else {
    lines.push(
      "Try asking about key sections, decisions, or data points from this document."
    );
  }
  return lines.join("\n\n");
}

function formatMetadata(
  payload: Record<string, unknown> | undefined
): string {
  if (!payload) return "";
  const entries = Object.entries(payload)
    .filter(
      ([key, value]) =>
        key !== "chunk" && value !== undefined && value !== null && value !== ""
    )
    .map(([key, value]) => {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        return `${key}: ${String(value)}`;
      }
      try {
        return `${key}: ${JSON.stringify(value)}`;
      } catch {
        return `${key}: [unserializable]`;
      }
    });
  return entries.join("; ");
}

function validateMessages(input: unknown): ClientMessage[] {
  if (!Array.isArray(input)) throw new Error("`messages` must be an array.");
  return input.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("role" in item) ||
      !("content" in item)
    ) {
      throw new Error("Each message must include `role` and `content`.");
    }
    const role = (item as { role: unknown }).role;
    const content = (item as { content: unknown }).content;
    if (role !== "user" && role !== "assistant" && role !== "system") {
      throw new Error("Message role must be `user`, `assistant`, or `system`.");
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Message content must be a non-empty string.");
    }
    return { role, content: content.trim() };
  });
}

// ── Mode A: KB-aware chat handler ─────────────────────────────────────────────
// Uses the KB's AssistantConfig for system prompt and its Qdrant collection
// for retrieval. This powers the workspace when a KB is selected instead of
// a legacy document.

/**
 * Retrieval/embedding provider failure inside the chat pipeline.
 *
 * Thrown (typed) so the outer handler can return the friendly 502 instead of
 * leaking raw provider/edge errors (which can reference regions, keys or
 * upstream internals) to workspace users — mirrors the /api/embed/search
 * error-hygiene contract.
 */
class ChatRetrievalError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "ChatRetrievalError";
    this.cause = cause;
  }
}

async function postChatKb(
  request: NextRequest,
  kbId: string,
  messages: ClientMessage[],
  body: Record<string, unknown>
): Promise<NextResponse> {
  await ensureMigrated();

  if (messages.length === 0) throw new Error("At least one message is required.");
  const latest = messages[messages.length - 1]!;
  if (latest.role !== "user") throw new Error("The final message must come from the user.");

  const [kb, config, resolved] = await Promise.all([
    getKnowledgeBaseById(kbId),
    getAssistantConfigByKb(kbId),
    resolveAIConfig({ kbId, surface: "chat" }),
  ]);
  if (!kb)     throw new Error("Knowledge base not found.");
  if (!config) throw new Error("Knowledge base configuration not found.");
  if (kb.status !== "active") throw new Error("Knowledge base is archived.");

  // ── WS-1.2: atomic quota admission (org-wide, rolling 24h) ─────────────
  // ONE transaction: advisory-lock the org, resolve limits, count the window,
  // then INSERT the pending audit row — check-and-increment cannot race, and
  // quota state can never diverge from the audit trail.
  // Enforced BEFORE any retrieval/LLM work so over-limit orgs cost nothing.
  // (Named dbQuery — `query` below shadows it with the chat question text.)
  const orgRows = await dbQuery<{ org_id: string }>(
    `SELECT a.org_id FROM agents a JOIN knowledge_bases kb2 ON kb2.agent_id = a.id WHERE kb2.id = $1`,
    [kbId]
  );
  const orgId = orgRows[0]?.org_id ?? null;

  // Phase 6.4: per-org chat rate limit — enforced BEFORE the quota admission
  // transaction so over-rate traffic never touches the advisory lock.
  const chatGated = chatRateGate(orgId, request);
  if (chatGated) return chatGated;

  // Audit context — workspace chat is authenticated; the question is still
  // logged for anonymous surfaces (user_id NULL).
  const authCtx = await getAuthContext(request).catch(() => null);

  const query = latest.content;
  const t0 = Date.now();

  // ── V4 cross-lingual RAG: identify + normalize + translate the query into
  // the KB language when the org opted in (translation_mode). Zero vendor
  // calls when mode='off' or the kill switch is off; every failure degrades
  // gracefully to the untranslated path. ──
  const crossLingual = await translateQueryForRag({
    query,
    translationMode: resolved.translationMode,
    targetLanguage: config.alwaysRespondIn ?? config.defaultLanguage ?? resolved.defaultLanguage,
    orgId,
    kbId,
    agentId: resolved.agentId,
  });
  const retrievalQuery = buildConversationAwareSearchQuery(messages, crossLingual.effectiveQuery);
  const recentConversationContextBlock = buildRecentConversationContextBlock(messages);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;

  console.log(`[chat/kb] kbId=${kbId} query="${query.slice(0, 100)}"`);

  // Analytics + audit trail + daily quota, atomically admitted:
  //   • the prompt is audited even when retrieval or the LLM later fails
  //   • the daily quota counts immediately (no abort-the-stream bypass)
  //   • concurrent requests cannot race past the limit (advisory lock)
  //   • crossing 80% of the daily limit streams a soft warning banner
  // Finalised with the AI answer + metering once the stream completes.
  const admission = await admitQueryEvent({
    orgId, kbId, queryText: query, sessionId,
    userId: authCtx?.user.id ?? null, surface: "workspace",
  });
  if (!admission.admitted) {
    return admissionDeniedResponse(admission);
  }
  const eventId = admission.eventId;
  const quotaWarning = admission.warning;

  // RAG search across the full KB collection. The retrieval embedding runs
  // on the embedding backbone (V1 split — a Sarvam brain keeps its Qdrant
  // collections on OpenAI/Gemini embeddings); the answer stream runs on the
  // brain provider below.
  const realtimeVoice = body?.realtimeVoice === true && resolved.provider === "sarvam";
  const providerConfig = {
    ...toProviderConfig(resolved),
    ...(realtimeVoice ? { chatModel: getPlatformDefaultSarvamRealtimeLlmModel() } : {}),
  };
  const embeddingConfig = toProviderConfig(resolved, "embedding");
  let results: Awaited<ReturnType<typeof searchKbEmbedded>>;
  try {
    results = await searchKbEmbedded(kb.qdrantCollection, retrievalQuery, 6, {
      providerConfig: embeddingConfig,
    });
  } catch (searchErr) {
    // Retrieval failed — mark the audit row as an error, then surface it.
    void finalizeQueryEvent(eventId, {
      answerText: "", status: "error",
      latencyMs: Date.now() - t0,
    });
    throw new ChatRetrievalError(searchErr);
  }
  const latencyMs = Date.now() - t0;
  void finalizeQueryEvent(eventId, {
    answerText: "", status: "pending", latencyMs, sourceCount: results.length,
  });

  const context = results
    .map((r, i) => `[S${i + 1}] ${r.title}\n${r.snippet}`)
    .join("\n\n");

  const systemPrompt = withChartInstructions(buildSystemPrompt(config, { kbName: kb.name }));
  const chatMessages: ChatMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\nContext from knowledge base:\n${context || "No relevant context found for this query."}${recentConversationContextBlock ? `\n\n${recentConversationContextBlock}` : ""}`,
    },
    ...messages.map((m): ChatMessage => ({ role: m.role, content: m.content })),
  ];
  // Cross-lingual context: when the query was translated, give the model
  // the translation it actually retrieved with (the last user message stays
  // in the user's own words for tone/persona continuity).
  if (crossLingual.translated && chatMessages.length >= 2) {
    const lastUser = chatMessages[chatMessages.length - 1]!;
    if (lastUser.role === "user") {
      lastUser.content =
        `${crossLingual.effectiveQuery}\n\n(User asked in ${crossLingual.userLanguage ?? "their language"}: ${crossLingual.originalQuery.trim()})`;
    }
  }

  const sources = results.map((r, i) => ({
    id: r.id,
    title: r.title,
    snippet: r.snippet.slice(0, 300),
    score: r.score,
    index: i + 1,
  }));

  const encoder = new TextEncoder();
  const provider = ProviderFactory.getProvider(providerConfig);
  // V4 query+answer mode: sentence-wise translation of the streamed
  // answer back into the user's language. Null in every other mode —
  // the token loop below is then byte-identical to the previous path.
  const answerTranslator =
    resolved.translationMode === "query+answer" &&
    crossLingual.translated &&
    crossLingual.userLanguage &&
    crossLingual.targetLanguageCode
      ? new SentenceTranslator({
          sourceLanguageCode: crossLingual.targetLanguageCode,
          targetLanguageCode: toTranslateLanguageCode(crossLingual.userLanguage),
          orgId,
          kbId,
          agentId: resolved.agentId,
        })
      : null;
  const baseHeaders = {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-store",
  } as const;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      // Emit KB metadata + sources immediately
      write({ type: "kb", payload: { id: kb.id, name: kb.name } });
      write({ type: "sources", payload: sources });

      // WS-1.2: 80% soft warning — the client renders a dismissible banner.
      if (quotaWarning) {
        write({ type: "quota_warning", payload: quotaWarning });
      }

      (async () => {
        let answerBuffer = "";
        let streamError: string | null = null;
        const streamT0 = Date.now();
        // Token emitter shared by the direct path and the V4 sentence
        // translator (query+answer mode) — declared here so the finally
        // flush can reuse it.
        const emitToken = (text: string) => {
          answerBuffer += text;
          write({ type: "token", payload: text });
        };
        // WS-1.1: provider-reported token usage for the usage-event spine.
        // (Ref object — TS narrows a closure-written `let` to null at read time.)
        const usageRef: { value: { promptTokens: number; completionTokens: number } | null } = { value: null };
        try {
          const completionStream = provider.chatStream(chatMessages, {
            temperature: resolved.temperature ?? config.temperature,
            maxTokens: resolved.maxTokens ?? config.maxTokens,
            onUsage: (u) => { usageRef.value = u; },
          });
          for await (const delta of completionStream) {
            if (delta) {
              if (answerTranslator) {
                answerTranslator.push(delta, emitToken);
              } else {
                emitToken(delta);
              }
            }
          }
        } catch (err) {
          streamError = (err as Error).message;
          // Raw provider/edge errors must not reach the client (they can
          // reference regions, keys or upstream internals) — log them, show a
          // friendly event. The audit row keeps the error status either way.
          console.error("[chat] stream failed:", streamError);
          write({ type: "error", payload: "The assistant could not complete the answer. Please try again in a moment." });
        } finally {
          // V4: flush pending sentence translations BEFORE closing the
          // stream — done-event ordering stays intact.
          if (answerTranslator) {
            try {
              await answerTranslator.finish(emitToken);
            } catch (flushErr) {
              console.warn("[chat] answer translation flush failed:", (flushErr as Error).message);
            }
          }
          // Persist the AI-generated answer + metering for the platform
          // audit trail and the usage-event spine.
          void finalizeQueryEvent(eventId, {
            answerText: answerBuffer,
            status: streamError ? "error" : "ok",
            latencyMs: Date.now() - streamT0,
            metering: {
              model: resolved.chatModel ?? provider.getModelName("chat"),
              provider: resolved.provider,
              promptTokens: usageRef.value?.promptTokens ?? 0,
              completionTokens: usageRef.value?.completionTokens ?? 0,
            },
            // WS-1.5: user stopped the stream — partial answer, cancelled flag.
            cancelled: request.signal.aborted,
          });
          write({ type: "done" });
          controller.close();
        }
      })();
    },
  });

  return new NextResponse(stream, { headers: baseHeaders });
}

export async function postChat(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const messages = validateMessages(body?.messages);

    // ── Mode A: KB-aware chat ─────────────────────────────────────────────────
    // Accepts kbId — searches across all docs in the KB, uses KB's AssistantConfig
    // for the system prompt. This is the workspace "KB mode".
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : undefined;
    if (kbId) {
      return await postChatKb(request, kbId, messages, body);
    }

    // ── Mode B: Legacy document-scoped chat (unchanged) ───────────────────────
    const documentId =
      typeof body?.documentId === "string" ? body.documentId : undefined;
    const overview =
      typeof body?.overview === "string" ? body.overview.trim() : "";
    const suggestions = normaliseSuggestions(body?.suggestedPrompts);
    const languagePreferences = resolveLanguagePreferences({
      assistant:
        typeof body?.assistantLanguage === "string"
          ? body.assistantLanguage
          : undefined,
      customer: Array.isArray(body?.customerLanguages)
        ? body.customerLanguages
        : undefined,
    });
    const languageGuidance = buildLanguageGuidance(languagePreferences);

    if (messages.length === 0)
      throw new Error("At least one message is required.");
    if (!documentId)
      throw new Error("documentId is required to perform retrieval.");

    const latest = messages[messages.length - 1]!;
    if (latest.role !== "user")
      throw new Error("The final message must come from the user.");

    const documentRecord = await getDocumentById(documentId);
    if (!documentRecord)
      throw new Error("The requested document is not available.");
    // ── WS-1.2: close the Mode-B bypass ────────────────────────────────────
    // Legacy document-scoped chat previously skipped BOTH the daily request
    // quota and the query audit trail — an enforcement hole. Workspace chat
    // is authenticated, so the caller's org membership supplies quota
    // attribution; the audit row is inserted with kb_id NULL (legacy
    // documents live in the Qdrant catalog, not in knowledge_bases).
    const modeBAuth = await getAuthContext(request).catch(() => null);
    let modeBOrgId: string | null = null;
    if (modeBAuth && !modeBAuth.user.isSuperAdmin) {
      const modeBOrgRows = await dbQuery<{ org_id: string }>(
        `SELECT om.org_id FROM org_members om WHERE om.user_id = $1 ORDER BY om.created_at ASC LIMIT 1`,
        [modeBAuth.user.id]
      );
      modeBOrgId = modeBOrgRows[0]?.org_id ?? null;
    }

    // Phase 6.4: per-org chat rate limit (Mode B).
    const modeBGated = chatRateGate(modeBOrgId, request);
    if (modeBGated) return modeBGated;

    const modeBAdmission = await admitQueryEvent({
      orgId: modeBOrgId,
      kbId: null,
      queryText: latest.content,
      userId: modeBAuth?.user.id ?? null,
      surface: "workspace",
    });
    if (!modeBAdmission.admitted) {
      return admissionDeniedResponse(modeBAdmission);
    }
    const modeBEventId = modeBAdmission.eventId;
    const modeBQuotaWarning = modeBAdmission.warning;

    const query = latest.content;
    console.log(
      `[chat] retrieval start docId=${documentRecord.id} ` +
        `collection=${documentRecord.collectionName} ` +
        `query="${query.slice(0, 120)}" maxTokens=${CHAT_MAX_TOKENS}`
    );
    const embedding = await embedQuery(query).catch((embedErr) => {
      // Provider failure during the Mode-B retrieval — same typed wrap so the
      // outer handler returns the friendly 502 (never the raw provider text).
      throw new ChatRetrievalError(embedErr);
    });
    const retrieved = await searchSimilarDocuments(
      documentRecord.collectionName,
      embedding,
      4
    );
    console.log(
      `[chat] retrieval done hits=${retrieved.length} docId=${documentRecord.id}`
    );

    const contextSegments: string[] = [];
    if (overview) contextSegments.push(overview);

    const retrievedContext = retrieved
      .map((doc, index) => {
        const lines: string[] = [`[S${index + 1}] ${doc.title}`];
        const meta = formatMetadata(doc.payload);
        if (meta) lines.push(`Metadata: ${meta}`);
        const snippet = doc.snippet.trim();
        lines.push(
          snippet.length > 0
            ? `Snippet: ${snippet}`
            : "Snippet: [No extractable text available for this source.]"
        );
        return lines.join("\n");
      })
      .join("\n\n")
      .trim();

    if (retrievedContext) contextSegments.push(retrievedContext);

    const context = contextSegments.join("\n\n").trim();
    const hasUsefulContext =
      overview.length > 0 ||
      retrieved.some((doc) => doc.snippet && doc.snippet.trim().length > 0);

    const systemPrompt = [
      assistantPrompts.chat.systemInstructions,
      languageGuidance.chat,
      "Ground every answer in the provided context and the policy insight you already know.",
      "If a detail is missing, share the most relevant guidance you can and invite the customer to explore the available highlights with you.",
      CHART_RESPONSE_INSTRUCTIONS,
    ].join(" ");

    const augmentedMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\nContext:\n${
          context ||
          "Lean on the policy overview above; no additional supporting passages were needed."
        }`,
      },
      ...messages.map((m): ChatMessage => ({ role: m.role, content: m.content })),
    ];

    const encoder = new TextEncoder();
    const provider = ProviderFactory.getProvider();
    const baseHeaders = {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    } as const;

    if (!hasUsefulContext) {
      const friendlyFallback = buildFriendlyFallbackMessage(
        documentRecord,
        suggestions
      );

      const fallbackStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const writeEvent = (event: unknown) =>
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

          writeEvent({
            type: "document",
            payload: { id: documentRecord.id, title: documentRecord.title },
          });
          writeEvent({ type: "sources", payload: retrieved });

          // WS-1.2: 80% soft warning banner.
          if (modeBQuotaWarning) {
            writeEvent({ type: "quota_warning", payload: modeBQuotaWarning });
          }

          // P3 FIX: emit the entire fallback as a single token event.
          // Old code: for (const char of friendlyFallback) { writeEvent(...) }
          // A 200-char string created 200 NDJSON events, 200 JSON.parse calls,
          // and 200 setMessages state updates on the client.
          writeEvent({ type: "token", payload: friendlyFallback });
          // WS-1.2: audit the fallback answer too.
          void finalizeQueryEvent(modeBEventId, { answerText: friendlyFallback, status: "ok" });
          writeEvent({ type: "done" });
          controller.close();
        },
      });

      return new NextResponse(fallbackStream, { headers: baseHeaders });
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const writeEvent = (event: unknown) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

        writeEvent({
          type: "document",
          payload: { id: documentRecord.id, title: documentRecord.title },
        });
        writeEvent({ type: "sources", payload: retrieved });

          // WS-1.2: 80% soft warning banner.
          if (modeBQuotaWarning) {
            writeEvent({ type: "quota_warning", payload: modeBQuotaWarning });
          }

        (async () => {
          let streamedAny = false;
          let streamFailed = false;
          let bufferedAnswer = "";
          // WS-1.1: provider-reported token usage for the usage-event spine.
          const usageRef: { value: { promptTokens: number; completionTokens: number } | null } = { value: null };

          try {
            // P1 FIX: use CHAT_MAX_TOKENS (env-configured) instead of 500.
            const completionStream = provider.chatStream(augmentedMessages, {
              temperature: 0,
              maxTokens: CHAT_MAX_TOKENS,
              onUsage: (u) => { usageRef.value = u; },
            });

            for await (const delta of completionStream) {
              if (!delta) continue;
              streamedAny = true;
              bufferedAnswer += delta;
              writeEvent({ type: "token", payload: delta });
            }

            if (!streamedAny) {
              const friendlyFallback = buildFriendlyFallbackMessage(
                documentRecord,
                suggestions,
                "I couldn't find supporting context for that question."
              );
              // P3 FIX: single event.
              writeEvent({ type: "token", payload: friendlyFallback });
            } else {
              // P2 + P3 FIX: only append fallback when answer is short AND uncited.
              const validSourceTags = new Set(
                retrieved.map((_, i) => `S${i + 1}`)
              );
              const citationMatches = Array.from(
                bufferedAnswer.matchAll(/\[(S\d+)]/g)
              );
              const hasValidCitation =
                citationMatches.length > 0 &&
                citationMatches.every((m) => validSourceTags.has(m[1]!));

              const isSubstantialAnswer =
                bufferedAnswer.trim().length >= SUBSTANTIAL_ANSWER_THRESHOLD;

              if (!hasValidCitation && !isSubstantialAnswer) {
                const friendlyFallback = buildFriendlyFallbackMessage(
                  documentRecord,
                  suggestions,
                  "I couldn't find supporting context for that question."
                );
                // P3 FIX: single event.
                writeEvent({
                  type: "token",
                  payload: `\n\n${friendlyFallback}`,
                });
              }
            }
          } catch (error) {
            streamFailed = true;
            console.error("[chat] streaming error:", error);
            // Raw provider/edge errors must not reach the client — show a
            // friendly event (mirrors the KB-mode stream error contract).
            writeEvent({
              type: "error",
              payload: "The assistant could not complete the answer. Please try again in a moment.",
            });
          } finally {
            // WS-1.2 + WS-1.1: audit the answer + record token metering
            // for the legacy path (previously neither was captured).
            void finalizeQueryEvent(modeBEventId, {
              answerText: bufferedAnswer,
              status: streamFailed ? "error" : "ok",
              metering: usageRef.value
                ? {
                    model: provider.getModelName("chat"),
                    provider: provider.getProviderName(),
                    promptTokens: usageRef.value.promptTokens,
                    completionTokens: usageRef.value.completionTokens,
                  }
                : null,
              cancelled: request.signal.aborted,
            });
            writeEvent({ type: "done" });
            controller.close();
          }
        })();
      },
    });

    return new NextResponse(stream, { headers: baseHeaders });
  } catch (error) {
    if (error instanceof ChatRetrievalError) {
      // Retrieval/embedding provider failure — friendly 502, raw cause only
      // in the server log (mirrors /api/embed/search error hygiene).
      console.error("[chat] retrieval failed:", error.cause ?? error.message);
      return NextResponse.json(
        { error: "Knowledge-base search failed. Please verify the embedding configuration and try again." },
        { status: 502 },
      );
    }
    console.error("[chat] handler error:", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
