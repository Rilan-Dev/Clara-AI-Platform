# 10 — AI Provider Core (Multi-LLM Abstraction)

> Clara AI Platform feature documentation · Domain: `ai-core` · Base: `feature/ai-core-from-doable-source @ 1adb80bf` (gemini.ts/openai.ts carry uncommitted NET_TRACE per-vendor-call wiring)

## 1. Definition & Purpose

The AI Provider Core is Clara's vendor abstraction: one `LLMProvider` interface, two reference implementations (Gemini via `@google/genai`, OpenAI via the official SDK), plus embedding-capable interfaces with batching, retry ladders, and model fallback. Every chat stream, embedding, and tool call in the platform flows through this layer, which is also where the 2026-10 embedding outage was fixed (single-request batching, sequential degradation, fail-fast connect classification) and where the relay-aware egress (`GEMINI_BASE_URL`) lives. Its purpose is vendor independence with production-grade transport behaviour: predictable retries, honest failure classification, and observable egress.

## 2. Business Logic

- **Provider contract** — `src/modules/ai-core/` defines the `LLMProvider` / `ToolCallingLLMProvider` / embedding interfaces; `GeminiProvider implements LLMProvider` (`providers/gemini.ts:61`), `OpenAIProvider implements LLMProvider, ToolCallingLLMProvider` (`providers/openai.ts:134`).
- **Chat streaming** — Gemini `chatStream` wraps `streamGenerateContent?alt=sse` with a thinking-off retry; OpenAI `chatStream`/`chatStreamWithTools` wrap `chat/completions` with tool-call delta normalisation (`normalizeOpenAIToolCallDeltas:84`, `toOpenAIToolDefinitions:57`) and reasoning-effort selection (`reasoningEffortFor:124`, capability checks `supportsTemperature:101`, `usesMaxCompletionTokens:109`).
- **Embeddings** — Gemini `embedText`/`embedBatch` use the single-request `batchEmbedContents` RPC (R1 fix); when a vendor returns fewer embeddings than requests (the 1-of-N count mismatch), the provider degrades to sequential single-text embeds (R2 fix, production-verified 315-chunk ingest). OpenAI `embedText`/`embedBatch` wrap `embeddings`.
- **Retry ladder** — `vector-store-kb.ts:211` `embedBatches` retries vendor 429s with exponential backoff (1s/2s/4s, `EMBED_MAX_RETRIES`) and classifies connect-unreachable failures for fail-fast (`isUnreachableEmbeddingError:151`).
- **Relay awareness** — Gemini egress honours `GEMINI_BASE_URL` when set (local relay); construction-time warnings surface misconfiguration.
- **Observability (uncommitted NET_TRACE wiring)** — every vendor HTTP call site (chat streams, embeddings) emits a Network-tab-style upstream row: relay-aware URL, HTTP status auto-extracted from SDK errors, duration, attempt, compact response summary at `verbose` (see Feature 24).

## 3. Business Rules

- One HTTP request per embedding batch / one connection per document (batch contract); sequential degradation is the documented safety net when the vendor breaks the count contract.
- 429 storms are absorbed by the retry ladder before a document is marked failed; a document failure is always recoverable via Retry (never silent data loss).
- Connect-unreachable embedding endpoints fail the document FAST (no 20-minute grind) — R1's fail-fast rule.
- Thinking/reasoning knobs are applied per model capability, not blindly (`geminiThinkingCanBeDisabled:511`, `usesMaxCompletionTokens:109`).
- Tool-call streams preserve delta ordering and finish reasons exactly; tool errors never fabricate success.

## 4. Data Model

- No tables; stateless transport layer. Model availability lists come from the catalog (Feature 11); settings from Feature 12.

## 5. API Surface

- No direct routes — consumed by chat (`/api/chat`, `/api/embed/chat`), search (`/api/rag/search`, `/api/embed/search`), ingestion (worker), and language/voice modules. Provider test route: `/api/platform/ai/providers/[providerId]/test`.

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/ai-core/providers/gemini.ts` | `GeminiProvider:61` (chatStream, embedText, embedBatch + degrade), `geminiThinkingCanBeDisabled:511`, `resetEmbeddingBatchDiagnosticsForTests:520` |
| `src/modules/ai-core/providers/openai.ts` | `OpenAIProvider:134`, `toOpenAIToolDefinitions:57`, `normalizeOpenAIToolCallDeltas:84`, `supportsTemperature:101`, `usesMaxCompletionTokens:109`, `reasoningEffortFor:124` |
| `src/modules/admin/core/vector-store-kb.ts` | `embedBatches:211` (retry ladder), `isUnreachableEmbeddingError:151` |
| `src/modules/ai-core/` (14 files) | provider registry, capability types, model kind slots (`074_ai_sts_model_kind.sql` era) |

## 7. UI Reference

- Indirect: chat UI (Feature 08), KB screens (status/error messages), AI settings screens (Feature 12).
- Super-admin provider console: `src/app/(admin)/ai-platform/page.tsx` (providers CRUD/test — Feature 22).

## 8. Environment Variables

- `GEMINI_API_KEY`, `GEMINI_BASE_URL` (relay), `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `EMBED_MAX_RETRIES`, embedding defaults (`PLATFORM_EMBEDDING_*`, Feature 12), `NET_TRACE*` (Feature 24).

## 9. Tests

- `src/modules/ai-core/providers/gemini.relay.integration.test.ts` (10 tests incl. relay + count-mismatch visibility), `src/modules/ai-core/providers/openai.net-trace.test.ts` (uncommitted, 4 tests), provider unit suites, `vector-store-kb` retry tests.

## 10. Cross-links

- Consumed by **06 Ingestion**, **08 Chat**, **09 Search**, **14-16 Voice**, **19 Language**.
- Catalog/entitlement gating — **11**; per-org model choice — **12**.
