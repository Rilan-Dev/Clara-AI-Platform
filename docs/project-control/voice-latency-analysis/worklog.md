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

- Added `scripts/voice-benchmark/conversation.mjs`: browser-controlled WAV playback for five sequential turns, wait-for-completion barrier, browser request count/timing records, and welcome-to-first-audio measurement when common telemetry is available.
- Added `scripts/voice-benchmark/scenarios/five-turns.json`: five synthetic prompts and expected KB facts.
- Added `docs/project-control/voice-latency-analysis/IMPLEMENTATION-PLAN.md` and `SESSION-002.md`.
- Updated benchmark README with the new harness and limits. Script execution/live validation is still pending; provider token usage and server-internal service spans are explicitly marked as gaps.
- Extended route trace through `src/app/api/rag/search/route.ts`, `src/app/api/embed/rag/route.ts`, `src/app/api/embed/session/route.ts`, Gemini session delegation, and ElevenLabs/Sarvam realtime-init routes. This confirms provider-specific session bootstrap paths must be measured separately; shared RAG internals are in `src/modules/assistant/api/rag.ts`.

## 2026-10-11 — Session 003: benchmark failure diagnostics and report gate

- Updated `scripts/voice-benchmark/conversation.mjs` to write schema-v2 partial diagnostics on welcome/turn timeout or provider mismatch. A failed run now preserves observed latency events, completed turn records, browser request records, request failures, console errors and the failure reason where available.
- Replaced the ambiguous `completed` flag with `telemetryBarrierReached`; explicitly records that answer integrity and provider token usage are not verified by current shared telemetry.
- Reworded the welcome metric as a first-audio telemetry mark; it is not independent confirmation of audible playback.
- Added redaction for bearer/token-like strings and URL query values in captured browser errors and benchmark failure diagnostics.
- Added `scripts/voice-benchmark/validate-report.mjs`, a Node built-in-only report gate requiring five sequential turn records and provider consistency while warning on missing TTFA, token usage, answer-integrity evidence, console errors and failed requests.
- Updated `scripts/voice-benchmark/README.md` with acceptance usage and explicit milestone status.
- Verification status: changes are committed to GitHub. This environment has not executed Node, Playwright, a live Clara session or any provider requests; syntax/runtime and real microphone injection remain unverified. No latency measurements are claimed.
- Remaining milestone blockers: verify Node syntax/runtime; test the synthetic WAV injection against a non-production Clara instance; confirm provider-specific greeting and completion events for OpenAI, ElevenLabs, Gemini and Sarvam; add provider-specific token/finish-reason/answer-integrity telemetry; instrument server-internal RAG/provider/embedding/Qdrant/MCP spans and request counts; run and retain reproducible provider reports.
- Next action: execute the scripts in the repository runtime (Node + installed Playwright), fix any syntax/runtime defects, then validate one OpenAI session before proceeding through the same five WAVs and test KB for the remaining providers. Do not use CI/Vercel completion as a reason to stop unrelated implementation, but do not claim the measurement milestone is verified without evidence.

## 2026-10-11 — Session 004: automated script checks

- Added `scripts/voice-benchmark/validate-report.test.mjs` with positive and negative validator cases: structurally valid five-turn timing report, missing turn, requested-provider mismatch, missing correlation IDs, and explicit warnings for unverified response integrity/token usage.
- Added `.github/workflows/voice-benchmark-script-check.yml` to run Node syntax checks and the validator tests on relevant branch pushes/pull requests and via manual dispatch. It does not require provider credentials or live service access.
- Added `npm run test:voice-benchmark` to make the same checks straightforward for a local checkout; documented it in the benchmark README.
- Review note: OpenAI telemetry emits a provider-neutral event at `response.done` and marks `turn.complete`; the event carries provider/session/generation/turn identifiers. The harness still relies on these shared event contracts and remains unverified for the other provider hooks.
- Verification: code and workflow committed via GitHub. This session environment cannot resolve GitHub from the shell and did not execute the Node commands locally. The newly added GitHub Actions check is asynchronous; no passing workflow result is claimed.
- Remaining: run the script check locally or inspect the workflow result when available; then perform one non-production OpenAI session, fix observed runtime issues, add provider completion/usage integrity metadata and server-side request spans, and run the four-provider matrix.

## 2026-10-11 — Session 005: diagnostic redaction and workflow trigger review

- Re-read the committed conversation harness, report validator, validator tests, Node script workflow, scenario fixture and implementation plan from the target branch.
- Hardened response-body completion diagnostics by applying the existing URL/token redactor before writing response errors to JSON. Previously, an error string could theoretically contain a credential-bearing URL even though the recorded request URL itself strips query values.
- Added `package.json` to the script-check workflow path filters so edits to the `test:voice-benchmark` command also trigger the workflow.
- Verification: reviewed the source changes via GitHub API and committed them; did not execute Node/Playwright in this environment. No workflow pass or live voice measurements claimed.
- Remaining blocker: a runtime with repository dependencies plus a dedicated non-production Clara test session and five WAV fixtures is required to validate microphone injection and real provider events.
