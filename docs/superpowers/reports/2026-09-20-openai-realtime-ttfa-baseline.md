# OpenAI Realtime — TTFA Performance Baseline (Task 4.2)

**Status:** instrumentation shipped on ALL FOUR realtime providers (2026-09-21
gap-closure: OpenAI `71af6c4`, Gemini `033cd80`) and **exercised end-to-end
live** by the 2026-09-21 in-container benchmark (Sarvam provider — see the
measured section). OpenAI/Gemini live numbers remain **blocked by vendor
region restrictions from this environment** and must be recorded on the first
device/deployment run in a supported region.

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

Unit-locked in `latency-tracker.test.ts` (19 tests, including the exact
TTFA/stage arithmetic, the p50/p95 aggregation, and the 2026-09-21 live-run
bug regressions: STT carry across turn commits, multi-turn utterance
boundaries, turn-handle mark binding).

### Provider wiring status (2026-09-21 gap-closure)

| Provider | Emits `clara:voice:latency` | Commit |
|---|---|---|
| OpenAI Realtime (baseline) | ✅ `useOpenAIRealtime.ts` (commit `71af6c4`) — `browser.first_audio` anchored on the first `response.audio.delta`; greeting tracked as a system generation | previously missing — this was the gap |
| Sarvam realtime | ✅ `useSarvamVoice.ts` — **live-verified 2026-09-21: 33 measured turns** (below) | earlier voice-plan commits + `c9f178a`/`d301dc4`/`21cfcdc`/`fb48470` (telemetry correctness fixes found by the live run) |
| ElevenLabs Clara Realtime | ✅ `useElevenLabsClaraStream.ts` | earlier voice-plan commits + same telemetry correctness fixes |
| Gemini Live | ✅ `useGeminiLive.ts` via the pure `GeminiTurnTelemetry` module (commit `033cd80`) — utterance-boundary + retroactive `stt.final` semantics for the vendor-native VAD lifecycle | wired this session |

### Telemetry correctness fixes found by the FIRST live run (2026-09-21)

The harness had never actually run against a live session before — the first
run exposed five measurement-destroying defects, all fixed and regression-
locked:

1. **Committed-turn carry** (`c9f178a`): `stt.final` was marked on the interim
   record, then the turn-commit `beginTurn` replaced the record — TTFA was
   structurally null on every real session for all three Clara-owned hooks.
2. **Multi-turn boundary** (`c9f178a`): turn N+1's partials collided with turn
   N's first-wins marks after completion.
3. **Turn-handle binding** (`d301dc4`): an in-flight chat's marks bled onto a
   barge-in's fresh interim record (observed live: emitted record had
   `generationId=null`, no `stt.final`, all latencies null).
4. **Boot record** (`21cfcdc`): Sarvam/ElevenLabs never began a record — every
   pre-turn mark (including `session.start`) was a silent no-op.
5. **Emit timing** (`21cfcdc`/`fb48470`): short answers finish the chat before
   the first audio chunk arrives — the emit now defers while synthesis audio
   is in flight; `rag.start` anchors at the chat call.

Plus one **deployment bug**: standalone builds served a partial `public/` dir,
so `/worklets/audio-recorder-worklet.js` 404'd and the AudioWorklet primary
capture silently fell back to ScriptProcessorNode (`c9f178a` — `start.mjs`
now always syncs assets).

## Measurement protocol (Phase 11 device harness)

1. Same device, same network, same KB, same agent for every provider compared.
2. 10 short questions, 10 KB questions, 10 longer answers (plan Test A).
3. Record `p50/p95` TTFA per question class; never compare providers on a
   single request (plan §12 discipline).
4. Test matrix: OpenAI baseline (Test A) vs Sarvam (Test B) vs ElevenLabs
   Clara Realtime (Test C), plus interruption at STT/RAG/LLM/TTS (Test D)
   and code switching EN/Tamil/mixed (Test E).

### Exact commands for the real-device run (§21 disclosure)

```bash
# Plumbing check first (fake tone mic — validates the pipeline end-to-end):
node scripts/voice-benchmark/run.mjs \
  --url="https://clara.ai.amazetechclans.com/embed/voice?key=clr_..." \
  --provider=openai

# Real numbers (recorded question WAVs played into the fake capture device):
node scripts/voice-benchmark/run.mjs \
  --url="https://clara.ai.amazetechclans.com/embed/voice?key=clr_..." \
  --input=wav:questions/en/short-01.wav \
  --provider=openai \
  --out=tool-results/voice-bench-openai.json

# Full class matrices (question set + aggregation, 2026-09-21 tooling):
node scripts/bench-run-matrix.mjs --provider=openai --class=short
node scripts/bench-run-matrix.mjs --provider=openai --class=kb
node scripts/bench-run-matrix.mjs --provider=openai --class=long
```

The harness listens for the `clara:voice:latency` window events; with the
OpenAI wiring above, Test A now produces records with
`sessionId/generationId/turnId/provider/model` + stage marks. Record the
JSON aggregates into the table below on the first real-device run.

## Measured record — Sarvam realtime, in-container live run (2026-09-21)

**Method (all real, no fabricated numbers):** headless Chromium 141 (container)
+ `--use-file-for-fake-audio-capture` question WAVs (genuine Bulbul-synthesised
speech), live Saaras `saaras:v3-realtime` STT relay, live
`sarvam-105b-conversations` LLM, live Bulbul `bulbul:v3` streaming TTS, real
WebAudio generation-aware playback, real local Postgres+Qdrant RAG. One turn
per run (WAVs carry 30 s trailing silence). Aggregates from
`tool-results/voice-bench/sarvam-*-matrix.json` (nearest-rank p50/p95).

**Environment disclosure:** OpenAI AND Google REST/Live APIs are region-blocked
from this container's egress IP (403 `unsupported_country_region_territory` /
WS close 1007 `User location is not supported`) — the OpenAI baseline could not
be measured here. The RAG retrieval embedding runs on a LOCAL MiniLM stand-in
(`/home/z/embedsrv/server.mjs`, OpenAI-compatible) because both embedding
backbones are region-blocked: **RAG stage numbers are local-only and NOT
representative of production; STT/LLM/TTS/playback/TTFA are genuine live-vendor
measurements through the full real pipeline.**

| Metric (Sarvam realtime) | short (9 turns) | KB (10 turns) | long (10 turns) |
|---|---|---|---|
| TTFA p50 / p95 | **845 / 1186 ms** | **877 / 1244 ms** | **842 / 1203 ms** |
| STT p50 / p95 (speech→final) | 2052 / 2872 ms | 2603 / 3906 ms | 7450 / 8565 ms |
| RAG p50 / p95 (local stand-in) | 50 / 131 ms | 57 / 146 ms | 51 / 174 ms |
| LLM first-token p50 / p95 | 486 / 568 ms | 505 / 662 ms | 476 / 590 ms |
| TTS first-audio p50 / p95 | 343 / 695 ms | 353 / 773 ms | 347 / 719 ms |
| Playback p50 / p95 | 0 / 0 ms | 0 / 0 ms | 0 / 0 ms |

Language matrix (Sarvam): Tamil 3/3 turns (TTFA p50 906 ms; one LLM outlier
6157 ms first-token), EN/Tamil mixed 1/1 (TTFA 908 ms).

Live behaviour spot-checks (same session tooling): sequential two-question
barge-in WAV → two cleanly separated generations (fresh per-turn STT marks, no
mark bleed, both answers spoke, TTFA 938 ms / 1221 ms); 33 successful session
boots across 4 server restarts (bounded reconnect by construction — the
in-memory rate limiter was cleared per batch, `REALTIME_SESSION_RATE` 10/h/org).

## OpenAI baseline record (blocked in this environment — fill on first supported-region run)

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
