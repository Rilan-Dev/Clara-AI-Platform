# Clara Core Extraction Worklog

## 2026-10-03 — Clara-owned library established

### Completed
- Established `clara-core/` as the canonical reusable Clara library.
- Changed extraction scope to Clara-AI-Platform only.
- Explicitly separated Doable from the extraction source; Doable remains reference-only.
- Extracted seven Clara source files byte-for-byte.
- Registered their exact Clara Git blob SHAs.

### Extracted capability slice
- Clara runtime orchestration
- AI provider contracts
- AI configuration resolution
- Clara RAG grounding boundary
- Agent version/branch/deployment types
- Voice provider contracts
- Agent AI/runtime language and voice selection

### Not completed
- Full transitive dependency closure.
- Provider factory implementations.
- AI governance/registry closure.
- Knowledge-base persistence and ingestion closure.
- Agent versioning service/database closure.
- Voice runtime/provider implementations.
- Usage/quota/analytics/audit closure.
- MCP/tools/integrations closure.
- Host adapter contracts.
- Automated full-library verifier.

## Next
Continue extracting dependencies from the Clara source tree itself, starting from the seven extracted capabilities. Follow Clara imports until each capability is self-contained, then package explicit host adapters around identity, tenancy, persistence, secrets, billing and deployment.

## 2026-10-03 — AI governance and runtime dependency slice

### Completed
- Extracted Clara AI governance types, plan entitlement resolution, live provider catalog synchronization, and capability resolution.
- Extracted the Clara AI model catalog used by provider/model validation.
- Extracted conversation-aware context utilities used by chat/runtime follow-ups.
- Extracted the existing Clara OpenAI Realtime session runtime as a reusable source boundary.
- Verified every extracted file in this slice by comparing the source and target Git blob SHA; all seven matched exactly.

### Verified immutable files
- `src/modules/ai-governance/core/types.ts` → `e55b68fb959aec043d23ffe29fa9182673d255ab`
- `src/modules/ai-governance/core/entitlements-db.ts` → `d478c70090535c655f35fe3dd7d52a8121e691f5`
- `src/modules/ai-governance/core/live-catalog.ts` → `27166f8cc55f670d37f873469adfd0e0358b4c42`
- `src/modules/ai-governance/core/resolver.ts` → `651ed9b0477564b04e0262fe6a3945a0316b9bda`
- `src/modules/ai-core/model-catalog.ts` → `53775b1b857982c4da21df3bf6f865977233795d`
- `src/modules/assistant/api/conversation-context.ts` → `683e7c1d73642e0c50b3c4ee355c27ae7d8f505e`
- `src/modules/assistant/api/realtime.ts` → `980df0bc8405cf1b53aa2d78e2b9d118ca4455a8`

### Architectural result
The Clara core now has the registry/entitlement/capability-resolution boundary required to prevent host applications from depending directly on raw provider infrastructure state. Realtime remains provider-axis driven while grounding stays on Clara's RAG boundary.

### Not completed
- Transitive dependencies of the newly extracted governance resolver and realtime runtime.
- Provider implementation closure and voice realtime helpers.
- Knowledge-base retrieval/configuration persistence closure.
- Agent versioning DB/service closure.
- Usage, quota, analytics and audit closure.
- MCP/tools/integrations, embed and phone runtime closure.
- Explicit host adapter contracts and the final immutable-library verifier.

### Next
Continue from the newly extracted imports, prioritizing the direct dependencies required to make governance, model resolution, conversation runtime, and realtime self-contained. Keep every extraction byte-for-byte and verify source/target Git blob identity before registering it in the manifest.
