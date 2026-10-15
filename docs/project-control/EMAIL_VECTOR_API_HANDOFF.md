# Email Vector API Implementation Handoff

Date: 2026-10-16
Role: DEV-01 / Forge
Repository: Rilan-Dev/Clara-AI-Platform
Branch: feature/email-vector-api
Status: implementation authored; executable verification pending; not production-ready.

## Scope implemented

- Added POST /api/internal/email-vectors, protected by a dedicated bearer secret CLARA_EMAIL_VECTOR_API_KEY with constant-time comparison for equal-length credentials, fail-closed missing-secret behavior, request-size limit, strict action/input validation, no-store responses, and generic client-facing operation errors.
- Added a separate email-vector store module. Email vectors are not written into a Knowledge Base collection.
- Added deterministic point IDs based on organization/account/message/chunk index.
- Added per-organization, embedding-model-specific collections, mandatory org + allowed-account search filters, and a second application-side scope check over returned results.
- Added upsert/reindex, stale chunk cleanup, metadata-only update, semantic search, delete-message, purge-account, and purge-organization operations.
- Delete and metadata operations search all model-version collections for the organization so old model-specific copies can be updated/removed. Successful reindex writes the new model collection before removing older copies for that message.
- Added focused API boundary tests for missing secret, invalid bearer token, malformed JSON, and empty account allowlist.
- Added docs/plans/EMAIL-VECTOR-API-CONTRACT.md.

## Commits on this branch

- 7abdc3277043daf7a67787fd29d6922a9582cb4a — email vector store
- 203b21549c3b236a40bb2f390bd14ac7a4bd4919 — authenticated API route
- 2e4ce02a73f658e9ba055c0392c58299e904c350 — cleanup result and chunk source IDs
- a7cdc37e16b88da5ec22aab794c40abd7536d6f6 — API contract documentation
- e94128c528a106e7ad85602f6bbfaff538f5e45e — API boundary tests
- f2b38d4c149a3f7963d9ecbb05573f1bdf3d216c — organization-scoped collections and cross-version cleanup
- 5e96710c099db0bb6d76a6bfbd0b94d2197e0363 — remove obsolete model copies after successful reindex

## Security and release boundary

The shared service credential authenticates the trusted server caller; it does not prove that a given end user is entitled to a mailbox. The ai-comms-agent caller must resolve active organization/account grants on every search and pass the exact allowedAccountIds set. ISS-026 remains an explicit release blocker for Chat/realtime-voice integration. Do not connect the current route to user-facing retrieval before FIX-01 closes ISS-026.

The API is not yet production verified. No typecheck, lint, unit test execution, build, live Qdrant request, embedding request, account-isolation runtime test, or latency benchmark has been run. Source review and file writes are not executable verification. No production secrets were configured and no live data was modified.

## Known follow-up risks

- Qdrant client method/type compatibility and actual embedding dimensions must be confirmed by typecheck and tests.
- Current implementation uses a shared bearer service secret. Before any caller beyond the trusted worker is added, prefer scoped credentials or signed requests and rotate the key on exposure.
- Semantic search is candidate retrieval only. Exact date ranges, counts, recency completeness, and authoritative message contents remain PostgreSQL responsibilities.
- Collection/model transition and stale deletion behavior need Qdrant integration tests, especially interrupted writes and provider/model changes.
- Current repository tree has docs/project-control/sessions but the usual top-level CHAT_CONTINUITY.md and NEXT_ACTION.md were not present on the selected default branch during this task; this handoff records the state without reconstructing missing project governance files from memory.

## Exact next action

1. Run targeted typecheck/test/lint for the new route and vector-store module, fixing any source issues evidenced by results. Do not wait for CI or deployment gates.
2. Add/complete Qdrant integration tests for deterministic IDs, tenant/account filters, stale chunk deletion, metadata updates, and purge across model collections.
3. Update the ai-comms-agent adapter contract to call this endpoint, but keep the adapter and shared Chat/realtime-voice retrieval disconnected until FIX-01 closes ISS-026.
4. Once ISS-026 is closed, bind the existing PostgreSQL outbox to this API, start the vector sync loop, then implement shared PostgreSQL + Qdrant retrieval with authoritative SQL revalidation and citations.
5. OPS-01 owns live infrastructure, initial ingestion, isolation runtime evidence, and p50/p95 latency/correctness/freshness acceptance.



## Follow-up source additions — 2026-10-16

- The API now accepts a nullable received timestamp for valid provider messages that lack one.
- Upsert accepts contentHash, metadataHash, and per-chunk contentHash. When stored content hash, chunk indices, and per-chunk hashes match, the implementation updates payload metadata without embedding again. If content/chunk identity differs, it re-embeds and upserts.
- ai-comms-agent now has an unbound adapter draft at `apps/worker/src/knowledge/clara-email-vector-adapter.ts` on its own feature branch/PR #23. The adapter is intentionally not activated because ISS-026 remains open and Clara API checks are pending.
- These are additional source edits only; executable tests/typecheck/build and live Qdrant checks remain unrun. A local clone attempt could not resolve github.com in this execution environment, so no local commands were executed.

## Focused source review follow-up — 2026-10-16

- Corrected request-body limit enforcement to count UTF-8 bytes rather than JS string characters.
- Upsert and metadata-update now accept explicit null/empty sender, subject, labels, and receivedAt values where supported, allowing stale Qdrant payload metadata to be cleared. Field absence still means leave that field unchanged.
- Added opt-in Qdrant integration coverage at src/modules/email-vectors/core/qdrant-filter.integration.test.ts for organization + allowed-account filtering and scoped deletion. Configure QDRANT_INTEGRATION_URL and optionally QDRANT_INTEGRATION_API_KEY to run it.
- No tests/typecheck/lint/build/live Qdrant call were run in this work session. Do not mark the PR verified or production-ready.
