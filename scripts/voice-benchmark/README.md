# Voice Realtime Benchmark Harness (Plan Phase 11)

`run.mjs` drives a real Chromium session against a running Clara instance and
captures the per-turn telemetry emitted by the voice hooks
(`clara:voice:latency` window events — plan Phase 10) to compute p50/p95 TTFA.

## Test matrix (plan §12)

| Test | What | How |
|---|---|---|
| A — OpenAI baseline | 10 short + 10 KB + 10 long-answer questions | recorded WAVs per class |
| B — Sarvam | same questions, same KB, same agent | same device, same network |
| C — ElevenLabs Clara Realtime | same | same |
| D — interruption | interrupt at STT / RAG / LLM / TTS | click interrupt at stage boundaries (telemetry marks show the stage) |
| E — code switching | EN / Tamil / Tamil+EN / EN-technical | recorded code-switched WAVs |

**Discipline:** same device + same network for every provider compared; never
claim a provider is faster/slower based on one request.

## Running

```bash
# Plumbing check (fake tone mic — no speech commits, validates the pipeline):
node scripts/voice-benchmark/run.mjs \
  --url="https://clara.example.com/embed/voice?key=clr_..." \
  --provider=openai

# Real numbers (recorded question played into the fake capture device):
node scripts/voice-benchmark/run.mjs \
  --url="https://clara.example.com/embed/voice?key=clr_..." \
  --input=wav:questions/en/short-01.wav \
  --provider=sarvam \
  --out=tool-results/voice-bench-sarvam.json
```

Chromium flags used: `--use-fake-device-for-media-stream`,
`--use-fake-ui-for-media-stream`, `--autoplay-policy=no-user-gesture-required`,
plus `--use-file-for-fake-audio-capture=<wav>` when `--input=wav:` is given.

## Output

JSON with per-turn raw records (sessionId/generationId/turnId/provider/model,
stage marks, derived latencies) plus p50/p95 aggregates for TTFA and each
stage (STT / RAG / LLM / TTS / playback). Record the aggregates into
`docs/superpowers/reports/2026-09-20-openai-realtime-ttfa-baseline.md` after
each real-device run.


## Adaptive five-turn conversation + browser request census

The new `conversation.mjs` harness is designed for the requested sequential, same-session speech test. It injects five real WAV files into a controllable browser microphone track, waits for the app's completed-turn telemetry after each input, then sends the next input. It records browser-visible request counts, HTTP status, request-to-response-header and response-completion duration, resource timing, failed requests, session-click-to-first-audio (when the greeting emits common telemetry), and per-turn latency marks.

Prepare five WAVs from the exact prompts in `scenarios/five-turns.json` and populate a dedicated synthetic test KB with the listed facts. Do not commit private audio or production transcripts.

```bash
node scripts/voice-benchmark/conversation.mjs \
  --url="https://clara.example.com/embed/voice?key=clr_..." \
  --provider=openai \
  --input-1=scripts/voice-benchmark/questions/turn-01.wav \
  --input-2=scripts/voice-benchmark/questions/turn-02.wav \
  --input-3=scripts/voice-benchmark/questions/turn-03.wav \
  --input-4=scripts/voice-benchmark/questions/turn-04.wav \
  --input-5=scripts/voice-benchmark/questions/turn-05.wav \
  --out=tool-results/openai-conversation.json
```

Repeat the exact same WAVs, test KB, browser/device and network for `elevenlabs`, `gemini`, and `sarvam`, after selecting that provider in Clara's real configuration. The `--provider` argument is an expected label only; the script fails if observed telemetry reports a different provider. Run providers serially at concurrency 1. Run at least one warm-up and 10 measured sessions per provider for stable comparisons.

### Diagnosing a turn timeout

If a run times out after the welcome response, inspect the partial report fields
`playedInputs`, `dataChannelEvents`, and `microphoneDiagnostics`. The harness
records audio duration/sample rate/RMS/peak (not speech content), microphone
track state, and realtime data-channel event **types only**. It deliberately
does not save data-channel message bodies or transcripts.

Interpret the evidence in this order:

- No `playedInputs`: the audio was not successfully decoded/played into the
  injected microphone track.
- `playedInputs` has near-zero RMS/peak: the supplied audio may be silent or
  invalid for the test.
- No inbound data-channel events after playback: inspect session/data-channel
  setup and WebRTC input delivery.
- Inbound events exist but no transcription-completed event: inspect OpenAI
  input-audio commit/VAD/transcription configuration and event errors.
- Transcription-completed is present but no RAG request: inspect Clara's
  transcription handler and RAG scheduling path.
- RAG runs but no completed assistant event: inspect RAG result handling,
  `response.create`, and provider response events.

Use the configured **public voice embed URL** for the target agent, not the
admin page route `/agents/{agentId}`, unless you are specifically testing the
admin route's voice UI. The URL path must come from the actual Clara embed
configuration; never guess or share its secret key in a report.

### Important interpretation limits

- This measures the actual voice UI and actual provider/STT/RAG/TTS path, not a text-only RAG shortcut.
- Browser request timings/counts do **not** include server-internal database, provider, embedding, Qdrant or MCP calls. Those require the planned server spans in `IMPLEMENTATION-PLAN.md`.
- Current common latency telemetry does not expose provider token usage or a guaranteed finish/truncation reason. Output explicitly labels usage unavailable rather than inventing it. Implement provider completion usage telemetry before claiming token-budget validation.
- The existing stage marks use epoch milliseconds; cross-device clock subtraction is invalid. The harness uses its browser click epoch for click-to-audio and keeps request durations within the browser clock.
- A provider that does not emit a greeting latency event will time out at the welcome gate. Treat that as missing lifecycle instrumentation to fix, not as zero latency.
- WAV must contain real speech in a browser-decodable RIFF/WAVE format. Validate microphone injection on a non-production test environment first.

## Report acceptance gate

The harness now writes a partial JSON report on a welcome/turn timeout or provider mismatch, so a failed run still preserves observed events, request records, console errors and the failure reason. Schema version 2 distinguishes a telemetry completion barrier from verified answer integrity. The first-audio metric is a **telemetry mark**, not independent proof that a human-audible sample played.

After a run, validate timing-record completeness:

```bash
node scripts/voice-benchmark/validate-report.mjs \
  --report=tool-results/openai-conversation.json \
  --provider=openai
```

The validator is an acceptance check for the five-turn timing capture only. It emits warnings for missing TTFA, token usage, answer-integrity evidence, console errors and failed requests. A PASS is **not** a functional answer-quality pass and must not be described as proof of non-truncated answers.

## Current milestone status (2026-10-11)

- Implemented: five sequential WAV turns, common telemetry capture, browser-visible request timing/counts, provider label mismatch failure, partial failure report, explicit integrity/usage limitations, report validator.
- Not yet verified: Node syntax/runtime, Playwright and WAV microphone injection, live session/welcome timing, all four provider paths, answer correctness/non-truncation, token usage, server-internal DB/provider/embedding/Qdrant/MCP call counts.
- Do not publish comparative latency conclusions until a real run report exists for each provider under the same test KB, WAVs, browser/device and network. Do not mark this milestone fully verified yet.

## Run the local script checks

From the repository root with Node.js 22 or later:

```bash
npm run test:voice-benchmark
```

This runs `node --check` against the conversation harness and report validator, then tests the validator against a valid report, missing turns, provider mismatch and missing correlation IDs. The same dependency-free checks run in `.github/workflows/voice-benchmark-script-check.yml` on relevant pushes and pull requests. They do **not** start a Clara session or prove provider speech behavior.


## Included synthetic speech fixtures

Five short English MP3 speech recordings matching the exact scenario prompts are committed under `scripts/voice-benchmark/questions/turn-01.mp3` through `scripts/voice-benchmark/questions/turn-05.mp3`. MP3 is decoded by the browser audio context before being played into the benchmark's controlled microphone track; the test does not post text directly to RAG.

Example:

```bash
node scripts/voice-benchmark/conversation.mjs \
  --url="YOUR_NON_PRODUCTION_EMBED_URL" \
  --provider=openai \
  --input-1=scripts/voice-benchmark/questions/turn-01.mp3 \
  --input-2=scripts/voice-benchmark/questions/turn-02.mp3 \
  --input-3=scripts/voice-benchmark/questions/turn-03.mp3 \
  --input-4=scripts/voice-benchmark/questions/turn-04.mp3 \
  --input-5=scripts/voice-benchmark/questions/turn-05.mp3 \
  --out=tool-results/openai-conversation.json
```

The recordings contain synthetic English speech generated from the exact short prompts in `five-turns.json`; they are fixtures, not user recordings. The first live run must still confirm that the application captures the injected audio and that the STT provider recognises it as intended.

### Audio drain and timeout controls

The harness now waits `--welcome-drain-ms=2000` after the welcome first-audio telemetry before injecting the first question, and defaults to `--drain-ms=1800` between completed turns. These conservative quiet periods address a trace where the first question started roughly 118 ms after the welcome `response.done`, and the realtime channel then reported output-buffer clearing/truncation events. They reduce overlap risk but are not direct proof that remote audio playback ended; output-buffer lifecycle instrumentation remains diagnostic evidence. Set either value explicitly when reproducing a run, and do not reduce them until the welcome/turn lifecycle is confirmed.

Each `playedInputs` entry records `playbackStartedAt` and `playbackCompletedAt` separately. The `drainSettings` field in failure reports records both configured quiet periods. If transcription-completed and turn-complete telemetry are still absent after this repair, inspect the captured data-channel event types in order; do not treat transcription deltas or a successful realtime connection as a completed turn.
