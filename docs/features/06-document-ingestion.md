# 06 — Document Ingestion Pipeline

> Clara AI Platform feature documentation · Domain: `ingest` + `admin/core/ingest` + worker/queue routes · Base: `feature/ai-core-from-doable-source @ 031279b4` (includes ingest-integrity fixes PR #299)

## 1. Definition & Purpose

The ingestion pipeline turns raw material — PDF/DOCX/XLSX/HTML/text uploads and crawled pages — into searchable, embedded knowledge: parse → chunk → embed (Gemini/OpenAI) → upsert into the KB's Qdrant collection. It is the production path whose 2026-10 outage (connect-timeout storm, batch count mismatch) was root-caused and fixed in this workstream, and whose integrity was just hardened (spreadsheet empty-cell positions, mid-word overlap boundaries — PR #299). Its purpose is reliable, honest indexing: a document is `ready` only when every chunk is embedded and upserted; any failure marks it `failed` and recoverable via Retry.

## 2. Business Logic

- **Upload & validation** — `/api/kbs/[kbId]/documents` accepts multi-file uploads; virus scanning (`ingest/virus-scan.ts:42` `scanUpload`, enabled check `:38`, unavailable error `:93`) gates storage. `ParserFactory` (`ingest/factory.ts:8`) selects the parser by file type.
- **Parsing** — parsers implement `DocumentParser` (`ingest/types.ts:7`): `TextParser:3` (text.ts), `HtmlParser:16` (html-parser.ts), `DocxParser:20` (docx.ts), `XlsxParser:4` (xlsx.ts — now preserves empty-cell positions, commit `571ac1f5`), `PDFParser:86` (pdf.ts).
- **Chunking** — `RecursiveCharacterTextSplitter` (`ingest/chunkers/recursive.ts:3`) produces overlap-aware chunks; overlap now aligns to lexical boundaries so words are never split mid-word (commit `454b740e`, tests `bc3d9e40`).
- **Embedding & upsert** — `vector-store-kb.ts` `embedBatches:211` sends one batched request per document batch with a 429-aware retry ladder, then `upsertDocumentsKb:293` writes points; `isUnreachableEmbeddingError:151` classifies connect failures. The Gemini provider degrades to sequential single-text embeds when a vendor returns a mismatched count (production-verified degrade path — Feature 10).
- **Queue execution** — uploads enqueue via BullMQ (`/api/queue/ingest`, `queue/index.ts`); the worker consumes (`/api/worker/ingest`, `src/modules/knowledge-bases/worker`, Docker service `clara-worker`); reindex route `/api/worker/reindex` handles embedding-default realignment.
- **Reprocess & retry** — per-document `/reprocess` and `/reprocess-all` re-run the pipeline. Raw provider errors are stored for platform operations but are replaced with curated document/status/retry responses before reaching organisation clients (`core/public-processing-error.ts`, `api/documents.ts`). The ingestion worker reports embedding-provider failures through `recordEmbeddingRuntimeFailure` to the platform incident system (Feature 21).

## 3. Business Rules

- Fail-fast: a connect-unreachable embedding error fails the document immediately instead of grinding retries (R1 fix, commit `985e6afe`).
- One HTTP request per batch / one connection per document (batch contract honoured; sequential degradation is the safety net — R2, commit `bfc7b816`).
- A document is `ready` only after ALL chunks are embedded and upserted; partial states are `failed` with recoverable Retry. Failed document JSON must not expose provider quota payloads, upstream hostnames, API keys, or stored ingest file bytes (FIX-01 source correction).
- Chunk boundaries never split words (lexical-boundary overlap rule, PR #299).
- Spreadsheet cells keep their column positions across parsing (empty cells preserved, PR #299).
- Virus-scan failures reject the upload; scan-unavailable is an explicit error class, not a silent pass.

## 4. Data Model

- Documents/chunks tables — `003_documents_ingest.sql`; queue state in Redis (BullMQ); Qdrant collections per KB.

## 5. API Surface

| Route | Purpose |
|---|---|
| `src/app/api/kbs/[kbId]/documents/**` | upload/list/delete/reprocess/chunks (Feature 05) |
| `src/app/api/queue/ingest/route.ts`, `queue/retry`, `queue/crawl`, `queue/scrape` | enqueue jobs |
| `src/app/api/worker/ingest/route.ts`, `worker/reindex`, `worker/scrape` | worker-side execution (cron/queue triggers) |
| `src/app/api/ingest/route.ts`, `src/app/api/documents/**` | public/platform ingestion surfaces |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/ingest/types.ts` | `ParsedDocument:1`, `DocumentParser:7`, `TextChunker:22`, `ChunkerOptions:29` |
| `src/modules/ingest/factory.ts` | `ParserFactory:8` |
| `src/modules/ingest/parsers/{text:3, html-parser:16, docx:20, xlsx:4, pdf:86}.ts` | parser classes |
| `src/modules/ingest/chunkers/recursive.ts` | `RecursiveCharacterTextSplitter:3` |
| `src/modules/ingest/virus-scan.ts` | `isVirusScanEnabled:38`, `scanUpload:42`, `VirusScanUnavailableError:93` |
| `src/modules/admin/core/vector-store-kb.ts` | `embedBatches:211`, `upsertDocumentsKb:293`, `isUnreachableEmbeddingError:151` |
| `src/modules/admin/core/ingest/{document-loader,web-loader,chunker,index}.ts` | loader + pipeline orchestration |
| `src/modules/knowledge-bases/worker/` | worker loop implementation |

## 7. UI Reference

- `src/app/(admin)/kbs/[kbId]/page.tsx` — document list, status, chunk inspection, Retry button.
- `src/app/(admin)/orgs/[id]/agents/[agentId]/knowledge/page.tsx` — upload entry for agent KBs.
- `src/features/admin/screens/kb-detail-screen.tsx` + `src/features/admin/screens/agent-workspace/knowledge-screen.tsx`.
- `src/app/(platform)/ingest/page.tsx` — platform ingestion page.

## 8. Environment Variables

- `EMBED_MAX_RETRIES` (retry ladder depth), embedding provider/model vars (Feature 10), `VIRUS_SCAN_*` (ClamAV endpoint), `QDRANT_*`, Redis/BullMQ vars (Feature 25).

## 9. Tests

- `src/modules/ingest/__tests__/document-parsers.test.ts` (spreadsheet alignment), `src/modules/ingest/__tests__/recursive-chunker.test.ts` (overlap), vector-store-kb suites, `src/modules/knowledge-bases/api/documents.error-privacy.test.ts` (tenant response safety), and `src/modules/knowledge-bases/worker/ingest-worker.incident.test.ts` (admin incident emission). Newly authored regression sources have not been executed in this session.

## 10. Cross-links

- Embedding execution — **10 AI Provider Core** (Gemini batch contract + degradation).
- Queue/worker transport — **25 Background Jobs**.
- Ready documents feed **08 RAG Chat** retrieval; scrape-sourced documents come from **07**.
