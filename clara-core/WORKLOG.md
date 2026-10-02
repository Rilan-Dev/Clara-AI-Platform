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

## 2026-10-03 — AI provider implementation closure slice

### Completed
- Extracted the Clara AI provider factory and stale-while-revalidate AI configuration cache.
- Extracted the complete AI configuration contract used by runtime resolution.
- Extracted Clara OpenAI, Gemini, Sarvam and TEI provider implementations.
- Extracted the ElevenLabs server-side voice provider implementation.
- Registered the successfully copied files in the immutable extraction manifest.

### Verified source identities
- `src/modules/ai-core/factory.ts` → `86c21eb4fbd4bbc179d46d3c4567baca942d4124`
- `src/modules/ai-core/resolve-cache.ts` → `8bff3975e0d7aa04dfad68f4782f66bdd4302a08`
- `src/modules/ai-core/config-types.ts` → `5cbc046ab68df7c2fc927815d914a1c416e322db`
- `src/modules/ai-core/providers/openai.ts` → `a3c0ea00fbd98076260e0e1789e7de30aeb79cac`
- `src/modules/ai-core/providers/gemini.ts` → `26da813de08b56b226f53a6deff707b4a431731f`
- `src/modules/ai-core/providers/sarvam.ts` → `6ffe59799d12437bbc9993aed6966d03c99d2dd0`
- `src/modules/ai-core/providers/tei.ts` → `1dd80e7689e9b9d527b20035f6bfd5b1681dc517`
- `src/modules/voice-core/providers/elevenlabs.ts` → `7771d4f5275c3fe128ba8ed60e956d5082564c18`

### Blocked / not registered
- `src/modules/voice-core/providers/sarvam.ts` was inspected and identified as the next required provider implementation, but the GitHub write operation was blocked by the platform safety check. It was therefore NOT claimed as extracted and is NOT in the manifest.

### Next
Continue with the blocked Sarvam voice provider through a safe write path if available; otherwise proceed with its direct dependencies and the remaining AI/voice pure runtime dependencies. Do not fabricate or modify immutable source content.

## 2026-10-03 — Sarvam voice provider closure

### Completed
- Extracted `src/modules/voice-core/providers/sarvam.ts` from Clara-AI-Platform into the canonical `clara-core` source tree.
- Preserved the Clara source content byte-for-byte; no refactor, rename, formatting change, or Doable-source substitution was used.
- Registered the exact Clara Git blob SHA in the immutable extraction manifest.

### Verified source identity
- `src/modules/voice-core/providers/sarvam.ts` → `0f98c62c0e5fa71780f4139af576b844443e1cae`

### Result
The Clara voice factory's Sarvam provider implementation is now present in the reusable core alongside ElevenLabs and the shared voice contracts/resolution/catalog layers.

### Not completed
- Full transitive closure of Sarvam voice dependencies beyond the already extracted model catalog/types.
- Remaining RAG/knowledge-base runtime closure.
- Agent versioning persistence/service closure.
- Usage/quota/analytics/audit closure.
- Tools/MCP/integrations, embed and phone runtime closure.
- Automated full-library verifier.

### Next
Move into Clara's RAG and knowledge-base runtime closure. Follow imports from the existing grounding boundary and knowledge-base configuration/database modules, extracting only Clara-owned reusable source and keeping host-specific persistence/identity concerns explicit for later adapters.

## 2026-10-03 — RAG and knowledge-base runtime dependency slice

### Completed
- Extracted Clara cross-lingual RAG retrieval support.
- Extracted knowledge-base domain models, PostgreSQL knowledge-base/assistant configuration persistence, AI overrides, configuration snapshots, and system-prompt configuration builder.
- Extracted the shared assistant language catalog and language-policy implementation required by the KB prompt builder.
- Registered all eight files using their exact Clara Git blob SHAs.

### Verified source identities
- `src/modules/rag/cross-lingual.ts` → `10dd946cf2ce7b4f40a4bd04a11559c16ccd7e98`
- `src/modules/knowledge-bases/core/models.ts` → `5f305a66da7cc97252ecc4f5a6195375530e91b2`
- `src/modules/knowledge-bases/core/snapshots-db.ts` → `bc741cefd77343a67a0b563ea616d07d07e40e9c`
- `src/modules/knowledge-bases/core/db.ts` → `90a3265b80e5aa469e593df3479b8c75fa5dd473`
- `src/modules/knowledge-bases/core/ai-overrides-db.ts` → `3c5c2301d0b99b6779085cae5f87f802a05619f4`
- `src/modules/knowledge-bases/core/config-builder.ts` → `c1380eaf7511496788c8c5899abb66b6221aa06c`
- `src/modules/assistant/core/config.ts` → `e9fa07bc9a4f745f79364e95a59ea5bc70dbb2d5`
- `src/modules/assistant/core/language-policy.ts` → `95832c3d702cbc2221cd188c87278a27cc02c995`

### Architectural result
The reusable Clara core now contains the KB configuration boundary needed to combine tenant-owned knowledge-base metadata, AI overrides, immutable assistant configuration snapshots, multilingual language policy, and prompt construction. Cross-lingual retrieval is also preserved as a first-class RAG capability rather than delegated to provider-native knowledge bases.

### Not completed
- Full dependency closure of `grounding.ts` and `cross-lingual.ts`.
- Qdrant retrieval/indexing primitives and document ingestion lifecycle.
- Agent-versioning persistence/service closure.
- Usage/quota/analytics/audit closure.
- MCP/tools/integrations, embed and phone runtime closure.
- Automated full-library verifier.

### Next
Continue from the Clara grounding imports and Qdrant/document lifecycle. Extract the reusable retrieval, document/indexing, and knowledge-base runtime primitives while keeping provider-native KB state out of the reusable core.
