# Voice Latency Analysis — Durable Memory

This folder contains a dedicated audit trail for Clara realtime voice-agent latency work. Read this file, then `SESSION-001.md`, `CRITIQUE.md`, and `worklog.md` before continuing the investigation.

## Scope and invariants

- Repository: `Rilan-Dev/Clara-AI-Platform`
- Working branch: `feature/ai-core-from-doable-source`
- The branch is the source of truth; re-check its current HEAD before continuing.
- ChatGPT role: architect/reviewer and evidence-based planning. Do not claim runtime verification unless tests or real probes were actually run.
- Goal: determine where realtime voice response time is spent, then build controlled tests that report per-service/per-stage latency in milliseconds and show evidence-backed optimization opportunities.
- Preserve Clara-owned tenant-bound KB/Qdrant/RAG, authorization, provider configuration, tool permissions, cancellation, barge-in, generation identity and duplicate-response prevention.
- Do not invent latency numbers. Code inspection and historical reports are not live performance measurements.

## Primary code map

- Browser OpenAI realtime: `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`
- Shared tracker: `src/modules/voice-core/realtime/latency-tracker.ts`
- Console latency summary: `src/modules/voice-core/realtime/latency-log.ts`
- Browser benchmark: `scripts/voice-benchmark/run.mjs`
- Benchmark instructions: `scripts/voice-benchmark/README.md`
- Realtime session route: `src/modules/assistant/api/realtime.ts`
- Realtime tool dispatch: `src/modules/assistant/api/realtime-tool.ts`
- Existing tests: `src/modules/voice-core/realtime/latency-tracker.test.ts`, `latency-log.test.ts`, `src/modules/assistant/api/realtime.test.ts`, `realtime-tool.test.ts`
- Provider paths to inspect: `src/modules/voice-core/api/elevenlabs/`, `src/modules/voice-core/api/sarvam/`, `src/modules/voice-core/api/gemini/`, plus OpenAI client/session code.
- Historical evidence to reconcile: `docs/superpowers/reports/2026-09-20-openai-realtime-ttfa-baseline.md`, `docs/superpowers/reports/2026-09-21-production-voice-latency.md`, `docs/superpowers/reports/2026-09-21-voice-gap-closure.md`.

## Known initial observation

Current shared telemetry derives STT, RAG, LLM first-token, TTS first-audio, playback and TTFA. TTFA is defined as browser first audio minus final STT transcript. The current Playwright harness captures events over a fixed window and may output zero turns when using fake-tone input. The harness does not yet establish complete network/service attribution.

## Continue in this order

1. Verify current branch HEAD and read latest project-control NEXT_ACTION/current phase before touching application code.
2. Map stage marks and request spans across each provider, API route, RAG/Qdrant, LLM, TTS, browser playback and MCP/tool path.
3. Reconcile historical reports with current code and focused tests.
4. Design a deterministic per-question benchmark with plumbing-only and speech modes, explicit minimum valid sample count, per-turn timeout, missing-stage/error reporting and reproducibility metadata.
5. Add network/setup timing (WebRTC/ICE and applicable HTTP resource timing), server-side durations, and trace/turn correlation without cross-clock subtraction.
6. Run focused unit tests and only then credential-safe, opt-in live probes; clearly label source review, synthetic tests and real measurements.
7. Record every action in this folder's `worklog.md`; append new numbered session files rather than overwriting completed history.
