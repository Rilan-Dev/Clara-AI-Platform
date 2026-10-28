import { TextEncoder } from "node:util";

import { NextRequest, NextResponse } from "next/server";

import { ProviderFactory } from "@/modules/ai-core/factory";
import type { ChatMessage, ChatToolDefinition, ToolCallingLLMProvider } from "@/modules/ai-core/types";
import {
  buildClaraToolRuntime,
  buildMcpToolRuntime,
  createExecutionContext,
  getClaraToolRuntime,
  isMcpEnabled,
  mcpToolName,
  streamableHttpMcpToolResolver,
  isAgentLoopEnabled,
  isProviderToolCallingEnabled,
  runBoundedAgenticLoop,
} from "@/modules/ai-platform-core";
import {
  createCompositeMcpResolver,
  resolveOrgOwnedMcpCapabilities,
} from "@/modules/mcp/runtime-resolver";
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
import { getKnowledgeBaseById, getAssistantConfigByKb, getKnowledgeBaseDocumentTitles } from "@/modules/knowledge-bases/core/db";
import { EmbeddingBackboneBrokenError } from "@/modules/knowledge-bases/core/embedding-selfheal";
import {
  isStrictRetrievalMode,
  retrievalDegradationEvent,
  retrievalDegradationSystemNotice,
} from "./retrieval-degradation";
import { groundClaraContext, groundingServerTiming } from "@/modules/rag/grounding";
import {
  noteBrainRequestSucceeded,
  noteEmbeddingRequestSucceeded,
  recordBrainRuntimeFailure,
  recordEmbeddingRuntimeFailure,
} from "@/modules/platform-health/core/incidents";
import { buildTurnGuidance } from "@/modules/rag/turn-guidance";
import { buildSystemPrompt } from "@/modules/knowledge-bases/core/config-builder";
import { finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";
import { admitQueryEvent, admissionDeniedResponse } from "@/lib/quota-admission";
import { hit, rateLimitResponse, CHAT_RATE } from "@/lib/rate-limit";
import { netTraceError, netTraceRequest, type NetTraceHandle } from "@/lib/net-trace";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { getAuthContext } from "@/modules/auth/core/rbac";
import { AIConfigResolutionError, toProviderConfig } from "@/modules/ai-core/resolve";
import { resolveAIConfigCached } from "@/modules/ai-core/resolve-cache";
import { SentenceTranslator, translateQueryForRag } from "@/modules/language-core/pipeline";
import { toTranslateLanguageCode } from "@/modules/language-core/model-catalog";
import {
  CHART_RESPONSE_INSTRUCTIONS,
  buildConversationAwareSearchQuery,
  buildRecentConversationContextBlock,
  recentMessages,
  withChartInstructions,
} from "@/modules/assistant/api/conversation-context";

const INTEGRATION_CHAT_TOOLS: readonly ChatToolDefinition[] = [
  {
    name: "integration_availability",
    description: "List integrations enabled for this organisation and agent, their connection readiness, and available actions.",
    parameters: {
      type: "object",
      properties: {
        integrationId: { type: "string", description: "Optional integration identifier to inspect." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "integration_action",
    description: "Execute an explicitly enabled action on a connected organisation integration. Use integration_availability first to discover valid actions.",
    parameters: {
      type: "object",
      properties: {
        integrationId: { type: "string", minLength: 1 },
        actionName: { type: "string", minLength: 1 },
        props: { type: "object", additionalProperties: true },
      },
      required: ["integrationId", "actionName"],
      additionalProperties: false,
    },
  },
];

type ChatMcpCapabilities = {
  requests: Array<{ serverId: string; toolName: string; context: ReturnType<typeof createExecutionContext> }>;
  policy: { allowedServers: string[]; allowedToolPairs: Array<{ serverId: string; toolName: string }> };
  tools: ChatToolDefinition[];
  resolver: typeof streamableHttpMcpToolResolver;
};

async function resolveChatMcpCapabilities(context: ReturnType<typeof createExecutionContext>): Promise<ChatMcpCapabilities> {
  if (!isMcpEnabled() || context.surface !== "chat" || !context.userId || !context.agentId) {
    return { requests: [], policy: { allowedServers: [], allowedToolPairs: [] }, tools: [], resolver: streamableHttpMcpToolResolver };
  }
  const rows = await dbQuery<{ server_id: string; tool_name: string }>(
    `SELECT DISTINCT s.id AS server_id, t.tool_name
       FROM platform_mcp_servers s
       JOIN platform_mcp_tools t ON t.server_id=s.id AND t.approved=true
       JOIN organisation_mcp_connections c ON c.server_id=s.id AND c.org_id=$1 AND c.status IN ('configured','connected')
       JOIN organisation_mcp_tool_grants g ON g.org_id=$1 AND g.server_id=s.id AND g.tool_name=t.tool_name AND g.enabled=true
       JOIN agent_mcp_tool_grants ag ON ag.org_id=$1 AND ag.server_id=s.id AND ag.tool_name=t.tool_name AND ag.agent_id=$2::uuid AND ag.enabled=true
       JOIN knowledge_bases kb ON kb.agent_id=ag.agent_id AND kb.id=$3
      WHERE s.platform_enabled=true
      ORDER BY s.id, t.tool_name
      LIMIT 8`,
    [context.tenantId, context.agentId, context.kbId],
  );
  const requests = rows.map((row) => ({ serverId: row.server_id, toolName: row.tool_name, context }));
  const resolved = await Promise.all(requests.map(async (request) => ({
    request,
    descriptor: await streamableHttpMcpToolResolver.resolve(request),
  })));
  const usable = resolved.filter((item) => item.descriptor !== null);
  const platformCapabilities: ChatMcpCapabilities = {
    requests: usable.map((item) => item.request),
    policy: {
      allowedServers: [...new Set(usable.map((item) => item.request.serverId))],
      allowedToolPairs: usable.map((item) => ({ serverId: item.request.serverId, toolName: item.request.toolName })),
    },
    tools: usable.map(({ descriptor }) => ({
      name: mcpToolName(descriptor!.serverId, descriptor!.name),
      description: descriptor!.description.slice(0, 1000),
      parameters: descriptor!.inputSchemaJson ?? { type: "object", properties: {}, additionalProperties: false },
    } as ChatToolDefinition)),
    resolver: streamableHttpMcpToolResolver,
  };

  // Organization-owned MCP connections ride the same request-scoped runtime:
  // entitlement-gated discovery through the OrgMcpToolResolver adapter, then
  // one composite resolver so a single Unified Tool Runtime serves both the
  // optional platform catalog and tenant-owned custom endpoints.
  const orgOwned = await resolveOrgOwnedMcpCapabilities(context);
  if (orgOwned.requests.length === 0) {
    return platformCapabilities;
  }
  const orgServerIds = new Set(orgOwned.allowedServers);
  return {
    requests: [...platformCapabilities.requests, ...orgOwned.requests],
    policy: {
      allowedServers: [...platformCapabilities.policy.allowedServers, ...orgOwned.allowedServers],
      allowedToolPairs: [...platformCapabilities.policy.allowedToolPairs, ...orgOwned.allowedToolPairs],
    },
    tools: [
      ...platformCapabilities.tools,
      ...orgOwned.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      } as ChatToolDefinition)),
    ],
    resolver: createCompositeMcpResolver({
      platform: streamableHttpMcpToolResolver,
      orgOwned: orgOwned.resolver,
      orgOwnedServerIds: orgServerIds,
    }),
  };
}

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

/**
 * Realtime turns repeatedly hit the same KB during a live session. Document
 * titles are prompt metadata, not retrieval truth, so a short process-local
 * cache removes one DB round trip per turn without changing Qdrant results.
 */
const REALTIME_DOCUMENT_TITLES_TTL_MS = 5_000;
const realtimeDocumentTitlesCache = new Map<string, { expiresAt: number; titles: string[] }>();

async function getRealtimeDocumentTitles(kbId: string): Promise<string[]> {
  const cached = realtimeDocumentTitlesCache.get(kbId);
  if (cached && cached.expiresAt > Date.now()) return cached.titles;
  const titles = await getKnowledgeBaseDocumentTitles(kbId);
  realtimeDocumentTitlesCache.set(kbId, {
    expiresAt: Date.now() + REALTIME_DOCUMENT_TITLES_TTL_MS,
    titles,
  });
  if (realtimeDocumentTitlesCache.size > 512) {
    const now = Date.now();
    for (const [key, value] of realtimeDocumentTitlesCache) {
      if (value.expiresAt <= now) realtimeDocumentTitlesCache.delete(key);
    }
  }
  return titles;
}

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

/**
 * A request-validation failure whose message is CURATED (authored by us,
 * no internals) and therefore safe to return to org users verbatim.
 * Everything else that reaches the outer catch is sanitized — see there.
 */
class PublicChatValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicChatValidationError";
  }
}

/** Generic retryable message for unclassified chat handler errors. */
const CHAT_HANDLER_PUBLIC_ERROR =
  "The assistant could not complete the request. Please try again in a moment.";

async function postChatKb(
  request: NextRequest,
  kbId: string,
  messages: ClientMessage[],
  body: Record<string, unknown>,
  trace: NetTraceHandle,
): Promise<NextResponse> {
  await ensureMigrated();
  trace.field("kb", kbId);

  if (messages.length === 0) throw new PublicChatValidationError("At least one message is required.");
  const latest = messages[messages.length - 1]!;
  if (latest.role !== "user") throw new PublicChatValidationError("The final message must come from the user.");

  // Realtime is a transport/surface concern, not a Sarvam-only feature.
  // Keep this flag local to the KB chat path so realtime retrieval/model
  // budgets are applied consistently for every Clara brain provider.
  const realtimeVoice = body?.realtimeVoice === true;

  // One round of independent lookups (they used to run back to back).
  const [kb, config, resolved, documentTitles, orgRows, authCtx] = await Promise.all([
    getKnowledgeBaseById(kbId),
    getAssistantConfigByKb(kbId),
    // scope:"draft" — the authenticated agent preview tests the CURRENT
    // Main-branch draft (persona/models/runtime + LIVE KB collection)
    // instead of the immutable published version.
    resolveAIConfigCached({ kbId, surface: "chat", ...(body?.scope === "draft" ? { preferDraft: true } : {}) }),
    realtimeVoice ? getRealtimeDocumentTitles(kbId) : getKnowledgeBaseDocumentTitles(kbId),
    // (Named dbQuery — `query` below shadows it with the chat question text.)
    dbQuery<{ org_id: string }>(
      `SELECT a.org_id FROM agents a JOIN knowledge_bases kb2 ON kb2.agent_id = a.id WHERE kb2.id = $1`,
      [kbId],
    ),
    // Audit context — workspace chat is authenticated; the question is still
    // logged for anonymous surfaces (user_id NULL).
    getAuthContext(request).catch(() => null),
  ]);
  if (!kb)     throw new PublicChatValidationError("Knowledge base not found.");
  if (!config) throw new PublicChatValidationError("Knowledge base configuration not found.");
  if (kb.status !== "active") throw new PublicChatValidationError("Knowledge base is archived.");

  // ── WS-1.2: atomic quota admission (org-wide, rolling 24h) ─────────────
  // ONE transaction: advisory-lock the org, resolve limits, count the window,
  // then INSERT the pending audit row — check-and-increment cannot race, and
  // quota state can never diverge from the audit trail.
  // Nothing is streamed to an over-limit org; retrieval runs alongside the
  // admission transaction (below) so the turn does not wait for both.
  const orgId = orgRows[0]?.org_id ?? null;
  trace.field("org", orgId ?? undefined);

  // Phase 6.4: per-org chat rate limit — enforced BEFORE the quota admission
  // transaction so over-rate traffic never touches the advisory lock.
  const chatGated = chatRateGate(orgId, request);
  if (chatGated) return chatGated;

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

  // The same grounding service every voice channel uses: cross-lingual
  // retrieval, capability handling, KB topics and provider-neutral turn
  // guidance. It starts NOW, in parallel with the admission transaction;
  // this route owns the query event (admitted below, finalised with the
  // answer), so grounding must not log it again.
  const groundingPromise = groundClaraContext({
    kbId,
    query,
    searchQuery: retrievalQuery,
    skipTranslation: crossLingual.translated,
    topK: realtimeVoice ? 4 : 6,
    surface: "workspace",
    admission: "external",
    sessionId: sessionId ?? null,
    userId: authCtx?.user.id ?? null,
    channel: realtimeVoice ? "voice" : "chat",
    ...(body?.scope === "draft" ? { preferDraft: true } : {}),
  }).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

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
  // Realtime is a transport/surface concern, not a Sarvam-only feature.
  // ElevenLabs Clara realtime also needs the short retrieval + response budget.
  // The speech transport is independent from Clara's brain. ElevenLabs
  // realtime owns STT/TTS only; the answer still runs through the configured
  // chat model (OpenAI/Gemini/Sarvam) so a native realtime model can never be
  // accidentally sent to the Chat Completions API.
  //
  // This distinction is critical for providers such as OpenAI: models like
  // gpt-4o-realtime-preview belong to the Realtime Voice capability and are
  // not valid Chat Completions models. Realtime speech must therefore NOT
  // replace resolved.chatModel with resolved.realtimeModel.
  const providerConfig = toProviderConfig(resolved);
  const groundingSettled = await groundingPromise;
  // ── Retrieval degradation ──────────────────────────────────────────────
  // A failed retrieval must not take the whole chat down. The published
  // widget (/api/embed/chat) already answers without evidence when search
  // fails; a workspace chat returning 502 on every turn while the embedding
  // backbone heals (or a re-index rebuilds) is strictly worse for users.
  // Instead: record the incident (admin banner + email), keep the audit row
  // alive, answer WITHOUT evidence, tell the model search is down, and emit
  // a retrieval_degraded event so surfaces can banner it. Set
  // CHAT_STRICT_RETRIEVAL=1 to restore the hard failure.
  let retrievalDegradedNotice: string | null = null;
  if (!groundingSettled.ok) {
    // Always-on issue capture with Network-tab correlation (docker/vercel
    // logs) — replaces the bare one-line console.error; the incident recorder
    // below still notifies the platform admin (banner + email).
    netTraceError("chat/retrieval", groundingSettled.error, {
      stage: "retrieval failed (degrading to an ungrounded answer)",
      req: trace.id, org: orgId ?? undefined, kb: kbId,
    });
    // Capture the provider/embedding failure as a platform incident so the
    // admin banner + email notification fire without anyone watching the logs.
    void recordEmbeddingRuntimeFailure(groundingSettled.error, { surface: "KB chat retrieval" });
    if (isStrictRetrievalMode()) {
      void finalizeQueryEvent(eventId, {
        answerText: "", status: "error",
        latencyMs: Date.now() - t0,
      });
      throw new ChatRetrievalError(groundingSettled.error);
    }
    retrievalDegradedNotice = retrievalDegradationSystemNotice();
  } else {
    // A successful grounding proves the embedding pipeline is alive — clear any
    // runtime-failing embedding incident (rate-limited, no-op when healthy).
    void noteEmbeddingRequestSucceeded();
  }
  const grounding = groundingSettled.ok ? groundingSettled.value : null;
  // A KB with no indexed content yet (503) is a no-evidence turn, not an error.
  const groundedResult = grounding && grounding.ok ? grounding.result : null;
  const results = groundedResult?.sources ?? [];
  const latencyMs = Date.now() - t0;
  void finalizeQueryEvent(eventId, {
    answerText: "", status: "pending", latencyMs, sourceCount: results.length,
  });

  const guidance =
    groundedResult?.guidance ??
    buildTurnGuidance({
      grounded: false,
      intent: "out_of_scope",
      fallbackReply: config.outOfScopeReply,
      topics: kb.description ?? documentTitles.join(", "),
      channel: realtimeVoice ? "voice" : "chat",
    });
  const evidence = groundedResult?.intent === "capability"
    ? groundedResult.context
    : results.map((r, i) => `[S${i + 1}] ${r.title}\n${r.snippet}`).join("\n\n");
  const context = [guidance, evidence].filter(Boolean).join("\n\n");

  const systemPrompt = withChartInstructions(buildSystemPrompt(config, { kbName: kb.name, kbDescription: kb.description, documentCount: documentTitles.length, documentTitles, surface: "chat", allowedLanguages: resolved.allowedLanguages, responseLanguage: groundedResult?.responseLanguage ?? null }));
  const chatMessages: ChatMessage[] = [
    {
      role: "system",
      content: `${systemPrompt}\n\nContext from knowledge base:\n${context || "No relevant context found for this query."}${recentConversationContextBlock ? `\n\n${recentConversationContextBlock}` : ""}${retrievalDegradedNotice ? `\n\n${retrievalDegradedNotice}` : ""}`,
    },
    ...recentMessages(messages).map((m): ChatMessage => ({ role: m.role, content: m.content })),
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
      if (retrievalDegradedNotice) {
        write({ type: "retrieval_degraded", payload: retrievalDegradationEvent() });
      }
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
          const chatOptions = {
            temperature: resolved.temperature ?? config.temperature,
            // The assistant's configured reply length on every surface. A
            // hardcoded 350-token voice cap cut spoken answers off mid-word
            // (Tamil/Indic scripts use several tokens per word); brevity for
            // voice comes from the prompt, not truncation.
            maxTokens: resolved.maxTokens ?? config.maxTokens,
            reasoningEffort: realtimeVoice ? null : undefined,
            onUsage: (u: { promptTokens: number; completionTokens: number }) => { usageRef.value = u; },
          };
          const canCallTools =
            isAgentLoopEnabled() &&
            isProviderToolCallingEnabled() &&
            typeof (provider as Partial<ToolCallingLLMProvider>).chatStreamWithTools === "function" &&
            Boolean(orgId && authCtx?.user.id && resolved.agentId);
          if (canCallTools) {
            // Build the only authorized context from server-resolved identity.
            // Request-body tenant/user/agent fields are never trusted.
            const executionContext = createExecutionContext({
              orgId: orgId!,
              kbId,
              agentId: resolved.agentId!,
              userId: authCtx!.user.id,
              sessionId: authCtx!.session.id,
              surface: "chat",
              metadata: { mcpSignal: request.signal },
            });
            // Discover only the MCP tools granted to this exact org/agent,
            // and build a request-scoped Unified Tool Runtime so no capability
            // closure can accidentally retain another chat session's identity.
            const mcp = authCtx?.user.isSuperAdmin
              ? { requests: [], policy: { allowedServers: [], allowedToolPairs: [] }, tools: [] as ChatToolDefinition[], resolver: streamableHttpMcpToolResolver }
              : await resolveChatMcpCapabilities(executionContext);
            const mcpRuntime = mcp.requests.length > 0
              ? await buildMcpToolRuntime(executionContext, mcp.requests, mcp.policy, mcp.resolver, buildClaraToolRuntime())
              : null;
            const loopResult = await runBoundedAgenticLoop(
              provider as ToolCallingLLMProvider,
              chatMessages,
              [...INTEGRATION_CHAT_TOOLS, ...mcp.tools],
              executionContext,
              mcpRuntime ?? getClaraToolRuntime(),
              {
                signal: request.signal,
                enabled: true,
                toolCallingEnabled: true,
                maxIterations: 3,
              },
            );
            if (loopResult.status === "provider_error") {
              throw new Error("Provider tool-calling request failed.");
            }
            if (loopResult.status === "cancelled") {
              throw new Error("Chat request was cancelled.");
            }
            if (loopResult.status === "max_iterations") {
              console.warn("[chat] bounded integration tool loop reached its iteration limit");
            }
            if (loopResult.text) {
              if (answerTranslator) await answerTranslator.push(loopResult.text, emitToken);
              else emitToken(loopResult.text);
            }
          } else {
            const completionStream = provider.chatStream(chatMessages, chatOptions);
            for await (const delta of completionStream) {
              if (delta) {
                if (answerTranslator) {
                  answerTranslator.push(delta, emitToken);
                } else {
                  emitToken(delta);
                }
              }
            }
          }
        } catch (err) {
          streamError = (err as Error).message;
          // Raw provider/edge errors must not reach the client (they can
          // reference regions, keys or upstream internals) — capture them
          // Network-tab style for docker/vercel logs, show a friendly event.
          // The audit row keeps the error status either way.
          netTraceError("chat/stream", err, {
            req: trace.id, org: orgId ?? undefined, kb: kbId,
            provider: provider.getProviderName(), model: provider.getModelName("chat"),
          });
          // A dead brain credential (401/429) must reach the platform admin
          // as an incident — banner + email — not just container logs.
          void recordBrainRuntimeFailure(err, {
            surface: "KB chat answer",
            provider: provider.getProviderName(),
            model: provider.getModelName("chat"),
          });
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
          // A completed stream proves the brain provider is alive — clear
          // any runtime-failing answer-engine incident (rate-limited no-op).
          if (!streamError) void noteBrainRequestSucceeded(provider.getProviderName());
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
          // Summary row for this request in docker/vercel logs (NET_TRACE
          // gated; the failure capture above is always on). Duration mirrors
          // the Network tab's full stream time, not just time-to-first-byte.
          trace.end({
            status: 200,
            note: streamError ? "stream-error-event" : "stream-complete",
          });
        }
      })();
    },
  });

  // Retrieval stage timings in the standard Server-Timing header (devtools →
  // Network → Timing) — the streamed body's duration includes the whole answer.
  const serverTiming = groundingServerTiming(groundedResult?.timings, "rag-");
  // x-request-id echoes the net-trace correlation id — the browser Network
  // tab row and the docker/vercel log row share the same id.
  return new NextResponse(stream, {
    headers: serverTiming
      ? { ...baseHeaders, "Server-Timing": `${serverTiming}, pre-llm;dur=${Date.now() - t0}`, "x-request-id": trace.id }
      : { ...baseHeaders, "x-request-id": trace.id },
  });
}

export async function postChat(request: NextRequest): Promise<NextResponse> {
  // One Network-tab-style trace per request (see lib/net-trace.ts): summary
  // lines are gated by NET_TRACE, failure capture is always on. The id reuses
  // the caller's x-request-id header and is echoed on every response, so the
  // docker/vercel log row maps 1:1 to the browser devtools Network row.
  const trace = netTraceRequest({
    route: "chat",
    url: "/api/chat",
    headers: request.headers,
  });
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new PublicChatValidationError("Request body must be valid JSON.");
    }
    let messages: ClientMessage[];
    try {
      messages = validateMessages(body?.messages);
    } catch (error) {
      throw new PublicChatValidationError(
        error instanceof Error ? error.message : "Invalid messages payload.",
      );
    }
    trace.setReqBody({
      messages: messages.length,
      kbId: typeof body?.kbId === "string" ? body.kbId : undefined,
      documentId: typeof body?.documentId === "string" ? body.documentId : undefined,
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : undefined,
      scope: typeof body?.scope === "string" ? body.scope : undefined,
      realtimeVoice: body?.realtimeVoice === true,
    });

    // ── Mode A: KB-aware chat ─────────────────────────────────────────────────
    // Accepts kbId — searches across all docs in the KB, uses KB's AssistantConfig
    // for the system prompt. This is the workspace "KB mode".
    const kbId = typeof body?.kbId === "string" ? body.kbId.trim() : undefined;
    if (kbId) {
      return await postChatKb(request, kbId, messages, body, trace);
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
      throw new PublicChatValidationError("At least one message is required.");
    if (!documentId)
      throw new PublicChatValidationError("documentId is required to perform retrieval.");

    const latest = messages[messages.length - 1]!;
    if (latest.role !== "user")
      throw new PublicChatValidationError("The final message must come from the user.");

    const documentRecord = await getDocumentById(documentId);
    if (!documentRecord)
      throw new PublicChatValidationError("The requested document is not available.");
    trace.field("doc", documentRecord.id);
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
    // ── Retrieval degradation (Mode B) ──────────────────────────────────────
    // Mirrors the KB-mode policy: a failed retrieval (embedding provider
    // unreachable, credential rejected, collection still rebuilding) must not
    // take the whole document chat down with a 502 on every turn. Degrade to
    // an ungrounded answer over the document overview, emit a
    // retrieval_degraded event, record the incident — and fail hard only when
    // the operator opted into CHAT_STRICT_RETRIEVAL.
    const modeBRetrieval = await (async () => {
      try {
        const embedding = await embedQuery(query);
        const retrieved = await searchSimilarDocuments(
          documentRecord.collectionName,
          embedding,
          4
        );
        return { ok: true as const, retrieved };
      } catch (retrievalError) {
        return { ok: false as const, error: retrievalError };
      }
    })();
    let modeBDegradedNotice: string | null = null;
    if (!modeBRetrieval.ok) {
      netTraceError("chat/retrieval", modeBRetrieval.error, {
        stage: "document retrieval failed (degrading to an ungrounded answer)",
        req: trace.id, doc: documentRecord.id,
      });
      // The embedding/provider failure must reach the platform admin as an
      // incident (banner + email) — not just the container log.
      void recordEmbeddingRuntimeFailure(modeBRetrieval.error, {
        surface: "document chat retrieval",
      });
      if (isStrictRetrievalMode()) {
        void finalizeQueryEvent(modeBEventId, { answerText: "", status: "error" });
        throw new ChatRetrievalError(modeBRetrieval.error);
      }
      modeBDegradedNotice = retrievalDegradationSystemNotice();
    } else {
      // The query embedding round trip succeeded — clear runtime incidents.
      void noteEmbeddingRequestSucceeded();
      console.log(
        `[chat] retrieval done hits=${modeBRetrieval.retrieved.length} docId=${documentRecord.id}`
      );
    }
    const retrieved = modeBRetrieval.ok ? modeBRetrieval.retrieved : [];

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
      "Ground every answer in the provided context and the document insight you already know.",
      "If a detail is missing, say so briefly, share the most relevant guidance you can, and invite the visitor to explore the available highlights with you.",
      CHART_RESPONSE_INSTRUCTIONS,
      ...(modeBDegradedNotice ? [modeBDegradedNotice] : []),
    ].join(" ");

    const augmentedMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${systemPrompt}\n\nContext:\n${
          context ||
          "Lean on the document overview above; no additional supporting passages were needed."
        }`,
      },
      ...recentMessages(messages).map((m): ChatMessage => ({ role: m.role, content: m.content })),
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
          if (modeBDegradedNotice) {
            writeEvent({ type: "retrieval_degraded", payload: retrievalDegradationEvent() });
          }
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
          trace.end({ status: 200, note: "fallback-stream" });
        },
      });

      return new NextResponse(fallbackStream, { headers: { ...baseHeaders, "x-request-id": trace.id } });
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const writeEvent = (event: unknown) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

        writeEvent({
          type: "document",
          payload: { id: documentRecord.id, title: documentRecord.title },
        });
        if (modeBDegradedNotice) {
          writeEvent({ type: "retrieval_degraded", payload: retrievalDegradationEvent() });
        }
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
            netTraceError("chat/stream", error, {
              req: trace.id, doc: documentRecord.id,
              provider: provider.getProviderName(), model: provider.getModelName("chat"),
            });
            // A dead brain credential (401/429) must reach the platform admin
            // as an incident — banner + email — not just container logs.
            void recordBrainRuntimeFailure(error, {
              surface: "document chat answer",
              provider: provider.getProviderName(),
              model: provider.getModelName("chat"),
            });
            // Raw provider/edge errors must not reach the client — show a
            // friendly event (mirrors the KB-mode stream error contract).
            writeEvent({
              type: "error",
              payload: "The assistant could not complete the answer. Please try again in a moment.",
            });
          } finally {
            // A completed stream proves the brain provider is alive — clear
            // any runtime-failing answer-engine incident (rate-limited no-op).
            if (!streamFailed) void noteBrainRequestSucceeded(provider.getProviderName());
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
            trace.end({
              status: 200,
              note: streamFailed ? "stream-error-event" : "stream-complete",
            });
          }
        })();
      },
    });

    return new NextResponse(stream, { headers: { ...baseHeaders, "x-request-id": trace.id } });
  } catch (error) {
    if (error instanceof PublicChatValidationError) {
      // Curated validation message — safe to return to org users verbatim.
      // Summary row only (NET_TRACE gated): routine client error, not an issue.
      trace.end({ status: 400, resBody: { error: error.message }, note: "validation" });
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: { "x-request-id": trace.id } },
      );
    }
    if (error instanceof ChatRetrievalError) {
      // Retrieval/embedding provider failure — friendly 502, raw cause only
      // in the server log (mirrors /api/embed/search error hygiene). The
      // incident recorder is already called at the typed throw sites; this
      // catch is the safety net for anything that slipped through unclassified.
      const healed = error.cause instanceof EmbeddingBackboneBrokenError ? error.cause : null;
      const publicMessage =
        healed?.message ??
        "Knowledge-base search failed. Please verify the embedding configuration and try again.";
      trace.fail(healed?.cause ?? error.cause ?? error, {
        status: 502,
        resBody: { error: publicMessage },
      });
      void recordEmbeddingRuntimeFailure(
        // Classify the ORIGINAL vendor error, not the healed public message.
        healed?.cause ?? error.cause ?? error,
        { surface: "chat retrieval" },
      );
      return NextResponse.json(
        { error: publicMessage },
        { status: 502, headers: { "x-request-id": trace.id } },
      );
    }
    if (error instanceof AIConfigResolutionError) {
      // Provider health/credential gating (e.g. "Provider Sarvam AI is
      // currently unhealthy", "No embedding model is configured for this
      // tenant") is a service-availability problem, not a malformed request:
      // return a retryable 503 with the remediation path instead of a raw
      // 400, and record the incident so the admin banner/email fires.
      const publicMessage =
        `${error.message} ` +
        `Check the provider credential/health in Settings → AI Platform → Providers, or switch this assistant's model.`;
      trace.fail(error, { status: 503, resBody: { error: publicMessage } });
      const embeddingRelated = /embedding/i.test(error.message);
      void (embeddingRelated
        ? recordEmbeddingRuntimeFailure(error, { surface: "chat configuration" })
        : recordBrainRuntimeFailure(error, { surface: "chat configuration" }));
      return NextResponse.json(
        { error: publicMessage },
        { status: 503, headers: { "x-request-id": trace.id } },
      );
    }
    // Unclassified handler error (DB messages, JSON internals, provider
    // surprises): raw internals must NEVER reach org users — the browser
    // Network tab row shows only status + generic message + x-request-id,
    // while the full cause chain + stack is captured server-side (always on,
    // independent of NET_TRACE).
    trace.fail(error, {
      status: 400,
      resBody: { error: CHAT_HANDLER_PUBLIC_ERROR },
    });
    return NextResponse.json(
      { error: CHAT_HANDLER_PUBLIC_ERROR },
      { status: 400, headers: { "x-request-id": trace.id } },
    );
  }
}
