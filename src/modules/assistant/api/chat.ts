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
import { logQueryEvent, finalizeQueryEvent } from "@/modules/knowledge-bases/core/analytics-db";
import { ensureMigrated } from "@/lib/db/migrate";
import { query as dbQuery } from "@/lib/db";
import { getAuthContext } from "@/modules/auth/core/rbac";
import { planGuard } from "@/lib/plan-guard";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
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

  // ── Plan limit: daily request quota (org-wide, rolling 24h) ─────────────
  // Enforced BEFORE any retrieval/LLM work so over-limit orgs cost nothing.
  // (Named dbQuery — `query` below shadows it with the chat question text.)
  const orgRows = await dbQuery<{ org_id: string }>(
    `SELECT a.org_id FROM agents a JOIN knowledge_bases kb2 ON kb2.agent_id = a.id WHERE kb2.id = $1`,
    [kbId]
  );
  const orgId = orgRows[0]?.org_id ?? null;
  if (orgId) {
    const reqGuard = await planGuard(orgId, "requests");
    if (!reqGuard.allowed) {
      const blocked = reqGuard as { reason: string };
      return NextResponse.json(
        { error: "plan_limit_exceeded", code: "plan_limit_exceeded", message: blocked.reason },
        { status: 402 }
      );
    }
  }

  // Audit context — workspace chat is authenticated; the question is still
  // logged for anonymous surfaces (user_id NULL).
  const authCtx = await getAuthContext(request).catch(() => null);

  const query = latest.content;
  const retrievalQuery = buildConversationAwareSearchQuery(messages, query);
  const recentConversationContextBlock = buildRecentConversationContextBlock(messages);
  const t0 = Date.now();
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;

  console.log(`[chat/kb] kbId=${kbId} query="${query.slice(0, 100)}"`);

  // Analytics + audit trail. Inserted at REQUEST time with status='pending':
  //   • the prompt is audited even when retrieval or the LLM later fails
  //   • the daily quota counts immediately (no abort-the-stream bypass)
  // Finalised with the AI answer once the stream completes.
  const eventId = await logQueryEvent({
    kbId, queryText: query, sessionId,
    orgId, userId: authCtx?.user.id ?? null, surface: "workspace",
    status: "pending",
  });

  // RAG search across the full KB collection
  const providerConfig = toProviderConfig(resolved);
  let results: Awaited<ReturnType<typeof searchKbEmbedded>>;
  try {
    results = await searchKbEmbedded(kb.qdrantCollection, retrievalQuery, 6, {
      providerConfig,
    });
  } catch (searchErr) {
    // Retrieval failed — mark the audit row as an error, then surface it.
    void finalizeQueryEvent(eventId, {
      answerText: "", status: "error",
      latencyMs: Date.now() - t0,
    });
    throw searchErr;
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

  const sources = results.map((r, i) => ({
    id: r.id,
    title: r.title,
    snippet: r.snippet.slice(0, 300),
    score: r.score,
    index: i + 1,
  }));

  const encoder = new TextEncoder();
  const provider = ProviderFactory.getProvider(providerConfig);
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

      (async () => {
        let answerBuffer = "";
        let streamError: string | null = null;
        const streamT0 = Date.now();
        try {
          const completionStream = provider.chatStream(chatMessages, {
            temperature: resolved.temperature ?? config.temperature,
            maxTokens: resolved.maxTokens ?? config.maxTokens,
          });
          for await (const delta of completionStream) {
            if (delta) {
              answerBuffer += delta;
              write({ type: "token", payload: delta });
            }
          }
        } catch (err) {
          streamError = (err as Error).message;
          write({ type: "error", payload: streamError });
        } finally {
          // Persist the AI-generated answer for the platform audit trail.
          void finalizeQueryEvent(eventId, {
            answerText: answerBuffer,
            status: streamError ? "error" : "ok",
            latencyMs: Date.now() - streamT0,
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

    const query = latest.content;
    console.log(
      `[chat] retrieval start docId=${documentRecord.id} ` +
        `collection=${documentRecord.collectionName} ` +
        `query="${query.slice(0, 120)}" maxTokens=${CHAT_MAX_TOKENS}`
    );
    const embedding = await embedQuery(query);
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

          // P3 FIX: emit the entire fallback as a single token event.
          // Old code: for (const char of friendlyFallback) { writeEvent(...) }
          // A 200-char string created 200 NDJSON events, 200 JSON.parse calls,
          // and 200 setMessages state updates on the client.
          writeEvent({ type: "token", payload: friendlyFallback });
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

        (async () => {
          let streamedAny = false;
          let bufferedAnswer = "";

          try {
            // P1 FIX: use CHAT_MAX_TOKENS (env-configured) instead of 500.
            const completionStream = provider.chatStream(augmentedMessages, {
              temperature: 0,
              maxTokens: CHAT_MAX_TOKENS,
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
            console.error("[chat] streaming error:", error);
            writeEvent({
              type: "error",
              payload:
                error instanceof Error
                  ? error.message
                  : "Streaming error occurred.",
            });
          } finally {
            writeEvent({ type: "done" });
            controller.close();
          }
        })();
      },
    });

    return new NextResponse(stream, { headers: baseHeaders });
  } catch (error) {
    console.error("[chat] handler error:", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
