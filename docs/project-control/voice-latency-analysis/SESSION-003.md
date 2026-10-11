# Realtime Voice Latency Analysis — Session 003

Date: 2026-10-11  
Repository: `Rilan-Dev/Clara-AI-Platform`  
Branch: `feature/ai-core-from-doable-source`

## Goal

Make the five-turn voice benchmark safer to operate and preserve evidence from failed runs, then accurately mark what is and is not verified.

## Changes committed

- Updated `scripts/voice-benchmark/conversation.mjs`:
  - schema-v2 reports;
  - partial report persisted for welcome/turn timeout and provider mismatch;
  - correlation IDs and observed latency events retained in failure reports;
  - telemetry barrier named explicitly instead of implying answer correctness;
  - answer-integrity and token-usage gaps are explicit;
  - first-audio is labelled as a telemetry mark, not proof of audible playback;
  - bearer/token-like values and URL query values are redacted from diagnostic text.
- Added `scripts/voice-benchmark/validate-report.mjs`:
  - requires schema v2, completed status, expected provider, five turns, welcome telemetry, per-turn completion barriers and correlation IDs;
  - warns about missing TTFA, token usage, answer integrity, console errors and failed browser requests;
  - explicitly states that timing acceptance is not a full functional pass.
- Updated `scripts/voice-benchmark/README.md`, `docs/project-control/voice-latency-analysis/IMPLEMENTATION-PLAN.md`, and `worklog.md`.

## What this achieves

The benchmark now has a clearer report contract and failure evidence is less likely to be lost when a provider fails to emit a welcome or turn event. The report gate helps distinguish a structurally complete timing capture from a fully verified voice conversation.

## Verification evidence

**No runtime verification was performed in this session.** The connected GitHub file operations confirm that source and documentation changes were committed, but do not execute Node or Playwright. Do not claim the scripts parse, the microphone injection works, or any provider succeeds until executed in a real repo runtime.

## Open blockers

1. Run `node --check scripts/voice-benchmark/conversation.mjs` and `node --check scripts/voice-benchmark/validate-report.mjs`.
2. Exercise `validate-report.mjs` with both a valid synthetic report and malformed/missing-field reports.
3. Validate WAV injection on a non-production Clara voice widget and capture the first OpenAI session report.
4. Verify provider identity, greeting events, final-turn barrier, and audio drain across OpenAI, ElevenLabs, Gemini and Sarvam.
5. Add privacy-safe provider completion metadata: finish reason, token usage where supported, output length/hash, and final audio completion.
6. Instrument server-side call counts and durations for bootstrap DB/config/provider calls, RAG embedding/Qdrant/rerank, and integration/MCP round-trips.
7. Run one warm-up plus 10 measured sessions per provider using the same WAVs, test KB, browser/device and network; publish raw reports and robust percentiles.

## Acceptance state

**Implementation in progress; not yet verified.** No live latency measurements or four-provider pass are claimed.
