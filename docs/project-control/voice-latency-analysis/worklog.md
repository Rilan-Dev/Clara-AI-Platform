# Realtime Voice Latency Analysis — Worklog

Dedicated worklog for the voice latency/network benchmark audit. Keep this separate from the general project worklog; append new dated entries and never erase prior findings.

## 2026-10-11 — Session 001: source reconnaissance

- Repo/branch: `Rilan-Dev/Clara-AI-Platform` / `feature/ai-core-from-doable-source`
- Audited HEAD: `b941538dede4d023b3f5381041d70feee7cf72a9`
- Scope: OpenAI realtime client hook, shared latency tracker/log, Playwright benchmark harness, realtime tool dispatch, related tests/reports.
- Changed application code: none.
- Persistent record: `docs/project-control/voice-latency-analysis/SESSION-001.md`
- Findings:
  - Existing client-side stage timing and p50/p95 aggregation are present.
  - Existing stages: STT, RAG, LLM first token, TTS first audio, playback, and TTFA.
  - Historical telemetry fix preserves STT marks across interim/committed turn replacement; keep regression coverage.
  - Current benchmark is primarily a voice-turn latency harness, not a full per-service network attribution harness.
  - Fake-tone mode may capture zero speech turns and currently produces a note/output rather than an explicit test failure.
  - Current output needs richer reproducibility metadata, explicit errors/missing-stage counts, per-question control, and network/session-setup measurements.
  - MCP/realtime integration invocation is a separate latency path requiring spans around authorization, discovery/cache and upstream tool calls.
- Verification: GitHub source read only. No tests, build, live provider requests or network measurements executed. No latency numbers claimed.
- Risks: historical reports may describe fixes already changed since report commit; reconcile against branch HEAD before accepting conclusions.
- Next: map provider event markers and server `Server-Timing` emission; review historical baseline and existing tests; then design a deterministic benchmark and stage-level attribution tests.
