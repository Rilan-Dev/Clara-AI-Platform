# Realtime Voice Latency Benchmark — Implementation Plan

## Goal

Measure the actual running Clara realtime voice workflow, not mocked route functions alone. Produce correlated client/server timings for session startup, first welcome audio, five sequential user turns, RAG, model generation, audio playback, network requests, usage/termination state, and session shutdown. Run the same scenario for OpenAI, ElevenLabs, Gemini, and Sarvam without weakening tenant auth, Clara-owned RAG, or provider policy.

## Current source-level findings (branch snapshot: feature/ai-core-from-doable-source)

- OpenAI bootstrap: `src/modules/assistant/core/hooks/useOpenAIRealtime.ts` calls `/api/realtime/session` (or `/api/embed/session`), then establishes RTCPeerConnection/data channel and waits for events.
- OpenAI session route: `src/modules/assistant/api/realtime.ts` does DB migration/KB lookup, organisation/plan/rate checks, assistant config + document titles, AI/voice config resolution, optional integration/MCP discovery, then an upstream ephemeral-session request. These stages can create multiple DB/provider calls before the browser connects.
- Per-turn OpenAI RAG: `useOpenAIRealtime.ts` posts to `/api/rag/search` (or `/api/embed/rag`), waits for evidence, injects context, then sends one `response.create`. The 100 ms debounce is client-side; it is part of user-visible latency.
- Tool path: `src/modules/assistant/api/realtime-tool.ts` re-authenticates and re-checks KB membership/grants before integration/MCP execution. Count this as a separate request/span; do not remove security checks to reduce latency.
- Existing timing primitives: `src/modules/voice-core/realtime/latency-tracker.ts`, `src/modules/voice-core/realtime/latency-log.ts`, and `window` event `clara:voice:latency`. Current stages are primarily turn-level; welcome/session bootstrap and per-HTTP-request timings are not complete.
- Existing harness: `scripts/voice-benchmark/run.mjs` uses a fake audio device or one looping WAV, collects telemetry for a fixed duration, and reports p50/p95. It does not perform an adaptive five-question conversation; zero turns is a note rather than a speech-test failure.
- Existing API test: `src/modules/assistant/api/realtime.test.ts` mocks dependencies. Useful for contract/regression tests, but cannot provide real network/provider latency.

## Phase 0 — baseline and test safety

1. Capture branch SHA, app URL/build, provider/model/voice/STT/TTS config, KB fixture ID (non-secret), region, browser/device, network type, run timestamp and concurrency.
2. Use a dedicated test organisation/KB populated with deterministic, non-sensitive synthetic documents. Do not use production customer data.
3. Generate five actual speech WAV files from the scenario list in `scenarios/five-turns.json`; store them locally, not in Git if they contain private content. Verify WAV codec/sample rate/duration and listen to each file before benchmarking.
4. Run one provider/session at a time at concurrency 1; perform one warm-up run, then at least 10 measured sessions per provider. Repeat on the same machine/network with identical WAVs and KB.
5. Separate `plumbing` tests from `speech` tests. Plumbing can pass without a transcript; speech mode must fail if fewer than five complete, non-empty turns are recorded.

## Phase 1 — instrument the full session lifecycle

Add correlation IDs and monotonic-duration spans at:
- browser connect click → session request start/headers/body complete;
- server route total and individual steps: auth/KB, DB calls, plan/rate checks, config resolution, MCP discovery (only when enabled), provider session create;
- session response received → peer connection created → ICE gathering/connection → data channel open/provider setup complete;
- first welcome response event → first audio chunk → first audible playback;
- user speech onset → first transcript partial → final transcript → RAG request start/end;
- RAG sub-stages: admission/auth, query normalization/translation, embedding, Qdrant search, rerank, context build;
- model request/first output token/last token or response completion;
- TTS request/first audio chunk/last audio chunk and browser audio playback;
- retries, reconnects, cancellation, timeout, tool/MCP round-trips and session close.

Use `performance.now()` / `performance.timeOrigin` for client-local measurements and `process.hrtime.bigint()` on the server for durations. Do not subtract browser and server wall-clock timestamps unless clock synchronization is verified. Propagate `traceId`, `sessionId`, `turnId`, `generationId` through logs/headers where supported. Never log API keys, auth headers, transcripts, prompts, embeddings or raw tool payloads.

## Phase 2 — network/API request census

In Playwright, record each request's method, URL path (query values stripped), resource type, start, response headers/body completion, status, transfer sizes where available, failure/timeout and count. In server routes, emit structured request-span logs for calls invisible to the browser (provider APIs, DB, Qdrant, embeddings, MCP). Summarize request count by method + path and by service, plus count of retries/errors. Do not infer server-side call counts from browser Network alone.

The census must answer:
- How many browser API requests occur before a session is ready?
- How many server DB/provider/MCP requests happen during bootstrap?
- How many RAG calls per user turn?
- How many model/audio generations per turn? Flag duplicate generations.
- Which requests dominate p50/p95 and which are serialized unnecessarily?

## Phase 3 — sequential five-turn conversation test

1. Start the UI session and time connect click → first audible welcome audio.
2. Wait for welcome playback/response completion before playing question 1.
3. Play each WAV through a browser audio track (not a text-only API shortcut). Wait until the current assistant response is complete and the audio has drained before playing the next WAV.
4. For each turn record transcript-final timing, RAG total/sub-stages, first token, final token/response completion, first and last audio, playback end, usage tokens when provider reports them, response status/reason, configured token cap, and whether output was cut off.
5. Verify one user turn maps to exactly one completed answer unless an explicit tool cycle is recorded. Compare expected answer facts against the synthetic KB, and reject empty/truncated/incomplete responses.
6. End session cleanly and record close/disconnect latency and any outstanding requests.

Scenario questions are in `scripts/voice-benchmark/scenarios/five-turns.json`. Use matching WAV files `--input-1` through `--input-5`; do not substitute generated text into the RAG endpoint because that bypasses the actual speech/STT workflow.

## Phase 4 — provider matrix

Run identical measured scenario for:
- OpenAI realtime voice;
- ElevenLabs realtime voice;
- Gemini Live;
- Sarvam realtime voice.

Provider configuration must be selected in Clara settings before each run; the harness `--provider` flag labels a run and must not be treated as proof of which backend was used. Assert observed provider/model telemetry equals the expected provider, otherwise mark the run invalid. Preserve Clara's own RAG/Qdrant retrieval for every provider. Record unsupported/missing stages as `null`, never as zero.

## Phase 5 — analysis and optimisation

Report raw samples plus p50/p90/p95/p99, min/max, sample count, missing-stage count, failures and warm-up separately. Decompose:
- connect and first-welcome latency;
- speech onset → final transcript;
- final transcript → RAG completion;
- RAG completion → first model token;
- first token → final response;
- first audio → audible playback and playback drain;
- per-service HTTP/network and server spans.

Optimise only after the measurements identify the bottleneck. Candidates include parallelizing independent config reads, bounded/correct caches, reusing connections, reducing avoidable serial round-trips, embedding/Qdrant index tuning, first-audio streaming, and reducing redundant context. Never bypass auth, tenant scoping, plan limits, provider governance, or Clara RAG to improve a benchmark.

## Acceptance criteria

- One run has complete bootstrap/request logs and explicit provider/model identity.
- Welcome latency is measured from the actual connect click to first audio/playback.
- Five real audio inputs are delivered sequentially in the same session.
- All five turns have non-empty completed assistant answers, valid completion signals, and no unexplained truncation/duplicate generation.
- Request counts and timings are available for browser-visible requests and server-only dependencies.
- Token usage is captured when available; unavailable provider usage is clearly labelled, not guessed.
- Results include p50/p95 (and p90/p99 where sample size supports them), raw records, errors and missing telemetry.
- No secrets or user transcript/prompt content appear in diagnostic logs.

## Implementation status — 2026-10-11

### Implemented in repository (not yet runtime-verified)

- `scripts/voice-benchmark/conversation.mjs`: five sequential WAV inputs in one browser session, waits for a shared telemetry completion barrier between inputs, records browser-visible request counts/status/header/body-completion durations, resource timings, failures and console errors.
- Failure paths now persist a schema-v2 partial report when welcome/turn telemetry times out or observed provider differs from the expected provider.
- The report explicitly distinguishes a telemetry barrier from answer-integrity verification. Welcome timing is labelled as a `browser.first_audio` telemetry mark, not independently verified audible playback.
- `scripts/voice-benchmark/validate-report.mjs`: checks schema, provider identity, five turn records, welcome telemetry and per-turn correlation IDs; warns when TTFA, answer integrity, token usage or request health is incomplete.
- Scenario fixtures and operator instructions are in `scripts/voice-benchmark/scenarios/five-turns.json` and `scripts/voice-benchmark/README.md`.

### Not yet complete / verified

- Node syntax/runtime, Playwright install/runtime, and actual WAV-to-microphone injection have not been executed in this work session.
- No live session has confirmed that greeting and turn-completion events fire consistently for OpenAI, ElevenLabs, Gemini and Sarvam.
- The common event does not currently prove a non-empty final answer, non-truncation, final audio drain, provider token usage, or actual audible playback.
- Browser-visible request census exists; server-only request counts and durations for DB, provider API, embeddings, Qdrant, reranking, integration/MCP and retries still need structured spans.
- Five-turn timing reports, repeated runs, provider matrix comparison and performance conclusions have not been produced.

### Next implementation steps

1. Execute `node --check` on both scripts and run the report validator against a synthetic fixture.
2. Test microphone injection against a non-production Clara deployment; capture the first partial report even if the welcome gate fails.
3. Run one OpenAI session, repair any lifecycle mismatch, and then use the same WAVs/test KB/browser/network for the other providers.
4. Add privacy-safe provider-specific completion/usage metadata (text length or hash only, finish reason, output token usage, audio completion/drain) without logging transcripts.
5. Add server timing/call-count spans for the real bootstrap, RAG, provider, embedding/Qdrant and tool/MCP paths.
6. After these are measured, repeat at least one warm-up plus 10 measured sessions per provider and publish p50/p90/p95/p99 with missing-stage counts.

Until runtime tests and live provider reports exist, the benchmark is **implementation-in-progress**, not a fully verified milestone. No latency numbers or four-provider pass are claimed.
