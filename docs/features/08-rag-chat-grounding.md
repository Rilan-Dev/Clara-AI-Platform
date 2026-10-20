# 08 — RAG Chat & Grounding

> Clara AI Platform feature documentation · Domain: `assistant` + `rag` · Base: `feature/ai-core-from-doable-source @ 1adb80bf` (chat.ts carries the uncommitted NET_TRACE observability wiring)

## 1. Definition & Purpose

RAG chat is the product's core conversation: a user asks a question, the platform retrieves knowledge from the agent's KBs, and the LLM answers **grounded** in retrieved sources with inline citations — declining to fabricate when the knowledge isn't there. This feature covers the chat API (streaming NDJSON), chat session history, answer regeneration, the grounding pipeline (retrieval → context assembly → citation verification), retrieval-degradation behaviour, cross-lingual retrieval, and turn guidance. Its purpose is trustworthy answers: every factual claim traceable to a source, and honest "I don't have that information" behaviour otherwise (production-verified by the Task C benchmark: 4/4 cited facts, clean hallucination control).

## 2. Business Logic

- **Request path** — `POST /api/chat` → `postChat` (`src/modules/assistant/api/chat.ts:780`) authenticates, resolves the agent's ACTIVE deployment config (Feature 04 `getProductionVersionConfigCached`), checks quota, builds the RAG context, and returns an NDJSON stream.
- **Grounding pipeline** — `groundClaraContext` (`src/modules/rag/grounding.ts:537`) runs retrieval with `GroundingRequest:192` inputs; produces `GroundedContext:294` with `GroundedSource:251` + `GraphSource:262` lists, `KnowledgeBinding:273`, scope `:281`, and intent classification `:292` (capability vs knowledge vs out_of_scope). Outcomes are typed by `GroundingOutcome:335`. Timings surface via `groundingServerTiming:183`.
- **Streaming protocol** — `postChatKb` (`chat.ts:364`) opens a `ReadableStream` (chat.ts:602) emitting `kb` → `sources` (immediately, before the LLM call) → optional `quota_warning` → `token`* → `done`; failures emit a friendly `error` event and raw internals stay server-side. Stream failure closes the stream, persists an error-status audit row, and never leaks provider details to org users.
- **Citations** — the system prompt carries source markers; the assistant renders `[S1, S2]`-style inline citations; the benchmark verifies answers contain the planted facts with doc-referencing sources.
- **Degradation** — `retrieval-degradation.ts`: `isStrictRetrievalMode:24`, `retrievalDegradationSystemNotice:30`, `retrievalDegradationEvent:40` — when retrieval fails mid-chat, the stream degrades to ungrounded answering with an explicit notice (no 502); strict mode refuses instead.
- **Cross-lingual retrieval** — `rag/cross-lingual.ts`: `inferKnowledgeLanguage:49`, `needsRetrievalTranslation:80`, `translateQueryForRetrieval:187`, `translateText:270`, `localizeText:320` (caches `:257`) — queries in a language the KB doesn't share are translated for retrieval, then answers localised.
- **Turn guidance & topics** — `rag/turn-guidance.ts:47` `buildTurnGuidance` shapes multi-turn follow-ups; `rag/knowledge-topics.ts:77` `getKnowledgeTopics` (cache clear `:125`) summarises KB topics for prompt context.
- **Conversation context** — `assistant/api/conversation-context.ts`: `buildRecentConversationContext:161`, `buildConversationAwareSearchQuery:180` (rewrites follow-ups into standalone queries), chart instructions `:27`/`:14`.
- **History** — `/api/chat/sessions/**` (list, detail, messages); regenerate re-runs the turn.
- **Query cache** — `rag/query-embedding-cache.ts:42` `embedQueryCached` (clear `:79`) dedupes query embeddings.

## 3. Business Rules

- Answers must come from retrieved sources; the hallucination-control contract is enforced by prompt + grounding outcome (out_of_scope intent → decline).
- `sources` events always precede tokens so clients can render citations with the answer.
- Degraded retrieval is ALWAYS signalled (`retrieval_degraded` event / strict refusal) — silent ungrounded answering is not permitted in strict mode.
- Every query is audited with latency + token metering (usage-event spine, Feature 20) — `finalizeQueryEvent` in chat.ts persists status/latency/metering even on stream error.
- Public errors are curated (`PublicChatValidationError` carries validation messages; unclassified errors return a generic message + x-request-id — raw internals only in server logs).
- Quota admission is checked before the LLM call; 80% soft warning emits `quota_warning` (WS-1.2 rule).
- Saved-session lifecycle enforces KB authorization (FIX-01 @ ac7d945f): session listing, creation, and message reads recheck the user's KB access before serving; revoked or unowned KBs cannot serve saved transcripts, and workspace chat verifies KB membership and draft permission before any response streams.

## 4. Data Model

- Chat sessions/messages — `016_chat_sessions.sql`; query audit — `027_query_audit.sql`; usage metering — `028_usage_metering.sql` (Feature 20).

## 5. API Surface

| Route | Handler anchor |
|---|---|
| `src/app/api/chat/route.ts` | `postChat` chat.ts:780 |
| `src/app/api/chat/sessions/**` | session list/detail/messages; `regenerate` |
| `src/app/api/rag/search/route.ts:10` | programmatic RAG search (Feature 09) |
| `src/app/api/embed/chat/route.ts:54` | widget chat (Feature 13, same grounding core) |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/assistant/api/chat.ts` | `postChat:780`, `postChatKb:364`, stream constructor `:602`, `finalizeQueryEvent` (finally block) |
| `src/modules/rag/grounding.ts` | `groundClaraContext:537`, `GroundingRequest:192`, `GroundedContext:294`, `GroundingOutcome:335`, `resetGroundingCaches:941` |
| `src/modules/rag/config.ts` | `RagMode:4` (classic/hybrid/agentic), `getRagRuntimeConfig:64` |
| `src/modules/rag/retrieval-degradation.ts` | `isStrictRetrievalMode:24` etc. |
| `src/modules/rag/cross-lingual.ts` | translation pipeline (above) |
| `src/modules/rag/turn-guidance.ts`, `knowledge-topics.ts`, `query-embedding-cache.ts` | guidance/topics/cache |
| `src/modules/assistant/api/conversation-context.ts` | context builders `:149-211` |
| `src/modules/rag/grounding.test.ts` | grounding regression suite |

## 7. UI Reference

- Chat window components: `src/modules/assistant/ui/chat/ChatWindow.tsx:41`, `MessageList.tsx:38`, `MessageInput.tsx:9`, `MarkdownMessage.tsx:140`, `RoleBadge.tsx:6`.
- Chart blocks in answers: `chart-block.ts:233` `parseAIChartBlock`, `:266` `splitAssistantChartBlocks`; renderer `AIChartBlock.tsx:277`.
- `src/app/(admin)/dashboard/page.tsx` hosts the assistant; widget chat UI in `src/app/embed/widget/page.tsx`.

## 8. Environment Variables

- `RAG_MODE` / runtime config (classic/hybrid/agentic), strict-retrieval flag, provider vars (Feature 10), `NET_TRACE*` observability (Feature 24, uncommitted wiring in chat.ts).

## 9. Tests

- `src/modules/rag/grounding.test.ts`, assistant module suites, embed chat/search route tests, `src/lib/__tests__/net-trace.test.ts` (uncommitted, 34 tests) — see `scripts/feature-doc/tests.txt`.

## 10. Cross-links

- Retrieval execution — **09 Search & Hybrid** (modes) and **10 AI Provider Core** (embeddings + chat streams).
- The widget surface — **13**; audit/metering — **20**; degradation incidents — **21 Platform Health**.
