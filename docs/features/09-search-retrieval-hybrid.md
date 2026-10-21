# 09 — Search & Hybrid Retrieval

> Clara AI Platform feature documentation · Domain: `admin/core/hybrid-search` + `rag` modes + `graph` · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

Retrieval quality decides answer quality. This feature is the search layer beneath RAG chat: the programmatic search API (`/api/rag/search`), the widget search API (`/api/embed/search`), the three retrieval modes (classic vector, hybrid vector+keyword, agentic), result diversification so one document can't monopolise an answer, and the GraphRAG extension that walks entity relationships for multi-hop questions. Its purpose is precision and coverage: the right chunks, from the right documents, with enough diversity for balanced answers.

## 2. Business Logic

- **Modes** — `rag/config.ts:4` defines `RagMode = "classic" | "hybrid" | "agentic"`; `getRagRuntimeConfig:64` resolves the active mode (env default, per-request override). Hybrid runs vector similarity plus keyword/BM25-style scoring and fuses results; agentic adds multi-step retrieval planning.
- **Hybrid engine** — `searchHybrid` (`src/modules/admin/core/hybrid-search.ts:30`) executes the fused query against the KB's Qdrant collection and Postgres full-text, merges and re-ranks.
- **Diversification** — `rag/diversify.ts`: candidate pool sizing `candidatePoolSize:25` with `CANDIDATE_MULTIPLIER:5` and `MAX_CANDIDATE_POOL:30`; `diversifyByDocument:29` caps per-document representation before final top-k selection.
- **GraphRAG** — `src/modules/graph/core/`: `graph-store.ts` (entity/relation persistence), `graph-retriever.ts` (relationship walks), `types.ts`; grounding surfaces graph hits as `GraphSource` entries (grounding.ts:262) alongside vector sources.
- **Programmatic API** — `POST /api/rag/search` (`src/app/api/rag/search/route.ts:10`) → `postRagSearch` (`src/modules/assistant/api/rag.ts:29`): org-authenticated search returning sources + context for external integrations.
- **Widget API** — `POST /api/embed/search` (`route.ts:70`): KB-API-key-authenticated search powering the embeddable widget's search surface; same retrieval core, embed quota accounting.
- **Query embedding** — cached via `rag/query-embedding-cache.ts:42` to avoid re-embedding repeated queries.

## 3. Business Rules

- Retrieval always runs against the ACTIVE deployment's snapshotted KB collections (Feature 04) — draft edits never leak into live answers.
- Diversification caps single-document dominance so answers reflect the whole KB (business fairness rule for multi-source answers).
- Widget search is metered against the KB API key's quota (Feature 24) and degrades gracefully (curated errors, x-request-id correlation).
- Mode selection is centrally governed (`getRagRuntimeConfig`) — no per-route hardcoding of retrieval behaviour.
- Cross-lingual queries are translated before retrieval when the KB language differs (Feature 08 cross-lingual pipeline).
- Search authorization is tenant-bound (FIX-01 @ ac7d945f): direct search requires tenant KB authorization, public embed credentials are pinned to the published deployment scope (draft/foreign KB selection is rejected), unowned legacy document-only retrieval is disabled, and catalog document overviews are authorized before any Qdrant lookup.

## 4. Data Model

- Qdrant collections (vector) + Postgres chunk tables (keyword side); graph entities/relations tables (graph module); scraping/documents schema from Features 05-06.

## 5. API Surface

| Route | Handler anchor |
|---|---|
| `src/app/api/rag/search/route.ts:10` | programmatic search |
| `src/app/api/embed/search/route.ts:70` | widget search (no committed NET_TRACE instrumentation) |
| `src/app/api/embed/rag/route.ts` | widget RAG context |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/admin/core/hybrid-search.ts` | `searchHybrid:30` |
| `src/modules/rag/config.ts` | `RagMode:4`, `getRagRuntimeConfig:64` |
| `src/modules/rag/diversify.ts` | `CANDIDATE_MULTIPLIER:21`, `MAX_CANDIDATE_POOL:22`, `candidatePoolSize:25`, `diversifyByDocument:29` |
| `src/modules/rag/query-embedding-cache.ts` | `embedQueryCached:42`, `clearQueryEmbeddingCache:79` |
| `src/modules/graph/core/{graph-store,graph-retriever,types}.ts` | GraphRAG store/retriever |

## 7. UI Reference

- Search results rendering in `src/modules/assistant/ui/chat/*` (sources listed with answers).
- `src/app/(admin)/kbs/[kbId]/page.tsx` — retrieval diagnostics (chunks, analytics per source).
- Widget search UI — `src/app/embed/widget/page.tsx`.

## 8. Environment Variables

- `RAG_MODE` (default mode), hybrid/agentic tuning vars in `.env.example` RAG section; embedding vars (Feature 10).

## 9. Tests

- `src/modules/rag/grounding.test.ts`, diversify/config suites, embed search route tests (locate current test files in the module directories; the old generated inventory is not committed).

## 10. Cross-links

- Consumed by **08 RAG Chat** (grounding pipeline) and **13 Embeddable Widget**.
- Embeddings from **10 AI Provider Core**; deployment snapshotting from **04**.
