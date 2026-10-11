# Clara Realtime Voice — Initial Code Critique

**Branch:** `feature/ai-core-from-doable-source`  
**Audited commit:** `b941538dede4d023b3f5381041d70feee7cf72a9`  
**Status:** Initial source-based critique; not an executed test report.

## Strengths already present

- Shared typed stage vocabulary in `src/modules/voice-core/realtime/latency-tracker.ts`.
- First-mark-wins semantics reduce duplicate/late event corruption.
- Session/generation/turn identity and safe timing-only telemetry.
- p50/p95 aggregation and raw per-turn records.
- A Playwright harness that can drive a real browser session and accept recorded WAV input.
- Readable latency logs that can include server-side `Server-Timing` values.
- Focused unit tests exist for tracker/logging and several provider wire paths.

## Main weaknesses / unproven assumptions

### P0 — Benchmark validity
- The harness has a fixed-duration capture window and can complete with zero turns. That is useful for connection-plumbing checks but must not be accepted as a valid performance run.
- Add distinct modes: `plumbing` (zero turns may be valid) and `speech-benchmark` (requires N completed, valid turns or exits non-zero).
- Use explicit question IDs and per-turn completion deadlines; exclude warm-up samples; flag incomplete turns and missing stage marks.
- Confirm recorded WAV capture reliably triggers exactly the intended utterance for each provider.

### P0 — End-to-end attribution
- Existing TTFA begins at `stt.final`, not speech onset. Report both speech-start-to-first-audio and transcript-final-to-first-audio so VAD/end-of-utterance delay is visible separately.
- Stage durations alone cannot identify network delay. Add browser resource timings where available, WebRTC connection/ICE diagnostics, server spans, provider session setup, retries/reconnects and upstream timing.
- Keep client and server clocks separate; use durations and trace IDs for cross-tier correlation.

### P1 — RAG and model critical path
- Confirm which config/admission/translation/retrieval/graph timings are emitted by the current server and whether they cover the entire pre-LLM wait.
- Separate embedding, Qdrant retrieval, reranking, context assembly, provider queue/TTFT, token streaming and answer completion where the code path supports them.
- Track parallel vs serial spans; do not add overlapping spans together as if they were sequential.
- Compare cached and cold paths independently; avoid changing caching until correctness and tenant isolation are covered.

### P1 — Provider fairness and reliability
- Same device/network, KB, agent, language, question set, audio format, concurrency and warm-up protocol for every provider.
- Provider stage boundaries may not be semantically identical. Document which values are directly measured versus provider-reported/estimated.
- Include timeout/error/reconnect rates and missing telemetry alongside latency; report sample count and p50/p90/p95/p99.
- Ensure cancellation, barge-in, generation identity and duplicate-response suppression are regression-tested.

### P1 — Integration/MCP overhead
- In `src/modules/assistant/api/realtime-tool.ts`, measure tenant authorization, KB/agent resolution, grant query, MCP metadata resolution/cache, upstream tool call and response parsing independently.
- Tool calls are not ordinary model TTFA; report tool-enabled turns separately and capture both tool-call duration and total answer delay.
- Never log credentials, transcripts, prompts or raw tool arguments/results.

### P2 — Operational reproducibility
- Include branch commit, provider/model, environment/region, browser version, device/network profile, test corpus hash, timestamps, concurrency, sample count, errors and output schema version.
- Provide machine-readable per-question records and a concise aggregate report.
- Avoid relying on a single 60-second run or one question for provider comparisons.
- Keep live external provider probes opt-in, bounded and credential-safe.

## Acceptance criteria for a future benchmark (proposal)

1. Speech benchmark fails if fewer than the configured number of valid completed turns are recorded.
2. Every run records a commit SHA, provider/model, question ID, environment and capture mode.
3. Report p50/p90/p95/p99 and sample counts for TTFA and each stage; explicitly report null/missing marks.
4. Distinguish speech-onset-to-first-audio, transcript-final-to-first-audio, and audio-received-to-audio-rendered.
5. Correlate browser, server and provider spans by turn/trace identity without assuming synchronized clocks.
6. Record errors, timeouts, reconnects, cancellation and dropped/duplicate turns.
7. Same corpus/network/device protocol is used for provider comparisons.
8. Unit tests cover empty runs, incomplete turns, percentile calculations, invalid timestamps, duplicate marks, and multi-turn isolation.
9. No transcript/secret/prompt/tool payload enters timing telemetry.
10. Reported numbers are from actual runs and label synthetic/plumbing tests separately.

## Important limitation

This critique is derived from source and existing documentation. It does **not** establish how many milliseconds any provider or network service consumes. That requires controlled test execution and real measurements.
