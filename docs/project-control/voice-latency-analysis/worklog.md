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

## 2026-10-11 — Session 006: commit short synthetic audio fixtures

- Added five compact, synthetic English MP3 input recordings for the benchmark prompts, stored at `scripts/voice-benchmark/questions/turn-01.mp3` through `turn-05.mp3`.
- Shortened the five scenario prompts to match the included speech: support hours, normal ticket response time, urgent ticket response time, email change, and combined response targets.
- Updated the harness to accept MP3 input (via browser `decodeAudioData`) as well as WAV and gzip-compressed WAV. Updated the scenario manifest and README to use the repository-relative paths.
- Verified the five files are present on the target branch and GitHub returns base64-encoded file contents with MP3/ID3 headers. This verifies repository presence/format signature only; no browser audio decode, STT recognition, or live provider run was executed here.
- Audio fixtures are short, low-bitrate synthetic speech to keep repository size small. If STT recognition fails, replace with higher-quality WAV/MP3 fixtures and compare transcripts only in the isolated test session; do not add transcripts to production logs.
- Next: run `npm run test:voice-benchmark`, then run the OpenAI test command from the README against a non-production embed session.


## 2026-10-12 — Session 007: prevent welcome/inter-turn audio overlap

- Evidence reviewed: failed OpenAI runs showed the first fixture playback starting about 118 ms after the welcome `response.done`; the realtime data-channel trace later included output-buffer clearing and conversation-item truncation. This is consistent with overlapping input and still-playing welcome audio, but does not alone prove the root cause of missing turn telemetry.
- Updated `scripts/voice-benchmark/conversation.mjs`: default welcome drain is now 2000 ms before input 1; default inter-turn drain is now 1800 ms; both remain configurable via `--welcome-drain-ms` and `--drain-ms`. These are conservative quiet periods, not a direct audible-playback completion signal.
- Added separate `playbackStartedAt` and `playbackCompletedAt` timestamps to each `playedInputs` diagnostic record, and included `drainSettings` in partial failure reports.
- Updated the benchmark README with the evidence, new controls, interpretation limits, and next diagnostic steps.
- Verification: GitHub source updates committed as `cbc382da34da686399f48da04fb7e727075a9851` (harness) and `48ec64f33546b9a9aeaf2033d7b75957a2d5f5f6` (README). Node syntax checks, validator tests, browser runs, and live OpenAI session have NOT been executed in this tool session. No benchmark success or latency conclusion is claimed.
- Next: run `npm run test:voice-benchmark`; then rerun a single OpenAI session against the actual non-production embed URL. If it still times out, inspect the ordered data-channel event types to identify whether audio commit/VAD, transcription completion, RAG scheduling, or response creation is missing.


## 2026-10-12 — Session 008: Qdrant REST client breaking API migration

- New user-provided backend log gives a direct root cause: `[rag] postRagSearch: TypeError: a.search is not a function` while handling `/api/embed/rag`. The source uses `@qdrant/js-client-rest: ^1.19.0`; upstream v1.19.0 removed `QdrantClient.search()` in favor of `query()`, and the new query response shape is `{ points: [...] }`. Source: https://github.com/qdrant/qdrant-js/blob/master/packages/js-client-rest/CHANGELOG.md
- Migrated all four known application retrieval call sites from `client.search(collection, { vector, ... })` to `client.query(collection, { query, ... })` and unwrap `response.points`: `src/modules/rag/grounding.ts`, `src/modules/embed/core/search.ts`, `src/modules/admin/core/hybrid-search.ts`, and `src/modules/admin/core/vector-store.ts`.
- Updated grounding unit-test Qdrant mocks to model the new `query()` API and `{ points }` response shape, including missing-collection and cross-lingual retrieval cases.
- Commits: `ff30781c` grounding; `d5bf1a67` embed retrieval; `757edaf2` hybrid retrieval; `cfe2945c` vector-store retrieval; `c971c5b3` initial test-mock migration; `dde8c781` cross-lingual mock correction.
- Verification: changes were committed via GitHub source API. No local type-check, unit tests, Docker rebuild, or live Qdrant request was executed in this session. The earlier running container still contains the old build until rebuilt/recreated from the updated branch.
- Separate warnings: Next.js invalid Server Reference ID and ElevenLabs 403 are not addressed by this Qdrant fix. The PDF canvas warnings are also separate from the RAG retrieval exception.
- Next: pull the branch, run `npm run type-check` and the focused grounding/embed/vector-store tests, rebuild/recreate `clara-backend`, then send a single test query and confirm the Qdrant request reaches the query endpoint and `/api/embed/rag` returns a successful JSON response. Then rerun the voice benchmark.

## 2026-10-12 — Session 009: follow-up compile triage

- Reviewed the user's post-pull output: `npm run type-check` reports 68 errors across 30 files; the focused Vitest command fails before test collection because `vite` is absent; the voice benchmark validator passes. Docker production build had started but no final build/recreate result was included in the log.
- Confirmed the Qdrant calls in current branch application files use `client.query()` and unwrap `response.points`. The old calls reported under `docs/clara-core/source/**` are in an archived/reference source snapshot; updated `tsconfig.typecheck.json` to exclude `docs/clara-core/**` rather than rewriting the preserved snapshot.
- Fixed a genuine realtime-route scope regression by keeping the server-resolved `orgRows` and `orgId` available to the gated integration/MCP tool advertisement block; typed the provider tool list as `OpenAIRealtimeFunctionTool[]`.
- Fixed the malformed-policy MCP test referencing a resolver declared only inside a different test, and constrained the integration authorization query generic to PostgreSQL `QueryResultRow`.
- Commits: `21bac248` type-check exclusion; `c90f663a` realtime scope/tool typing; `d1c92ed4` MCP test resolver reference; `bbbf72f4` query row constraint.
- Verification: GitHub branch source reviewed after writes. Type-check, Vitest, Docker build, and live RAG/voice calls have not been rerun from this tool session. Do not interpret the 68-error run as the current post-fix count; the user log predates these follow-up commits. The remaining unrelated type errors include Stripe SDK typing, UI library version mismatches, BullMQ/ioredis types, PDF parser API, and several app-level issues.
- Next: pull the latest branch, run the focused type-check and grounding test again, and inspect the *new* errors. Resolve the missing Vite test dependency with a lockfile-consistent change; continue the realtime/RAG verification without waiting for CI/Vercel.

## 2026-10-12 — Session 010: post-pull type-check follow-up

- User reran `npm run type-check`: the count decreased from the prior 68 reported errors to 51 across 23 files. The voice benchmark report-validator suite passes. The user did not include a new live RAG result or Docker build result in this update.
- Follow-up fixes committed:
  - `31e4f6f8` — validate registry provider IDs against the app's supported AI/voice unions before writing version defaults, rather than assigning arbitrary database strings to typed configuration.
  - `da99d79a` — remove the invalid `2 as unknown as null` BullMQ retry setting in the queue health check; BullMQ requires `maxRetriesPerRequest: null` for an options-based connection.
  - `edb6cf36` — accept React 19's nullable DOM ref type in the conversation rail.
  - `6ad9b281` — remove obsolete global `JSX.Element` annotation, compatible with React 19 JSX typings.
  - `4f8cbe5d` — simplify the WhatsApp transaction test mock callback typing and remove the self-referential local variable type.
- Verification: these edits were committed via GitHub and source anchors were matched before writes. No local TypeScript, Vitest, Docker, or live API run was possible in this session. Do not claim these changes are type-check clean until the user reruns the command.
- Remaining 51-error set includes Stripe SDK type surface inconsistencies, React Day Picker v10 vs legacy calendar props, Recharts v3 type changes, resizable-panels v4 API changes, BullMQ/ioredis major-version type mismatch, and smaller PDF parser, missing `@types/ws`, import-extension, and Markdown component typing issues. The installed dependency majors in `package.json` are newer than the APIs several components were written against; resolve each by an intentional compatibility migration or matching dependency pin, not by broad `any` casts.
- Next: rerun type-check; address dependency/API compatibility in focused groups, then resolve the Vitest/Vite installation mismatch and return to live Qdrant RAG and voice response verification. Keep development moving independently of CI/Vercel gates.
