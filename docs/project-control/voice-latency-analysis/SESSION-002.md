# Session 002 — End-to-end voice workflow trace

- Repository: `Rilan-Dev/Clara-AI-Platform`
- Branch: `feature/ai-core-from-doable-source`
- Source snapshot reviewed: branch tip after Session 001 notes; re-check current HEAD before implementation.
- Scope: actual session and turn paths, existing measurement coverage, implementation plan.
- No live provider conversation was run in this analysis session. No timings below are measured results.

## Workflow traced

### Session bootstrap (OpenAI path)

1. User clicks connect in `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`.
2. Browser POSTs `/api/realtime/session` (authenticated) or `/api/embed/session` (public embed).
3. `src/modules/assistant/api/realtime.ts` parses KB ID, migrates/loads KB, queries agent/org, rate limits, checks voice plan, fetches assistant config + document titles in parallel, resolves AI and voice config, optionally checks auth/membership and queries/resolves MCP tools, builds the provider session, then calls OpenAI to mint an ephemeral secret.
4. Browser creates `RTCPeerConnection`, data channel and microphone stream, negotiates WebRTC/SDP, and marks connected when data channel opens.
5. Provider may speak a welcome/greeting. Current general tracker is initialized after the session endpoint response; welcome-specific connect-click-to-first-audio measurement is not a stable explicit metric in the existing contract.

Potential API/request count: at least one browser session-bootstrap request; on server, multiple database and config/provider operations may run, and the exact count depends on KB/auth/feature flags/MCP configuration. Exact runtime counts require tracing the live request and server spans; source inspection alone cannot establish a single number.

### User turn (OpenAI path)

1. Provider sends speech/VAD and transcript delta/completed events on the WebRTC data channel.
2. `useOpenAIRealtime.ts` marks STT, schedules the client debounce (currently 100 ms), starts a turn and POSTs `/api/rag/search` or `/api/embed/rag`.
3. RAG endpoint does tenant/config/admission/retrieval work (embedding/Qdrant and any enabled rerank/translation path must be traced at the route implementation).
4. Client injects guidance/context and sends one `response.create`; native realtime model emits transcript/audio deltas.
5. On `response.done`, the hook marks complete and emits `clara:voice:latency`; the benchmark collects the event.

If the model invokes an integration tool, the client POSTs `/api/realtime/tool`; server re-authenticates and re-checks KB membership and grants before dispatch. This extra round-trip should be measured separately and is conditional.

## Instrumentation audit

- `src/modules/voice-core/realtime/latency-tracker.ts`: currently uses `Date.now()`, first-wins stage marks, derives STT/RAG/LLM/TTS/playback/TTFA and aggregates p50/p95. Client durations should migrate to monotonic time or carry an explicit monotonic clock field to avoid wall-clock adjustments.
- `src/modules/voice-core/realtime/latency-log.ts`: readable console line; consumes server `Server-Timing` if caller has it. Not a request census.
- `scripts/voice-benchmark/run.mjs`: Playwright; fixed 60-second collection by default; optional one WAV loops through fake capture; request/response counts, per-request timings, welcome latency, sequential five-turn adaptive orchestration, token usage, and strict turn completion are not implemented.
- `src/modules/assistant/api/realtime.test.ts`: mocks database/config/provider secret creation. Good route contract coverage; cannot be used as live latency evidence.
- `useOpenAIRealtime.ts` includes the RAG fetch and data-channel event processing; debug raw event logging is currently disabled behind `DEBUG_EVENTS`. Do not enable raw payload logging in production because it can include transcripts/tool arguments.
- `src/modules/voice-core/resolve.ts` has a short TTL cache for voice configuration, which may affect warm-vs-cold session bootstrap; benchmark both separately and report cache state where observable.
- Provider-specific Gemini telemetry maps provider events to the common stages; confirm equivalent session/welcome/turn-complete instrumentation in OpenAI, ElevenLabs and Sarvam hooks before cross-provider comparisons.

## Main gaps / risks

1. Current harness cannot perform the requested five sequential speech turns with a wait-for-completion barrier.
2. The current benchmark event fires at response completion; if a greeting has a different lifecycle or telemetry record, its first-audio timing can be missing. Measure click-to-first-audio independently in the harness and add a common session-ready/greeting event.
3. Existing `TTFA = browser.first_audio - stt.final` intentionally excludes speech onset-to-final transcript. Report both speech-onset-to-first-audio and transcript-final-to-first-audio.
4. Existing browser telemetry cannot reveal server-internal provider, DB, embedding, Qdrant, reranker or MCP call counts. Add structured server spans and propagate correlation IDs.
5. Current event schema does not guarantee token usage, finish reason, output truncation, or last-audio/playback-drained timing across providers. Add provider adapters that expose these fields where available; otherwise record `unavailable`.
6. Fixed-window completion can finish while an answer is still streaming. Use per-turn completion barriers and fail incomplete runs.
7. A single looping WAV is not an adaptive multi-turn input; it may replay while the assistant is still speaking. Replace with a browser-injected audio track driven by the test runner, playing each WAV only after the previous turn is complete and playback drains.
8. Do not use fixed zero latency for unobserved stages. Missing stages must remain null and count as missing instrumentation.

## Required implementation sequence

1. Add an opt-in debug trace schema and request instrumentation to the benchmark (method/path, start, response finish, status, failures, resource timing, counts; strip query parameters and headers/secrets).
2. Add provider-neutral lifecycle telemetry: connect-click, session-request, session-response, provider-ready/data-channel-open, greeting-first-audio, turn-start, RAG request, first output, response complete, last audio/playback drain, turn error/interruption, session end.
3. Add server timing spans for `/api/realtime/session`, `/api/embed/session`, `/api/rag/search`, `/api/embed/rag`, `/api/realtime/tool`, DB/embedding/Qdrant/provider calls. Emit duration and safe service labels only.
4. Implement a Playwright audio-track driver for five WAVs with a strict sequential barrier, a configurable timeout per turn, and a strict speech-mode failure if any expected turn is missing, empty, duplicated or incomplete.
5. Capture provider token usage and finish/truncation reasons from provider completion events where supported. Never assume token cap means truncation; inspect completion reason/usage and compare final response against scenario evaluator.
6. Add tests for tracker math/clock behavior, session/greeting timestamps, request-count redaction, turn barrier/timeout, duplicate response detection, token usage unavailable handling, and incomplete run failure.
7. Run one live baseline per provider, then 10+ measured sessions each under same device/network/KB conditions. Keep warm-up separate and report p50/p90/p95/p99 and failures.
8. Only after baseline, choose optimizations and re-run identical scenarios.

## Durable outputs

- Implementation plan: `docs/project-control/voice-latency-analysis/IMPLEMENTATION-PLAN.md`
- Five-turn scenario: `scripts/voice-benchmark/scenarios/five-turns.json`
- Prior session, critique, memory and worklog remain in this directory.
- Worklog entry for this session: `docs/project-control/voice-latency-analysis/worklog.md`


## Additional route-level trace

- `src/app/api/rag/search/route.ts` is a thin route wrapper over `postRagSearch` in `src/modules/assistant/api/rag.ts`; the detailed RAG timing boundary therefore belongs in that shared implementation and its retrieval dependencies, not only in the route wrapper.
- `src/app/api/embed/rag/route.ts` validates the embed credential/origin, derives the KB from validated embed context, then calls the same `postRagSearch` implementation. Count the outer HTTP request separately from internal provider/embedding/Qdrant calls.
- `src/app/api/embed/session/route.ts` is a multi-provider router. It migrates, validates the embed credential and voice entitlement, loads KB/config/document titles in parallel, resolves AI + voice config, localizes greeting text when needed, and routes ElevenLabs to Clara-stream or Speech Engine depending on configuration; Sarvam has its own branch. Therefore session startup request count and welcome latency differ by selected provider path.
- `src/app/api/realtime/gemini-session/route.ts` delegates to `postGeminiSession` in `src/modules/assistant/api/geminiSession.ts`.
- `src/app/api/voice/elevenlabs/realtime-init/route.ts` delegates to `postElevenLabsRealtimeInit`; `src/app/api/voice/sarvam/realtime-init/route.ts` delegates to `postSarvamRealtimeInit`. The trace harness must preserve and measure these provider-specific bootstrap/relay paths instead of assuming every provider uses `/api/realtime/session`.
- RAG internals, provider-specific greeting emission, and exact server-side request counts still need line-by-line span instrumentation and live capture. The script currently captures browser-visible request timing and common latency events only.
