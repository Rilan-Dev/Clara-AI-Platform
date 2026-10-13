# Voice latency diagnostics session — 2026-10-12

## Continuity / ownership
- Repository: `Rilan-Dev/Clara-AI-Platform`
- Working branch for this workstream: `fix/openai-vad-audio-diagnostics-clean`
- PR: https://github.com/Rilan-Dev/Clara-AI-Platform/pull/295 (do not merge unless the owner explicitly requests it).
- Production agent under test: https://clara.ai.amazetechclans.com/agents/a7107bde-ff33-4952-9ebf-ad0d1dac3861
- This is a voice-latency diagnostics workstream. Other project-control records may describe separate current workstreams/branches; do not overwrite them or assume their state applies to this branch.
- Owner policy: continue source work without waiting/polling GitHub Actions or Vercel; all GitHub Actions workflows must remain manual-only (`workflow_dispatch`). Never claim verification not actually observed.

## Objective and targets
1. Reduce OpenAI realtime voice first-audible-answer latency while preserving Clara/Qdrant grounding, tenant isolation, quota admission, permissions, and one-response/no-duplicate behavior.
2. Aspirational target: <=500 ms first audible response. This target is not met and is not a guarantee.
3. Measure **grounded answer TTFA** separately from welcome audio or acknowledgement TTFA. A quick acknowledgement is not an answer to the question.
4. Optimize based on measured stage timings, not guesses. The current serial STT → RAG → LLM → TTS path makes a fully grounded answer within 500 ms unrealistic until the stage pipeline materially changes.

## Work completed / commits
- `633039759f00934ccf283f141ee93bb2b8f54e65`: benchmark-only zero-gain oscillator keepalive for the synthetic MediaStreamDestination, to keep silent audio flowing between injected clips and prevent VAD/commit stalls. Not production behavior.
- `76640c39a77e3c1f7600285eeb405260f7a5f5b8`: bounded pending response-body flush to 2 seconds so benchmark finalization cannot hang indefinitely after all turns.
- `f75a35d6fd8e18d91fffd64189834de8d6377c69`: documented the benchmark finalization hang.
- `08708e3aae6849012c011250c77b665962c4dfc7`: changed `.github/workflows/voice-benchmark-script-check.yml` to manual-only. The other workflows on this branch (`ci.yml`, `platform-health-scan.yml`) were already manual-only. Policy: no automatic push/PR/schedule triggers; retain manual dispatch.
- `a78b4aebc9a2f71e5287698004b9e9e46e81164f`: privacy-safe RAG timing capture in `scripts/voice-benchmark/conversation.mjs`. Captures endpoint label, status, browser fetch elapsed-to-headers, Server-Timing header, and numeric `payload.timings` only for `/api/rag/search` and `/api/embed/rag`. It intentionally excludes prompts, query text, snippets, context, response bodies, and credentials.
- `7b13ba84992ba036a8f43e931005de2cedeaf1d0`, `1a6e5086d8071fcbf9c7c3ef0613a5b82237a0f0`: recorded progress and baseline/next experiment in project-control docs.
- PR #295: https://github.com/Rilan-Dev/Clara-AI-Platform/pull/295.

## Observed benchmark baseline
Owner ran `scripts/voice-benchmark/conversation.mjs` against the production agent with OpenAI and `turn-01.mp3` through `turn-05.mp3`; output path was `tool-results/openai-vad-silence-keepalive.json`. It completed all five turns and exited after the flush timeout fix.

| Metric | Turn 1 | Turn 2 | Turn 3 | Turn 4 | Turn 5 |
|---|---:|---:|---:|---:|---:|
| Wall time | 16,227 ms | 13,396 ms | 13,039 ms | 8,287 ms | 9,370 ms |
| STT | 1,374 ms | 1,539 ms | 1,642 ms | 1,141 ms | 1,597 ms |
| RAG | 7,249 ms | 5,186 ms | 4,433 ms | 527 ms | 663 ms |
| LLM first | 769 ms | 658 ms | 592 ms | 717 ms | 806 ms |
| TTS first | 923 ms | 791 ms | 680 ms | 819 ms | 940 ms |
| TTFA | 8,273 ms | 6,078 ms | 5,213 ms | 1,447 ms | 1,704 ms |

- Median TTFA: 5,213 ms; fastest: 1,447 ms.
- Median full-turn wall time: 13,039 ms.
- Welcome audio click-to-first-audio was 11,399 ms; this is welcome latency and must not be conflated with per-question answer TTFA.
- RAG dominates the first three turns and falls substantially on later turns. Cold cache/warm-up/config/network effects are plausible but not yet proven.
- STT is ~1.1–1.6 s; LLM-first ~0.59–0.81 s; TTS-first ~0.68–0.94 s. Even after RAG optimization, the full 500 ms grounded-answer target will need broader pipeline changes.
- Earlier benchmark failure showed no speech-stopped/commit/transcription-completed event; the benchmark-only silent audio keepalive enabled successful five-turn runs. Do not change production VAD based only on this synthetic-input workaround.
- The benchmark previously hung after all turns because `Promise.all(pendingResponseFinishes)` could wait on a long-lived response. The 2-second bounded flush fixed finalization for the reported run.

## Relevant source architecture / constraints
- Client realtime hook: `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`.
- `RAG_DEBOUNCE_MS=100` already exists (previously reduced from 1500 ms).
- `performRagAndRespond` waits for RAG before creating one response with `tool_choice: "none"`; preserve this no-duplicate-response contract.
- RAG server: `src/modules/rag/grounding.ts`; payload timings can include `metadataMs`, `admissionMs`, `configMs`, `translationMs`, `retrievalMs`, `graphMs`, `totalMs`.
- Retrieval includes collection/embedding configuration, potential query translation, quota admission, embeddings + Qdrant search, and optional graph retrieval. Measure each stage before choosing an optimization.
- Avoid speculative partial-query RAG against the production endpoint unless carefully designed: it can spend quota/analytics on wrong partial queries and risks a result for a mismatched final question.
- Preserve Clara/Qdrant as the grounding source; do not switch to provider-native KB or invent answers to improve latency.

## Exact next actions
1. Pull this branch and check the diagnostic script:
   ```bash
   git pull origin fix/openai-vad-audio-diagnostics-clean
   node --check scripts/voice-benchmark/conversation.mjs
   ```
2. Run the five-turn benchmark to a **new output path**:
   ```bash
   node scripts/voice-benchmark/conversation.mjs \
     --url="https://clara.ai.amazetechclans.com/agents/a7107bde-ff33-4952-9ebf-ad0d1dac3861" \
     --provider=openai \
     --input-1=scripts/voice-benchmark/questions/turn-01.mp3 \
     --input-2=scripts/voice-benchmark/questions/turn-02.mp3 \
     --input-3=scripts/voice-benchmark/questions/turn-03.mp3 \
     --input-4=scripts/voice-benchmark/questions/turn-04.mp3 \
     --input-5=scripts/voice-benchmark/questions/turn-05.mp3 \
     --out=tool-results/openai-rag-stage-timings.json
   ```
3. Share/upload `tool-results/openai-rag-stage-timings.json` (or paste the `ragRequests` and per-turn timing sections). Compare browser elapsed time against server `metadataMs`, `admissionMs`, `configMs`, `translationMs`, `retrievalMs`, `graphMs`, and `totalMs`.
4. Select one measured dominant stage, make a narrow low-risk source change on this branch, add/adjust focused regression tests, and commit. Do not wait for CI/Vercel. Be explicit about tests actually executed vs not executed.
5. If production runtime source changes, tell the owner a deployment/rebuild is required before comparing production benchmark results. No deployment is claimed by this session record.
6. Keep all workflows manual-only and do not merge PR #295 without explicit owner instruction.

## Verification state at handoff
- Observed: owner reported the five-turn benchmark completed and exited; baseline numbers above were provided by owner.
- Source changes were committed to GitHub; this assistant session did not execute the user's local script, syntax check, tests, build, or production deployment.
- New stage-timing report is **pending**. No latency fix or <=500 ms target PASS is claimed.
- Next evidence expected: fresh report `tool-results/openai-rag-stage-timings.json`.


## 2026-10-12 — Voice benchmark welcome telemetry timeout

- Owner ran the updated five-turn benchmark after pulling through `1a6e5086`; the script syntax check produced no visible error, but benchmark timed out after 45 seconds waiting for `browser.first_audio` welcome telemetry before it played any question clips. It wrote partial diagnostics to `tool-results/openai-rag-stage-timings.json`.
- This failure does not establish a production outage or RAG latency; the run did not reach the question-turn measurements.
- Corrective harness change: welcome telemetry is now optional diagnostic metadata. If it is missing, the benchmark logs a warning and continues to the five question turns; the welcome mark is represented as null/unavailable, never zero. Per-turn telemetry barriers and provider checks remain required, and failure diagnostics remain available.
- Commits: `fb2a17b874a084e9294166ca6ad88f01830f21ee` (continue without welcome mark); `513a317b2063bb27035b581a3f3f1c4b300b2f27` (null-safe successful report serialization).
- **Pending verification:** owner must pull latest branch, run `node --check scripts/voice-benchmark/conversation.mjs`, then rerun the same five-turn benchmark to `tool-results/openai-rag-stage-timings.json`. Share the new report. If it fails again, share the full new failure summary including `dataChannelEvents`, `observedLatencyEvents`, `microphoneDiagnostics`, `requestCounts`, `failures`, and `consoleErrors`.
- Do not claim benchmark PASS, production latency improvement, or <=500 ms target attainment. Continue without waiting for Actions/Vercel; keep all workflows manual-only.