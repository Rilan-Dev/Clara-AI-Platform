# OpenAI Realtime — TTFA Performance Baseline (Task 4.2)

**Status:** instrumentation shipped; device measurements to be recorded on the first
real-device run (plan Phase 11 mandates the same device/network conditions for
cross-provider comparison, so numbers are only valid from that harness).

## Instrumentation

`src/modules/voice-core/realtime/latency-tracker.ts` captures the exact stage
chain the plan requires, per turn, with the plan §11 stage names:

```text
user speech end → stt.final
                 → rag.start → rag.end
                 → llm.start → llm.first_token
                 → tts.start → tts.first_audio
                 → browser.first_audio   (browser playback)
```

- `TTFA = browser.first_audio - stt.final`
- Stage latencies: `STT`, `RAG`, `LLM`, `TTS`, `playback`
- Every record carries `sessionId`, `generationId`, `turnId`, `provider`, `model`.
- Marks are idempotent (first wins) — duplicate/late vendor events cannot skew
  measurements. No transcripts, no secrets — timings only.
- `summarizeLatency()` aggregates runs into nearest-rank p50/p95.

Unit-locked in `latency-tracker.test.ts` (11 tests, including the exact
TTFA/stage arithmetic and the p50/p95 aggregation).

## Measurement protocol (Phase 11 device harness)

1. Same device, same network, same KB, same agent for every provider compared.
2. 10 short questions, 10 KB questions, 10 longer answers (plan Test A).
3. Record `p50/p95` TTFA per question class; never compare providers on a
   single request (plan §12 discipline).
4. Test matrix: OpenAI baseline (Test A) vs Sarvam (Test B) vs ElevenLabs
   Clara Realtime (Test C), plus interruption at STT/RAG/LLM/TTS (Test D)
   and code switching EN/Tamil/mixed (Test E).

## Baseline record (fill from the device run)

| Metric | p50 | p95 | Notes |
|---|---|---|---|
| TTFA (short questions) | _to record_ | _to record_ | OpenAI Realtime baseline |
| TTFA (KB questions) | _to record_ | _to record_ | includes RAG tool round-trip |
| TTFA (long answers) | _to record_ | _to record_ | first-audio only, not total |
| STT stage | _to record_ | _to record_ | |
| RAG stage | _to record_ | _to record_ | `/api/rag/search` round-trip |
| LLM first token | _to record_ | _to record_ | realtime model |
| TTS first audio | _to record_ | _to record_ | native realtime audio |
| Playback jitter | _to record_ | _to record_ | browser.first_audio - tts.first_audio |

Reference geometry (from the regression-locked session contract,
`realtime.test.ts`): VAD 0.5/300/700 ms, transcription `gpt-4o-mini-transcribe`,
model `gpt-realtime-2.1-mini`, single `response.create` after RAG ("FIX V3").
