# SESSION-008 — Qdrant REST client breaking API migration

- Date: 2026-10-12
- Repository: `Rilan-Dev/Clara-AI-Platform`
- Branch: `feature/ai-core-from-doable-source`

## Root cause

User-provided container logs reported `[rag] postRagSearch: TypeError: a.search is not a function` on the embed RAG request. The branch declares `@qdrant/js-client-rest: ^1.19.0`. Upstream client v1.19.0 removed `QdrantClient.search()`; retrieval must use `query()` and unwrap the returned `{ points }` envelope. Reference: https://github.com/qdrant/qdrant-js/blob/master/packages/js-client-rest/CHANGELOG.md

## Changes

- Migrated the grounding KB vector search to `client.query(collection, { query: embedding, ... })` and mapped `response.points`.
- Migrated public embed search, legacy/hybrid retrieval, and shared vector-store search to the same query API.
- Updated grounding tests/mocks to return `{ points: [...] }` and use `query()` for the missing-collection and cross-lingual paths.

Changed files:

- `src/modules/rag/grounding.ts`
- `src/modules/embed/core/search.ts`
- `src/modules/admin/core/hybrid-search.ts`
- `src/modules/admin/core/vector-store.ts`
- `src/modules/rag/grounding.test.ts`

## Verification state

- Source changes committed via GitHub API: `ff30781c`, `d5bf1a67`, `757edaf2`, `cfe2945c`, `c971c5b3`, `dde8c781`.
- Not run here: type-check, unit tests, Docker rebuild, live Qdrant retrieval, or voice benchmark.
- The already-running container still needs to be rebuilt/recreated from this updated branch before the fix can take effect.
- Next.js Server Reference ID errors and ElevenLabs 403 responses remain separate issues.

## Next action

Pull branch, run type-check and focused tests, rebuild/recreate `clara-backend`, verify one `/api/embed/rag` request returns success, and then rerun the five-turn voice benchmark.
