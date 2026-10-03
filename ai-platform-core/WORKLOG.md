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


## 2026-10-03 — Provider resolution slice

### Completed
- Extracted provider-discovery.ts, provider-discovery-helpers.ts, embedding-resolver.ts and engine-types.ts byte-for-byte from the pinned Doable commit.
- Verified all four source blob SHAs against the extracted target files.
- Extended extraction-manifest.json with all four immutable files.

### Current state
- 14 immutable Doable files are now physically present under ai-platform-core/doable-source/.
- No extracted source has been modified for Clara compatibility.
- The executable verifier is present at ai-platform-core/verification/verify-extraction.mjs.

### Next
- Extract engine.ts and its complete direct local dependency closure before extracting engine-resolver.ts.
- Continue following imports rather than copying isolated files.


## 2026-10-03 — AI engine dependency closure slice

### Completed
- Extracted context-builder.ts, tool-messages.ts, attachments.ts, and project-files.ts byte-for-byte from the pinned Doable source.
- Registered all four immutable files and their source blob SHAs in extraction-manifest.json.
- Preserved the existing engine.ts extraction and provider-resolution slice without modifying immutable source.

### Dependency findings
- context-builder.ts reaches context manager/injector, project file manager, environment/marketplace/skills data access, integration prompt manifests, MCP prompt manifests, per-app DB/AI prompt blocks, and project metadata.
- project-files.ts reaches path-safety, collaboration/Yjs bridge, TanStack Start protection, MCP-agent misuse protection, and Supabase misuse/provision/schema guards.
- attachments.ts is a document/media processing boundary and must retain its parser/temp-file and SDK attachment behavior plus its external package dependencies.
- tool-messages.ts contains presentation/sanitization behavior used by the AI tool runtime and chat history reconstruction.

### Not completed
- Full transitive dependency closure for these four files.
- engine-resolver.ts and mode-specific runtime modules.
- Tool registry/execution, MCP/integration runtime, memory/context manager, and persistence closure.

### Next
- Continue from the newly extracted files by resolving their direct local imports and shared package imports before adding higher-level AI modes or adapters.
- Do not substitute Clara implementations for Doable source dependencies inside the immutable tree.
