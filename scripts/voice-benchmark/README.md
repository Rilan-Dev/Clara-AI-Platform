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
