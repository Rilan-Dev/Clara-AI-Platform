# Realtime Voice Latency Analysis — Session 004

Date: 2026-10-11  
Branch: `feature/ai-core-from-doable-source`

## Implemented

- Added `scripts/voice-benchmark/validate-report.test.mjs` with positive/negative report validation cases.
- Added `.github/workflows/voice-benchmark-script-check.yml` to run Node syntax checks and validator tests without installing app dependencies or requiring provider secrets.
- Added `npm run test:voice-benchmark` as a local one-command check and documented it in the benchmark README.
- Confirmed by source inspection that the OpenAI realtime hook emits `clara:voice:latency` at `response.done`, including provider/session/generation/turn IDs and a `turn.complete` mark. This supports the intended barrier contract for that hook but is not runtime proof.

## Verification state

The test files and workflow are committed. **Node checks have not been executed in this environment**, because the shell cannot resolve GitHub to clone the working tree. GitHub Actions was configured to run the checks, but its result has not been retrieved; do not treat this as a passing test.

No real OpenAI/ElevenLabs/Gemini/Sarvam session has been run. No latency figures are available.

## Next actions

1. Run `npm run test:voice-benchmark` in a local checkout or inspect the new workflow run.
2. Run the first five-turn OpenAI speech benchmark against a dedicated non-production Clara instance with the matching five WAVs and synthetic test KB.
3. Fix any real lifecycle/microphone/runtime failures found by that run.
4. Add privacy-safe provider finish/usage/answer-integrity telemetry and server-side call spans for DB, provider, embeddings, Qdrant, RAG, and MCP.
5. Repeat the same scenario across OpenAI, ElevenLabs, Gemini and Sarvam, then collect warm-up + 10 measured sessions per provider.

## Acceptance

**Still implementation-in-progress.** Automated script checks are configured but not confirmed green; live voice tests and server-side call attribution remain outstanding.
