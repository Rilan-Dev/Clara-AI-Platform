# Extraction Worklog

## 2026-10-03 — Initial executable extraction started

### Completed
- Created ai-platform-core/doable-source/.
- Pinned Doable source commit a6036d1fd6dca83c08ee5affa141e5c85e45f5af.
- Extracted the first 10-file multi-provider AI foundation slice.
- Verified all 10 target blob SHAs exactly match the Doable source blobs.
- Added extraction-manifest.json with source provenance and expected blob identities.
- Added immutable-source README.

### Not completed
- Provider discovery/runtime implementation.
- AI engine and modes.
- Tool registry/tool execution.
- MCP/integration bridges.
- Context/memory.
- Chat routes and persistence.
- Dependency closure.
- UI reference.
- External dependency inventory.
- Automated full-tree verifier.

### Next extraction slice
Extract the direct dependency closure for services/api/src/ai/provider-discovery.ts, provider-discovery-helpers.ts, embedding-resolver.ts, then the engine foundation: engine-types.ts, engine.ts, engine-resolver.ts.

Every copied file must retain its original Doable blob SHA. Do not edit the copied source to satisfy Clara imports; dependency/adapter work belongs outside the immutable tree.
