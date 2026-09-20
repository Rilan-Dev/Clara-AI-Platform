# Realtime Voice Rollout Runbook (Plan Phase 13)

## Feature flags (rollback is configuration-only)

| Flag | Default | Gates |
|---|---|---|
| `SARVAM_REALTIME_STT_ENABLED` | `false` | Sarvam realtime STT relay + realtime TTS descriptor in the session payload (the relay legs always exist; the browser only uses them when the descriptor is minted) |
| `ELEVENLABS_REALTIME_ENABLED` | `false` | ElevenLabs Mode C (Clara realtime): tri-mode selector returns `clara-stream`, session mints the `stt.realtime` descriptor + relay token |
| `ELEVENLABS_ENABLED` + key | `false` | Base ElevenLabs gate (Modes A/B/C) |
| `SARVAM_ENABLED` + key | `false` | Base Sarvam gate |

Both realtime flags are locked DARK by default in `model-catalog.test.ts` /
`elevenlabs-modes.test.ts`. **No KB migration is part of the voice-provider
rollout** (plan §14): flipping either flag changes transport only — the
tenant/KB/RAG binding is enforced per session by `groundClaraContext` and the
session-route guard ladder.

## Staged rollout (plan order)

1. **Local development** — `PORT=3100 node scripts/start.mjs` with the flag
   on against a dev KB; verify connect → greeting → committed turn → grounded
   answer → interrupt → reconnect using the benchmark harness
   (`scripts/voice-benchmark/run.mjs --input=wav:<question>.wav`).
2. **Internal/admin tenant** — enable for the platform's own org; exercise
   Test D (interruption at STT/RAG/LLM/TTS) and Test E (code switching).
3. **One controlled tenant** — a friendly customer org with a monitored KB.
4. **Small allowlist** — 5–10 orgs; watch usage metering (voice usage events
   per generation — `logSttUsage`/`logTtsUsage`) and provider error rates.
5. **Broader rollout** — default-on for new orgs.
6. **General availability.**

## Rollback

Set the flag back to `false` (or unset) and redeploy / restart — the session
routes stop minting the realtime descriptors, the browser falls back to the
Mode A pipeline automatically (`useVoiceClient` falls back when the descriptor
is refused), and no data or schema change needs reverting.

## Verification gates before each stage

- `npm test` · `npm run type-check` · `npm run lint` (all green at HEAD).
- Benchmark p50/p95 TTFA recorded for the stage's provider vs the OpenAI
  baseline (`docs/superpowers/reports/2026-09-20-openai-realtime-ttfa-baseline.md`).
- Security checks green (`security-validation.test.ts`).
- Usage metering sanity: exactly one STT usage event per committed turn and
  one TTS usage event per generation (`tts-relay-meter.test.ts`).
