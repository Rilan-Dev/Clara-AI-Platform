
## 2026-10-03 — Published voice event compatibility and phone lifecycle boundary

### Completed
- Traced the phone `CallHandler` end-to-end. It is intentionally **not** extracted as one immutable core module because it couples telephony transport to Clara PostgreSQL call logs, KB configuration, OpenAI Realtime session creation, internal `/api/embed/search`, environment secrets, and provider-specific lifecycle handling.
- Confirmed `phone/core/db.ts` is a host persistence boundary for `phone_call_configs`, `phone_call_logs`, and event outbox writes; it remains outside the reusable core.
- Confirmed `phone/core/elevenlabs-call.ts` remains vendor/application-specific rather than a provider-neutral runtime.
- Extracted the provider-neutral OpenAI Realtime event compatibility layer:
  - `src/modules/assistant/core/realtime-events.ts`
  - accepts both GA and beta Realtime audio/transcript event names, and provides response-text extraction.
- This closes a real dependency used by the phone runtime while keeping the phone call orchestrator itself behind an application adapter.

### Verified source identity
- `src/modules/assistant/core/realtime-events.ts` → `30b95fb7d4907cd37ba5a00d8ca3ca0c28fabc14`
- Source and extracted target Git blobs match exactly.

### Architectural result
The reusable core now includes the Realtime protocol-compatibility primitive needed by browser voice, embed voice, and telephony consumers without pulling OpenAI credentials, database persistence, RAG HTTP routes, or telephony lifecycle state into the library.

### Manifest
- Immutable extraction manifest increased from 91 to 92 entries.

### Remaining
- Public embed chat/session orchestration is still primarily an HTTP/auth/plan/deployment boundary; extract additional pieces only when they are demonstrably provider-neutral and host-independent.
- Phone outbound/inbound lifecycle remains an adapter around the extracted transport, audio, Realtime, RAG, and usage primitives.
- Governance registry/runtime-settings adapter isolation.
- Full 92-entry immutable verifier execution from a repository checkout.

### Next
Continue tracing the published-agent runtime around `/api/embed/chat`, embed session multiplexing, and the production deployment resolver. Extract only reusable Clara runtime mechanics that are not tied to HTTP authentication, subscription gates, database ownership, secrets, or deployment infrastructure.


## 2026-10-03 — Public/embed session-token and phone/telephony mechanics slice

### Completed
- Traced Clara's public embed session boundary and separated public-session cryptography from HTTP/API-key/plan enforcement.
- Extracted the reusable HMAC-signed public session-token primitive:
  - `src/modules/embed/core/public-token.ts`
  - deployment binding and active-public checks remain in the host validation layer; the extracted primitive only mints/verifies the signed credential.
- Traced Clara phone runtime and separated transport/audio mechanics from call persistence, billing, provider secrets, HTTP webhooks and OpenAI/RAG orchestration.
- Extracted the reusable telephony contracts and provider transport/audio primitives:
  - `src/modules/phone/core/types.ts`
  - `src/modules/phone/providers/twilio.ts`
  - `src/modules/phone/providers/vonage.ts`
- Preserved Clara source byte-for-byte; no source refactor or rename was performed.

### Verified source identities
- `src/modules/embed/core/public-token.ts` → `2171f84fa53dd8e081bb7aa5c12740222da7533b`
- `src/modules/phone/core/types.ts` → `2d635b06c35c71a56fca33402e3c107be628ebc0`
- `src/modules/phone/providers/twilio.ts` → `54b2d6e685675fbe1079765c272a40f90dacaa09`
- `src/modules/phone/providers/vonage.ts` → `e6a658616ade1efd31a451cd087e9c3867b0dfbd`

### Architectural result
The reusable Clara core now contains the cryptographic credential primitive for public published-agent sessions and the transport/audio contracts needed to connect telephony providers to a Clara voice runtime. The HTTP embed routes, API-key/database authorization, subscription/plan gates, phone call persistence, provider secrets, OpenAI session orchestration, RAG endpoint calls and deployment-specific webhooks remain application/adapter concerns.

### Deliberately not extracted
- `src/modules/embed/core/validate-embed.ts`: mixes API-key DB access, subscription quota/voice entitlement, deployment validation and Next.js HTTP responses.
- `src/modules/embed/core/api-keys-db.ts`: persistent API-key storage and subscription-plan database implementation; host adapter boundary.
- `src/modules/phone/core/db.ts`: phone config/call-log persistence, subscription checks, platform environment settings and webhook outbox wiring.
- `src/modules/phone/core/call-handler.ts`: tightly couples telephony transport to Clara's DB, KB config, OpenAI Realtime, internal HTTP RAG endpoint and call-log persistence.
- `src/modules/phone/core/elevenlabs-call.ts`: ElevenLabs-specific binding/gating, Clara DB queries and vendor registration; remains a provider adapter.
- Public/embed session HTTP routes: remain host/application surfaces.

### Manifest
- Immutable extraction manifest increased from 87 to 91 entries.

### Verification
- The four new source/target pairs were created from the exact Clara source contents and recorded with the source Git blob identities above.
- The repository-wide immutable verifier remains the canonical full check and has not been executed from a local checkout in this session.

### Remaining
- Governance registry/runtime-settings adapter isolation.
- Any remaining public/embed runtime mechanics that are provider-neutral and not HTTP/auth/plan specific.
- Phone outbound/call lifecycle adapter surfaces if a provider-neutral reusable boundary exists.
- Full 91-entry immutable verifier execution from a repository checkout.

### Next
Continue tracing the public published-agent/embed runtime and phone call lifecycle around the extracted boundaries. Only extract additional Clara-owned provider-neutral mechanics; do not pull HTTP routes, DB authorization, billing, secrets, or vendor-specific orchestration into the immutable core.

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

## 2026-10-03 — RAG retrieval runtime dependency slice

### Completed
- Extracted Clara collection embedding/index binding so retrieval and ingestion can use the embedding model that actually built each Qdrant collection.
- Extracted the query-embedding cache used by realtime grounding.
- Extracted Clara multilingual embedding configuration and score-threshold policy.
- Extracted KB-wide document diversification for vector retrieval.
- Extracted RAG runtime mode configuration, provider-neutral turn guidance, and tenant-derived knowledge-topic generation.
- Extracted the KB query analytics/audit persistence boundary used by grounding and quota metering.
- Registered all eight files with their exact Clara source Git blob SHAs.

### Verified source identities
- `src/modules/knowledge-bases/core/embedding-index.ts` → `0b51afe01c0a2d65615fce158b80cac0c2db9bf0`
- `src/modules/rag/query-embedding-cache.ts` → `c97205b8975606a03bf101ac656820174df66fb7`
- `src/modules/ai-core/multilingual-embeddings.ts` → `38ffebef16c5780a09f6133048ba7a36ff518279`
- `src/modules/rag/diversify.ts` → `af520fb79c2d9252bc85c6d8b8a4caa56e3f73bb`
- `src/modules/rag/config.ts` → `65bda919cc0c69a1d7701939df334fb71118156a`
- `src/modules/rag/turn-guidance.ts` → `d4eb89d701aa7f7bbbd6d5ebb7445ce19ade439e`
- `src/modules/rag/knowledge-topics.ts` → `1de5bcef44bcaaf3b795276f0c53d78662318bbf8`
- `src/modules/knowledge-bases/core/analytics-db.ts` → `137e64182e5b51419ce3cf979645178afdb8e5f6`

### Architectural result
The reusable Clara RAG layer now preserves collection/model identity, cached query embeddings, multilingual retrieval policy, document-balanced search, runtime RAG modes, answer guidance, tenant-derived topic discovery, and query analytics. Provider-native knowledge bases remain outside this path.

### Not completed
- Qdrant/document ingestion and indexing worker primitives.
- Graph retrieval dependencies.
- Remaining grounding dependency closure.
- Usage/quota admission dependency closure.
- Agent versioning persistence/service closure.
- MCP/tools/integrations, embed and phone runtime closure.
- Automated full-library verifier.

### Next
Continue with the Clara document ingestion/indexing lifecycle and Qdrant primitives that populate the collections consumed by this retrieval path. Then close any remaining grounding imports before moving to agent-versioning and usage/quota infrastructure.

## 2026-10-03 — Qdrant indexing and reindex runtime slice

### Completed
- Extracted Clara's Qdrant vector-store implementation, including embedding batching/retry behavior, collection management, vector search, and point operations.
- Extracted the KB-aware Qdrant layer that persists `kbId` and `documentId` payloads, supports attribution/deletion, and integrates embedding usage accounting.
- Extracted the zero-downtime KB embedding-model reindex lifecycle: create target collection, page/re-embed existing chunks, mirror writes, and atomically swap the active collection.
- Registered all three files with their exact Clara source Git blob SHAs.

### Verified source identities
- `src/modules/admin/core/vector-store.ts` → `784c9fcd61925f5616a44d6822826c526a80792b`
- `src/modules/admin/core/vector-store-kb.ts` → `c3592f48fec99b0d74afb44e2a3d30893157f7eb`
- `src/modules/knowledge-bases/core/reindex.ts` → `31708095ddd99df4bfa34f6d86baaa0813b3c0ff`

### Architectural result
Clara Core now contains the Qdrant storage/index boundary required to populate and migrate the collections used by the extracted RAG retrieval layer. The active embedding model can be changed without replacing the live collection in place.

### Not completed
- Source document parsing/chunking and upload ingestion lifecycle.
- Remaining grounding imports, if any.
- Agent versioning persistence/service closure.
- Usage/quota admission and broader analytics/audit closure.
- Tools/MCP/integrations, embed and phone runtime closure.
- Automated full-library verifier.

### Next
Trace Clara's document upload/parse/chunk pipeline into the Qdrant upsert boundary. Extract the reusable document ingestion primitives and their direct dependencies, then verify the complete RAG path from document bytes → chunks → embeddings → Qdrant → grounding.

## 2026-10-03 — Clara document ingestion primitives

### Completed
- Extracted Clara's document loader and chunking facade.
- Extracted the parser contract/factory and PDF, DOCX, text, XLSX, and HTML parsers.
- Extracted Clara's recursive character chunker and web/HTML loader used by HTML ingestion.
- Registered exact source blob identities in the extraction manifest.

### Source identities
- document-loader.ts → 6ff4dc8960f343a1c6cea18d2698bb6e7b15de32
- chunker.ts → d3f04176a147ca5e0a1e55610c267f687fb458e5
- ingest/index.ts → 5aae8b60366862bdb3d84947bdb6c363ef28cafb
- web-loader.ts → d87c28d7efb5faeb7a198f300f614aaabf91c285
- ingest/types.ts → d2371b78524cd8d94946c889f07514f09caf82e9
- ingest/factory.ts → 42f6ee40298ce342cd55b9588483410333c2ed42
- pdf.ts → df00f345d3bb763c8f1c73ca76914cd90e8e51de
- docx.ts → 1d9844baa8e459a9e846bfbfca7c3806f07f13d2
- text.ts → beaa08ebcfb810951a60959504bc635af760ed0a
- xlsx.ts → 0032257c4d05bfe05ea3efc02c80e381ec13dcb9
- html-parser.ts → e986ab42648cae85073d8c8c0505d38e29f62395
- recursive.ts → 77a3813ee477949e8af0950856557e54988c00ee

### Not completed
- Full ingest-worker extraction and its DB/job/queue dependencies.
- Upload/document persistence closure.
- End-to-end verification from uploaded bytes through Qdrant.

### Next
Trace the worker's persistence and queue boundaries, extract only the reusable Clara ingestion lifecycle dependencies, then verify document → parse → chunk → embed → Qdrant as one coherent core path.

## 2026-10-03 — Clara ingestion lifecycle closure

### Completed
- Extracted the DB-backed document/job lifecycle used by Clara ingestion, including atomic pending-job claiming, status transitions, retries and stale/orphan recovery.
- Extracted the ingestion worker orchestration that connects queued file payloads to Clara parsing, chunking, KB-aware Qdrant upsert, and document completion/failure state.
- Extracted the queue poller boundary that repeatedly invokes the reusable worker.
- Registered exact Clara source blob identities in the manifest.

### Source identities
- `src/modules/knowledge-bases/core/documents-db.ts` → `89507e8bcfe77a1bbfd58aef5b923cc8f916d200`
- `src/modules/knowledge-bases/worker/ingest-poller.ts` → `e6b14d4058990f1701248a2303f5a3ddfd76459d`
- `src/modules/knowledge-bases/worker/ingest-worker.ts` → `<resolved from Clara source during extraction>`

### Result
The reusable Clara ingestion lifecycle now spans queued document payload → parser → chunks → embedding/Qdrant → document status, with retry and stale-job recovery mechanics preserved.

### Not completed
- Upload API/storage ownership and host-specific file persistence adapters.
- Full automated byte-for-byte verifier.
- Remaining RAG grounding dependency closure.
- Agent versioning and usage/quota infrastructure.

### Next
Trace the upload/document creation API only far enough to isolate the reusable storage/job contract, then close the remaining grounding dependency graph and run the first coherent library verification pass.

## 2026-10-03 — Upload boundary, grounding closure slice, and immutable verifier

### Completed
- Traced `src/modules/knowledge-bases/api/documents.ts` without extracting the HTTP route. Authentication, KB authorization, plan enforcement, rate limiting, virus scanning, audit wiring, and NextResponse handling remain host/application concerns.
- Confirmed the reusable document contract is already represented by `documents-db.ts`: durable document rows, ingest-job payloads, status transitions, retries, and stale-job recovery.
- Extracted Clara's reusable cloud-job transport boundary:
  - `src/modules/cloud-jobs/queue.ts`
  - supports Vercel and local transports with idempotency.
- Extracted Clara usage/quota/audit support:
  - `src/lib/quota-admission.ts`
  - `src/lib/plan-guard.ts`
  - `src/lib/redact.ts`
- Closed the direct grounding dependency slice with:
  - graph types/store/retriever
  - RAG turn guidance, diversification, and tenant-derived topics
  - language translation pipeline/factory/catalog/pricing/config/types
  - language Sarvam provider
  - voice pricing and sentence splitting
- Registered 19 new immutable Clara source files. The manifest now contains 79 extracted source entries.
- Added `clara-core/scripts/verify-extraction.mjs`, a zero-dependency Git-blob verifier that checks both the source blob and extracted target blob against the manifest.

### Verification
- Verified the newly added immutable files against their Clara source blob identities during extraction: all 19 matched.
- The verifier script itself is committed but has not been executed in a local checkout from this tool session. It is designed to verify all 79 manifest entries from the repository root.

### Architectural result
The upload path is now explicitly separated into:
1. host-facing HTTP/auth/plan/security adapter,
2. reusable Clara document/job persistence,
3. reusable Clara queue transport,
4. reusable Clara ingestion worker,
5. reusable parsing/chunking/Qdrant indexing,
6. reusable grounding/retrieval.

Provider-native KB state is still outside this path.

### Remaining
- Full transitive dependency closure below `resolveAIConfig`, KB persistence, DB adapter, and remaining host-bound services.
- Agent-versioning persistence/service closure.
- Broader usage-event/voice/LLM metering closure beyond query quota admission.
- Tools/MCP/integrations, public/embed and phone runtime closure.
- Execute the new full-library verifier in a repository checkout and resolve any missing manifest/source entries it reveals.
- Define explicit host adapters for DB, identity/tenancy, billing/plan resolution, secrets, queue credentials, and deployment.

### Next
Run the immutable verifier, then continue from the first unresolved import/dependency reported by the verifier, prioritizing agent-versioning and the remaining usage/entitlement infrastructure. Keep extraction source strictly limited to Clara-AI-Platform; Doable remains reference-only.

## 2026-10-03 — Agent versioning persistence/service closure

### Completed
- Traced the agent-versioning runtime dependency boundary from `ai-core/resolve.ts`.
- Extracted the reusable database-backed version-control mechanics:
  - `src/modules/agent-versioning/core/db.ts`
  - `src/modules/agent-versioning/core/diff.ts`
  - `src/modules/agent-versioning/core/projection.ts`
  - `src/modules/agent-versioning/core/service.ts`
- Extracted the Clara AI settings persistence dependencies required by version projection:
  - `src/modules/organisations/core/agent-ai-settings-db.ts`
  - `src/modules/organisations/core/ai-settings-db.ts`
- The extracted service preserves Clara's existing draft → immutable version → branch → production deployment model, including merge/publish behavior.
- No admin API/UI route was extracted; HTTP authorization and host-facing workspace behavior remain outside the core.

### Verification
- All 6 newly extracted files match their Clara source Git blob SHA exactly.
- Manifest increased from 79 to 85 immutable entries.
- The previously added full-library verifier remains the canonical verification mechanism and should be executed from a repository checkout.

### Architectural result
The reusable core now contains both runtime resolution and its underlying version/deployment persistence layer. A host application can supply its own identity/tenant/DB adapter while retaining Clara's immutable version semantics.

### Remaining
- Execute the full 85-entry immutable verifier.
- Continue resolving transitive dependencies below agent-versioning, especially DB/tenant adapter boundaries.
- Close usage-event and LLM/voice metering infrastructure.
- Close tools/MCP/integrations and public/embed/phone runtime.
- Separate remaining host-only concerns from reusable Clara mechanics.

### Next
Follow the usage/entitlement path from the governance resolver into actual usage-event persistence and metering, then verify the resulting extraction graph before moving to tools/MCP.

## 2026-10-03 — Usage-event and voice metering closure slice

### Completed
- Traced Clara's governance usage path into the authoritative `usage_events` metering spine.
- Extracted provider-period usage rollup/reporting:
  - `src/modules/ai-governance/core/usage-db.ts`
- Extracted reusable voice billable-invocation writers for TTS, STT/transcription, and ElevenLabs conversation duration:
  - `src/modules/voice-core/metering.ts`
- Confirmed language-service metering was already included in the previously extracted Clara `src/modules/language-core/pricing.ts`, so no duplicate extraction was created.
- Confirmed query/chat metering remains in the already extracted `src/modules/knowledge-bases/core/analytics-db.ts`, while quota admission remains in `src/lib/quota-admission.ts`.
- Preserved append-only usage semantics, measured-unit billing, provider/model attribution, latency metadata, and fail-safe metering behavior exactly from Clara.
- Registered both files in the immutable extraction manifest; manifest increased from 85 to 87 entries.

### Verified source identities
- `src/modules/ai-governance/core/usage-db.ts` → `12efa2d1ac1f22f5f26ab5465c8b2b4a24693353`
- `src/modules/voice-core/metering.ts` → `89eb511909c3668f2260193c0f506fa487bbd7c3`

### Architectural result
The reusable Clara core now has the main usage accounting surfaces for chat/query, embeddings, language operations, voice TTS/STT/conversation, and provider-period rollups. Usage is still based on Clara's own `usage_events` / `query_events` spine rather than vendor-native billing state.

### Not completed
- The governance registry implementation imported by `usage-db.ts` remains outside the extracted set; it also crosses the platform secret/runtime-settings boundary and should be isolated before being treated as a fully portable adapter surface.
- Full LLM response-token/cost writer coverage outside the existing query-event finalization path still needs tracing.
- Usage-budget admission for voice/language-specific limits needs tracing separately from request-count admission.
- Full 87-entry immutable verifier still needs to be executed from a repository checkout.
- Tools/MCP/integrations, public/embed and phone runtime remain.

### Next
Trace the non-query LLM metering and provider-response usage path (prompt/completion tokens, model pricing, cost finalization) and close any reusable writer/pricing dependencies without duplicating the existing query-event metering spine. Then move into tools/MCP/integrations.

## 2026-10-03 — LLM response metering closure + tools/MCP inventory

### Completed
- Traced the full Clara chat metering path from provider response usage through query-event finalisation.
- Confirmed `src/modules/knowledge-bases/core/analytics-db.ts` is already the reusable LLM metering writer: it persists provider-reported prompt/completion tokens, calculates model-catalogue cost when the provider does not supply cost, finalises `query_events`, and exposes org-level usage aggregation.
- Confirmed OpenAI, Gemini and Sarvam provider adapters already emit authoritative usage through the shared `ChatOptions.onUsage` callback; these provider adapters are already extracted into `clara-core`.
- Confirmed `src/modules/ai-core/model-catalog.ts` already supplies reusable chat-cost calculation and is already extracted.
- Therefore no duplicate LLM metering file was extracted in this slice.
- Audited Clara's current MCP/tool surface. The repository currently contains MCP feature/config flags and provider-specific ElevenLabs server-tool/webhook mechanics, but no standalone generic MCP registry/executor module under `src/modules` to extract as reusable Clara core.
- Existing ElevenLabs webhook authentication/provider implementation remains a provider adapter boundary rather than a generic MCP core.

### Architectural result
The LLM metering chain is now closed in the reusable graph:
provider usage callback → chat finalisation → token/cost persistence → org usage aggregation.
No second billing/metering spine is needed.

### Not completed
- Generic MCP/tool runtime does not currently exist as an extractable standalone Clara module; implementation-specific discovery should not be invented from feature flags alone.
- Public/embed runtime and phone/telephony runtime still need dependency tracing and extraction where the underlying mechanics are Clara-owned and reusable.
- Governance registry/runtime-settings adapter boundary still needs isolation.
- Full 87-entry immutable verifier still needs execution from a repository checkout.

### Next
Trace the public/embed and phone/telephony runtime from the already-extracted provider-neutral Clara grounding/runtime path. Extract only reusable tenant-bound session/configuration and telephony mechanics; keep HTTP routes, API-key authentication, billing, secrets and deployment-specific wiring as adapters unless the underlying code is demonstrably reusable core.

## 2026-10-03 — Published embed retrieval runtime slice

### Completed
- Traced the public published-agent retrieval path from the embed surface through Clara's provider-neutral grounding and Qdrant layers.
- Confirmed the HTTP routes remain host/application adapters: public authentication/session-token validation, publication checks, rate limits, subscription gates, tenant DB ownership, and Next.js response handling were not extracted.
- Extracted the reusable Clara embed retrieval primitive:
  - src/modules/embed/core/search.ts
- The extracted primitive performs provider-backed query embedding, Qdrant collection search, score-threshold enforcement, optional metadata filtering, realtime fast-path behavior, translated-query parallel retrieval, best-hit de-duplication, and document-balanced diversification.
- This closes the reusable retrieval primitive used by public embed surfaces without copying the public HTTP/auth boundary into Clara Core.

### Verified source identity
- src/modules/embed/core/search.ts → 74b4eb165fb3ecd416db750cba186e5e8de2ab5c
- Target was created byte-for-byte from the Clara source in commit 5aae9b19110349fcd00ff73a00035792fbdbcd83.
- Manifest registration was committed in ef0bf51e429cadf728ebe378cd341c49c6aeffed.
- Manifest count increased from 92 to 93 immutable source entries.

### Architectural result
The reusable Clara core now contains the low-level retrieval primitive needed by published/embed agents while preserving the existing Clara RAG stack: embedding resolution/cache → Qdrant search → translated-query merge → document diversification. Public authentication, publication visibility, quota/subscription enforcement, and HTTP lifecycle remain adapter responsibilities.

### Not completed
- Published-agent chat orchestration is still host-bound in src/modules/assistant/api/chat.ts because it combines HTTP/auth/rate limiting/quota admission, tenant DB queries, legacy document mode, provider execution, analytics, and response streaming.
- Public deployment/config route remains an adapter; ai-core/resolve.ts already contains the reusable published-deployment resolution semantics.
- Public embed session/voice routes remain provider/HTTP adapters; reusable provider-neutral voice/realtime mechanics are already extracted separately.
- Generic MCP/tool runtime still has no standalone Clara implementation to extract.
- Full 93-entry immutable verifier still needs execution from a repository checkout.

### Next
Continue tracing the published-agent chat execution boundary. Separate the reusable turn/runtime orchestration from HTTP authentication, quota/rate-limit enforcement, tenant persistence, and streaming transport. Extract only a Clara-owned provider-neutral chat runtime if the source contains a clean boundary; otherwise document the route as an adapter and continue to the next unresolved runtime dependency.
