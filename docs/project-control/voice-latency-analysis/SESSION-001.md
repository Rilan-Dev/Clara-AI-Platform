# Voice Latency Analysis — Session 001

- **Date:** 2026-10-11
- **Repository:** `Rilan-Dev/Clara-AI-Platform`
- **Branch:** `feature/ai-core-from-doable-source`
- **Audited branch HEAD:** `b941538dede4d023b3f5381041d70feee7cf72a9`
- **Scope:** Source-level reconnaissance only for Clara's realtime voice-agent path and latency measurement. No application source changed in this session.
- **Status:** INITIAL AUDIT RECORDED; detailed provider-by-provider trace and runnable network/service benchmark remain pending.
- **Evidence boundary:** GitHub source files were inspected. No code was executed, no tests were run, no live voice call/provider probe was performed, and no production latency numbers are claimed.

## 1. Relevant source paths inspected

- `src/modules/assistant/core/hooks/useOpenAIRealtime.ts` — browser-side OpenAI Realtime/WebRTC hook; RAG debounce and query gates; turn orchestration; telemetry integration.
- `src/modules/voice-core/realtime/latency-tracker.ts` — turn stage marks and derived durations.
- `src/modules/voice-core/realtime/latency-log.ts` — human-readable per-turn console logging, including server `Server-Timing` stage values when supplied.
- `scripts/voice-benchmark/run.mjs` — Playwright/Chromium benchmark harness; captures `clara:voice:latency`, aggregates p50/p95, writes JSON.
- `scripts/voice-benchmark/README.md` — benchmark setup, test matrix, and output contract.
- `src/modules/assistant/api/realtime-tool.ts` — authenticated realtime integration/MCP tool dispatch through Clara's Unified Tool Runtime.
- `src/modules/assistant/api/realtime.ts` — realtime session route; relevant for provider setup/tool advertisement and session establishment (identified from the current session's source/control record; detailed line-by-line trace pending).
- `src/modules/voice-core/realtime/latency-tracker.test.ts`, `latency-log.test.ts` — focused latency unit tests exist.
- `src/modules/assistant/api/realtime.test.ts`, `realtime-tool.test.ts`, `src/modules/assistant/core/realtime-events.test.ts` — relevant route/event regression suites exist.
- `src/modules/voice-core/api/elevenlabs/elevenlabs-realtime-wire.test.ts`, `src/modules/voice-core/api/sarvam/realtime-wire.test.ts`, `src/modules/voice-core/api/sarvam/sarvam-realtime-generation.test.ts`, `src/modules/voice-core/realtime/gemini-telemetry.ts` — provider-specific realtime protocol and telemetry areas to trace next.
- `docs/superpowers/reports/2026-09-21-production-voice-latency.md`, `docs/superpowers/reports/2026-09-20-openai-realtime-ttfa-baseline.md`, `docs/superpowers/reports/2026-09-21-voice-gap-closure.md` — historical reports that should be reconciled with current code before trusting old findings.

## 2. What the current instrumentation measures

The tracker defines:
- **TTFA:** `browser.first_audio - stt.final` (transcript finalization to first browser audio; excludes the user's silence/thinking time before final transcript).
- **STT:** `stt.final - (stt.first_partial | turn.start)`.
- **RAG:** `rag.end - rag.start`.
- **LLM first-token delay:** `llm.first_token - llm.start`.
- **TTS first-audio delay:** `tts.first_audio - tts.start`.
- **Playback delivery:** `browser.first_audio - tts.first_audio`.
- p50/p95 aggregation is implemented in `summarizeLatency` and in the benchmark script.

The tracker documents a previous correctness issue where starting a committed turn replaced an interim STT record; `sttMarks()` / `carrySttMarks()` preserve the original STT marks. This is a critical regression area to retain in tests.

## 3. Initial critique / gaps to investigate

1. **Not yet a network-latency benchmark.** The current harness reports turn/stage durations but does not separately report DNS, TCP/TLS, WebRTC/ICE setup, provider session setup, request/response RTT, retry count, reconnect time, or per-dependency network timing. A slow stage cannot yet be reliably attributed to network vs provider compute vs Clara work.
2. **Only some pipeline stages are represented.** Stage marks cover STT, RAG, first LLM token, first TTS audio and browser playback. Queue/admission/config/auth, embedding, vector search, reranking, prompt construction, tool execution, provider first-byte, audio buffering and network transfer need explicit server/client spans where applicable.
3. **Zero-turn runs are informational, not a failing test.** The harness documents that fake-tone audio usually produces no speech turn; it logs a note but still writes output. Automation needs an explicit plumbing-only mode versus a real-audio mode, expected minimum turns, timeout/failure exit status and machine-readable validity metadata.
4. **Fixed-duration capture weakens reproducibility.** The default 60-second collection period can produce different sample counts and partial turns. Prefer per-question completion/timeout, warm-up exclusion, minimum valid samples, repeat counts and stable test identifiers.
5. **Percentiles need context.** Preserve raw samples and report p50/p90/p95/p99, sample count, missing-stage count, errors/timeouts, provider/model, region, network profile, browser/device, concurrency, timestamp, app commit and test corpus. Do not compare providers on different networks or question sets.
6. **Clock semantics must stay explicit.** Browser epoch marks can be subtracted from other browser marks. Server `Server-Timing` values should be durations, not timestamps; do not subtract client and server epoch timestamps unless clocks are synchronized. Correlate with trace/session/turn IDs.
7. **Provider comparisons are not yet proven equivalent.** Verify each provider's event boundaries mean the same thing and that the benchmark captures actual spoken audio—not merely text or a vendor event. The README's recorded-WAV path should be validated end to end for each provider.
8. **Realtime tool latency and reliability deserve separate spans.** `realtime-tool.ts` includes authorization, database grant lookup, MCP resolver/discovery and invocation. Measure these separately, including cache hit/miss, without logging secrets, prompts, transcripts or tool payloads.
9. **RAG remains authoritative.** Optimization must not bypass Clara tenant/KB authorization or Qdrant/RAG grounding. Keep provider-native knowledge bases out of the critical path unless explicitly designed and authorized.
10. **Duplicate output / cancellation / barge-in are latency correctness issues.** Preserve one-response-per-user-turn, generation identity, interrupt/cancel, stale-event suppression, reconnect and failure recovery while instrumenting. Faster metrics are not a win if they hide dropped or duplicated answers.

## 4. Proposed measurement model (plan, not implemented)

Instrument a traceable critical path with monotonic durations and a shared `sessionId`, `generationId`, `turnId`, `traceId`:
1. Browser: connect click → session ready; ICE/WebRTC state; speech start/end; first partial/final transcript; first audio packet/frame received; first audio rendered.
2. Clara API: request start, auth/tenant resolution, config resolution, admission/queue, RAG query embedding, vector retrieval, rerank, context assembly, model request start, first token, completion.
3. Provider: session/create or handshake latency, request/response/error events, reconnect/retry, provider-reported timings when available.
4. TTS/audio: TTS request start, first audio byte/chunk, chunk gaps, bytes/chunks, decode/buffer time, playback start.
5. Integrations/MCP: grant lookup, metadata cache result, upstream connect/handshake, tool call, response parse, cancellation.
6. Report per-stage p50/p90/p95/p99 and end-to-end TTFA, with errors, sample counts and missing-mark rates.

## 5. Next actions

1. Trace current event marking in OpenAI, ElevenLabs, Sarvam and Gemini hooks/routes and map every stage to its source location.
2. Inspect the current `Server-Timing` producer and confirm which RAG stages are actually emitted.
3. Read the historical baseline and gap-closure reports; reconcile claims with current branch HEAD.
4. Review the benchmark's testability, error handling, output schema and provider selection; then propose a non-invasive test plan.
5. Only after the code map and review are complete, implement a dedicated latency/network benchmark and regression tests in a separately authorized change.
6. Run focused tests and live provider probes later; clearly separate source findings, synthetic tests and real network measurements.

## 6. Decisions / guardrails

- Do not fabricate latency values or infer provider performance from source code.
- Do not wait for CI/Vercel as a prerequisite for continuing analysis.
- Do not change runtime behavior during this analysis-only session.
- Preserve tenant isolation, Clara-owned RAG, tool authorization, cancellation and privacy-safe telemetry.
- Treat this session as a starting audit, not a PASS or production-readiness sign-off.
