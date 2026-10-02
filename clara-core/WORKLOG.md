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

## 2026-10-03 — Voice and OpenAI Realtime dependency slice

### Completed
- Extracted Clara voice resolution contracts, canonical voice model catalogue, voice-provider resolver, and voice provider factory.
- Extracted the OpenAI Realtime transport builder/client-secret exchange and OpenAI capability catalogue used by the realtime runtime.
- Registered all six files in the immutable extraction manifest.

### Verified immutable files
- `src/modules/voice-core/config-types.ts` → `ae8e6cb54e7844c7040da8a12d58e83bc5656abb`
- `src/modules/voice-core/model-catalog.ts` → `026d5f9e3c3751f09f4bd6970e50ac3bd1cf7edc`
- `src/modules/voice-core/resolve.ts` → `ffeea456e4cd8e67895c5aeb12660b95b2ffc44b`
- `src/modules/voice-core/factory.ts` → `c0476d170b338c7aff4b40259fa4bb35ffa87ddd`
- `src/modules/assistant/api/openai-realtime.ts` → `75f51414d5f4820324dbabd583417f2d150f358e`
- `src/modules/assistant/api/openai-catalog.ts` → `55ffce4b8ee3ff228479ada72312b3c2923ac6f0`

### Not completed
- Voice provider implementations referenced by the factory (ElevenLabs and Sarvam).
- Remaining AI-core factory/cache/config dependencies.
- Remaining voice realtime primitives and provider-specific relay implementations.
- KB, agent-versioning, usage/quota, analytics/audit, integrations/MCP, embed and phone closures.

### Next
Follow the imports from the voice factory/resolver and AI runtime next. Extract provider implementations and their pure/shared dependencies without copying host-only API adapters prematurely. Preserve byte-for-byte source identity and verify every source/target blob before manifest registration.
