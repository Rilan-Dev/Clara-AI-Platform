# Clara Voice Platform — Production Implementation & Stabilization Plan

> **Execution:** REQUIRED: use `superpowers:subagent-driven-development` when implementing this plan; use `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, and `superpowers:requesting-code-review` at the appropriate stages. The Superpowers workflow explicitly recommends a fresh implementer plus review for each task and a final whole-branch review. citeturn0search0turn0search5

**Goal:** Make Clara's existing voice platform work reliably end-to-end in real usage, without replacing the fast OpenAI Realtime path or breaking Gemini, Sarvam, or existing ElevenLabs modes.

**Primary outcome:** A tenant/admin can select a realtime provider and Clara can start one clean voice session, use the same tenant-bound Clara KB/Qdrant/RAG/tools/memory configuration, stream exactly one assistant response per committed user turn, interrupt it safely, and recover from provider failures.

**Important:** This is an implementation/stabilization plan, not another architecture rewrite. Reuse the current code and the already-approved voice architecture plans.

---

# Execution status

Updated as tasks complete. Commits are on `Vite-Converted`.

- [x] Task 1.1 — Baseline report (e56805a) — 399/399 tests, tsc 0, lint 0 errors/69 pre-existing warnings
- [x] Task 1.2 — Executable provider map (ae21c4b) — `docs/superpowers/reports/2026-09-20-voice-provider-map.md`
- [x] Task 2.1 — Realtime session & generation identity (`voice-core/realtime/identity.ts`, 8 tests)
- [x] Task 2.2 — Generation coordinator (`voice-core/realtime/generation-coordinator.ts`, 19 tests)
- [x] Task 2.3 — Generation-aware playback (`assistant/core/voice/generation-playback.ts`, 11 tests incl. plan acceptance test; wired into `useSarvamVoice`)
- [x] Task 3.1 — Authenticated provider-neutral grounding entry point (`src/modules/rag/grounding.ts`; `/api/rag/search` + ElevenLabs Mode-B webhook route through it)
- [x] Task 3.2 — Identical knowledge binding test across providers (`grounding.test.ts`, 10 tests: five provider turn paths resolve identical tenant/agent/kb/document/ragMode)
- [x] Task 4.1 — OpenAI regression lock (`openai-realtime.test.ts` + `realtime.test.ts`, 21 tests: session shape, VAD create_response:false, rag_search tool schema, guards 402/409/429/404/400/500)
- [x] Task 4.2 — OpenAI TTFA baseline (`latency-tracker.ts` + 11 tests; protocol + record table in `2026-09-20-openai-realtime-ttfa-baseline.md`; device numbers land in Phase 11)
- [x] Task 5.1 — Sarvam STT config separation validated against current docs (`2026-09-20-sarvam-realtime-protocol-validation.md`)
- [x] Task 5.2 — Realtime STT wire protocol aligned (relay forwards vad.speech_start/speech_end + session.end; od-IN→or-IN; sample-rate clamp; `realtime-wire.test.ts` 10 tests; hook barge-in on vad_speech_start)
- [x] Task 5.3 — Persistent Bulbul WS TTS (existing relay + per-generation metering: `createGenerationMeter` + tts branch of realtime-meter route + `tts-relay-meter.test.ts` 6 tests)
- [x] Task 5.4 — AudioWorklet capture (`connectWorkletPcm16Capture` reusing the shared worklet; ScriptProcessor fallback; 5 tests)
- [x] Task 5.5 — Sarvam generation cancellation (`sarvam-realtime-generation.test.ts` — the exact 7-step plan scenario + single-generation invariant + metering-under-interrupt + greeting barge-in)
- [ ] Task 6.1–6.5 — ElevenLabs realtime completion
- [ ] Task 7.1–7.2 — Provider switching
- [ ] Task 8.1–8.2 — UX/state correctness
- [ ] Phase 9 — Failure recovery
- [ ] Phase 10 — Telemetry
- [ ] Phase 11 — Real-device benchmarks
- [ ] Phase 12 — Security validation
- [ ] Phase 13 — Staged rollout

---

# 0. Source-of-truth plans

Existing plans that remain authoritative:

- `docs/superpowers/plans/2026-09-20-clara-voice-modes.md`
- `docs/superpowers/plans/2026-09-20-sarvam-realtime-voice-agent.md`

This plan is the **execution bridge** between those plans and a working production implementation.

Do not create a third competing provider architecture.

---

# 1. Non-negotiable runtime invariants

Every implementation task must preserve these invariants.

## 1.1 Clara owns knowledge

```
tenant
  ↓
agent
  ↓
kbId / documentId / ragMode
  ↓
Clara retrieval
  ↓
Qdrant
  ↓
grounded context
```

No provider may silently substitute its own KB, agent memory, organization context, or retrieval source.

## 1.2 Provider selection changes transport, not tenant state

```
same tenant
same agent
same KB
same RAG policy
same tools
same memory
same authorization
        +
different realtime provider
```

## 1.3 Exactly one active generation

For every realtime session:

```
generation N active
        ↓
new turn / interrupt
        ↓
generation N invalid immediately
        ↓
cancel LLM/RAG where possible
cancel TTS
clear playback
discard stale events
        ↓
generation N+1
```

A late event from generation N must never speak, overwrite UI, or terminate generation N+1.

## 1.4 One committed user turn = one Clara turn

Partial STT updates the UI only.

Only a committed/final transcript can start the assistant generation.

## 1.5 Existing OpenAI Realtime is the regression baseline

Do not slow down or rewrite the current OpenAI realtime implementation merely to make another provider conform to it.

---

# 2. Phase 1 — Establish a clean implementation baseline

## Task 1.1 — Verify repository state

**Inspect:**

- current branch
- working tree
- current HEAD
- existing voice-related commits
- current test/typecheck/lint commands

**Steps:**

- [x] Confirm branch is `Vite-Converted`.
- [x] Confirm working tree status before edits.
- [x] Run the current test suite.
- [x] Run TypeScript validation.
- [x] Run lint.
- [x] Record failures that already exist before implementation.
- [x] Do not classify baseline failures as regressions.

**Acceptance:**

A baseline report exists containing:

```text
HEAD:
branch:
tests:
typecheck:
lint:
known pre-existing failures:
```

Commit:

`test(voice): establish pre-implementation baseline`

---

## Task 1.2 — Build the actual provider map from code

Inspect the real implementation, not only the plans.

**Required files/areas:**

- `src/modules/assistant/core/hooks/useVoiceClient.ts`
- `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`
- `src/modules/assistant/core/hooks/useGeminiLive.ts`
- `src/modules/assistant/core/hooks/useElevenLabsVoice.ts`
- `src/modules/assistant/core/hooks/useElevenLabsConvAI.ts`
- `src/modules/assistant/core/hooks/useSarvamVoice.ts`
- `src/modules/voice-core/providers/*`
- `src/modules/voice-core/api/*`
- `src/modules/voice-core/model-catalog.ts`
- `scripts/voice-relay.mjs`
- `scripts/sarvam-relay.mjs`
- `scripts/start.mjs`
- existing voice/chat/RAG API routes

**Produce:**

```text
provider
  → browser hook
  → relay
  → STT
  → Clara turn path
  → RAG
  → LLM
  → TTS
  → playback
```

For each provider mark:

- working
- partially working
- broken
- not implemented

Commit:

`docs(voice): record executable provider map`

---

# 3. Phase 2 — Fix the shared session foundation first

Do this before optimizing any vendor.

## Task 2.1 — Create one realtime session identity

Introduce or reuse:

```ts
sessionId
generationId
turnId
tenantId
agentId
```

Rules:

- `sessionId` remains stable for one connected browser voice session.
- `generationId` changes for every assistant generation.
- `turnId` identifies one committed user turn.
- Never trust client-supplied tenant/KB identifiers without server authorization.

Add tests for:

- session uniqueness
- generation replacement
- stale-generation rejection
- duplicate turn rejection

Commit:

`feat(voice): establish realtime session and generation identity`

---

## Task 2.2 — Implement a single generation coordinator

Create a small provider-neutral coordinator in the existing voice-core area.

Responsibilities:

```
beginTurn()
invalidateGeneration()
isCurrentGeneration()
registerAbort()
cancelCurrent()
completeGeneration()
```

The coordinator must not own:

- Qdrant implementation
- LLM implementation
- provider credentials
- browser UI

It only controls lifecycle and concurrency.

### Required behavior

When a new turn begins:

1. invalidate old generation;
2. abort old generation where supported;
3. cancel old TTS;
4. clear stale output;
5. create new generation;
6. permit only the new generation to emit assistant output.

Commit:

`fix(voice): centralize realtime generation cancellation`

---

## Task 2.3 — Make browser playback generation-aware

Every queued audio item must carry:

```ts
generationId
```

Before playback:

```
if (!generationCoordinator.isCurrent(generationId)) {
    discard();
}
```

On interrupt:

- clear queued audio;
- stop current source;
- invalidate generation;
- reset speaking state.

Acceptance test:

> Start answer A → interrupt → start answer B → delayed audio from A arrives → A audio is never heard.

Commit:

`fix(voice): discard stale realtime audio`

---

# 4. Phase 3 — Make Clara's RAG path provider-invariant

## Task 3.1 — Extract/confirm one authenticated Clara grounding entry point

Do not rewrite Qdrant.

Find the existing service that ultimately resolves:

```
tenantId
kbId
documentId
ragMode
query
```

and returns grounded context.

Every new provider-controlled turn must call that service.

Acceptance:

- provider cannot select another tenant;
- provider cannot select another KB;
- provider cannot bypass authorization;
- provider cannot create vendor KB state.

Commit:

`refactor(rag): expose authenticated provider-neutral grounding path`

---

## Task 3.2 — Test identical knowledge binding across providers

Use one test tenant with a deliberately unique KB fact.

Run the same question through:

- OpenAI Realtime
- Gemini Live
- Sarvam
- ElevenLabs standard
- ElevenLabs realtime

Assert:

```
tenantId
agentId
kbId
documentId
ragMode
```

remain identical.

Do not assert identical wording; provider model behavior can differ.

Commit:

`test(rag): enforce identical Clara knowledge binding across voice providers`

---

# 5. Phase 4 — Harden OpenAI Realtime first

This is the baseline and must be protected before touching the other realtime implementations.

## Task 4.1 — Regression-lock current OpenAI behavior

Test:

- connect
- microphone input
- transcript
- normal answer
- RAG function call
- grounded response
- interrupt
- reconnect
- disconnect

Do not migrate OpenAI to the new Clara turn coordinator unless a concrete bug requires it.

Commit:

`test(openai-realtime): lock existing realtime behavior`

---

## Task 4.2 — Measure current OpenAI TTFA

Record:

```
user speech end
→ final transcript
→ RAG start
→ RAG end
→ first model output
→ first audio
→ browser playback
```

Store p50/p95 results.

This is the performance baseline for every future provider change.

Commit:

`docs(voice): record openai realtime performance baseline`

---

# 6. Phase 5 — Make Sarvam actually realtime

The existing Sarvam implementation is partially realtime. Complete it without rewriting it.

## Task 5.1 — Correct Saaras realtime configuration

Separate:

```
SARVAM_STT_MODEL
SARVAM_REALTIME_STT_MODEL
```

Use the currently documented realtime model identifier.

Keep standard STT configuration separate from realtime STT.

Validate the exact realtime model identifier against Sarvam's current realtime documentation before implementation; do not infer a model name from standard STT configuration.

Commit:

`fix(sarvam): separate standard and realtime stt configuration`

---

## Task 5.2 — Correct realtime STT wire protocol

Update the relay to match the currently documented Sarvam realtime WebSocket protocol.

Verify:

- endpoint
- authentication
- model
- PCM format
- sample rate
- VAD configuration
- partial transcript events
- final transcript events
- connection close
- reconnect policy

Do not blindly copy parameters from Sarvam's legacy streaming API.

Acceptance:

```
microphone
→ PCM16
→ Saaras realtime
→ partial transcript
→ final transcript
```

Commit:

`fix(sarvam): align realtime stt relay with current websocket protocol`

---

## Task 5.3 — Replace sentence HTTP TTS with persistent Bulbul WebSocket

Current problematic pattern:

```
LLM stream
→ sentence 1 HTTP TTS
→ sentence 2 HTTP TTS
→ sentence 3 HTTP TTS
```

Required realtime pattern:

```
LLM text stream
       ↓
persistent Bulbul WebSocket
       ↓
audio chunks
       ↓
generation-aware playback
```

Use one warm TTS connection per realtime session where practical.

Requirements:

- no sentence-by-sentence REST TTS;
- stream text incrementally;
- flush final text;
- cancel on interruption;
- discard stale audio;
- reconnect only when safe;
- meter usage once.

Commit:

`feat(sarvam): add persistent realtime bulbul tts stream`

---

## Task 5.4 — Convert Sarvam browser capture to AudioWorklet

Reuse:

`public/worklets/audio-recorder-worklet.js`

Remove the realtime path's dependency on `ScriptProcessorNode` where possible.

Acceptance:

- stable PCM frames;
- no duplicate audio;
- no runaway CPU;
- clean stop;
- clean reconnect.

Commit:

`refactor(sarvam): use shared audio worklet for realtime capture`

---

## Task 5.5 — Add Sarvam generation cancellation

Sarvam must obey the same generation contract as every provider.

Test:

1. speak;
2. assistant begins;
3. interrupt;
4. assistant stops;
5. second user turn starts;
6. old Sarvam audio arrives late;
7. old audio is discarded.

Commit:

`fix(sarvam): enforce single active realtime generation`

---

# 7. Phase 6 — Make ElevenLabs realtime actually work

The current ElevenLabs Mode A is not true realtime.

## Task 6.1 — Keep existing ElevenLabs modes intact

Do not delete:

- existing standard ElevenLabs;
- existing Conversational AI path.

Add a separate Clara-controlled realtime path.

The selector must distinguish:

```
standard + elevenlabs
realtime + elevenlabs + conversational
realtime + elevenlabs + clara-stream
```

Commit:

`test(elevenlabs): preserve existing voice modes`

---

## Task 6.2 — Implement Scribe realtime STT

Required pipeline:

```
AudioWorklet
→ Clara relay
→ Scribe realtime
→ partial transcript
→ committed transcript
```

Only committed transcript creates a Clara generation.

Add duplicate-commit protection.

Commit:

`feat(elevenlabs): add realtime scribe stt adapter`

---

## Task 6.3 — Implement ElevenLabs streaming TTS

Required pipeline:

```
Clara LLM text delta
→ sanitizer
→ ElevenLabs stream-input WebSocket
→ audio chunks
→ browser
```

Do not call TTS once per sentence.

Use the current low-latency model configuration unless measured evidence requires changing it.

Commit:

`feat(elevenlabs): add streaming realtime tts adapter`

---

## Task 6.4 — Connect Scribe → Clara → TTS

The complete path must be:

```
Scribe committed
      ↓
generation coordinator
      ↓
Clara authorization
      ↓
Clara RAG/Qdrant
      ↓
selected LLM
      ↓
text deltas
      ↓
ElevenLabs TTS WS
      ↓
audio
      ↓
generation-aware playback
```

No vendor KB is involved.

Commit:

`feat(elevenlabs): connect clara realtime turn pipeline`

---

## Task 6.5 — Fix the multiple-answer bug as a P0

Explicitly test:

- fast repeated user speech;
- duplicate final transcript;
- browser reconnect;
- TTS reconnect;
- interruption during RAG;
- interruption during LLM;
- interruption during TTS;
- delayed old audio;
- delayed old `assistant.done`.

Acceptance:

> At most one assistant generation can be speaking at any instant.

Commit:

`fix(elevenlabs): prevent overlapping realtime generations`

---

# 8. Phase 7 — Provider switching must work without reconfiguration

## Task 7.1 — Server-side provider resolver

For every new voice session:

```
authenticate
→ resolve tenant
→ resolve agent
→ resolve KB
→ resolve RAG policy
→ resolve tools
→ resolve memory
→ resolve requested provider
→ validate capability
→ open vendor connection
```

Never:

```
open vendor connection
→ discover tenant/KB later
```

Reject before vendor connection if configuration is invalid.

Commit:

`feat(voice): resolve tenant context before provider connection`

---

## Task 7.2 — Provider switching matrix

Test:

```
OpenAI → Gemini
OpenAI → Sarvam
OpenAI → ElevenLabs
Gemini → OpenAI
Gemini → Sarvam
Sarvam → ElevenLabs
ElevenLabs → OpenAI
```

For every switch assert:

- same tenant;
- same agent;
- same KB;
- same RAG mode;
- same tools;
- same memory policy.

Only transport/provider changes.

Commit:

`test(voice): verify provider switching invariants`

---

# 9. Phase 8 — Real-time UX correctness

## Task 8.1 — State machine

Use:

```
idle
connecting
listening
thinking
speaking
interrupting
error
idle
```

Rules:

- `speaking` only belongs to current generation;
- interruption immediately exits speaking;
- errors terminate active generation;
- reconnect starts clean generation state.

Commit:

`fix(voice-ui): synchronize realtime lifecycle state`

---

## Task 8.2 — Transcript correctness

UI behavior:

- partial transcript replaces/updates temporary text;
- final transcript commits once;
- duplicate final events are ignored;
- stale final events are ignored;
- assistant text belongs to generation;
- interrupted assistant text is not later appended by stale callbacks.

Commit:

`fix(voice-ui): make realtime transcript handling idempotent`

---

# 10. Phase 9 — Failure recovery

Every provider must have explicit behavior for:

- authentication failure;
- quota/rate-limit failure;
- upstream WebSocket close;
- browser disconnect;
- network timeout;
- TTS failure;
- STT failure;
- LLM failure;
- RAG failure;
- interruption;
- reconnect.

Do not implement infinite reconnect loops.

Recovery must return the UI to a deterministic state.

Example:

```
upstream failure
→ invalidate generation
→ close provider sockets
→ clear playback
→ emit recoverable error
→ session returns to idle
```

Commit:

`fix(voice): make realtime provider failures recoverable`

---

# 11. Phase 10 — Observability that explains latency

Instrument:

```
session.start
stt.first_partial
stt.final
turn.start
rag.start
rag.end
llm.start
llm.first_token
tts.start
tts.first_audio
browser.first_audio
interrupt
turn.complete
provider.error
session.end
```

Every event includes:

```
sessionId
generationId
provider
model
tenant-safe identifier
timestamp
```

Do not log secrets.

Do not log full private transcripts unless existing privacy policy explicitly permits it.

Calculate:

```
TTFA =
browser.first_audio - stt.final
```

and stage latency:

```
STT
RAG
LLM
TTS
network/playback
```

Commit:

`feat(voice): add end-to-end realtime latency telemetry`

---

# 12. Phase 11 — Real device validation

Use the same device/network conditions for comparison.

## Test A — OpenAI baseline

Measure:

- 10 short questions;
- 10 KB questions;
- 10 longer answers.

Record p50/p95 TTFA.

## Test B — Sarvam

Same questions, same KB, same agent.

## Test C — ElevenLabs Clara Realtime

Same questions, same KB, same agent.

## Test D — interruption

Interrupt at:

- STT;
- RAG;
- LLM;
- TTS.

## Test E — code switching

Test:

- English;
- Tamil;
- Tamil + English;
- English technical terminology.

Do not claim a provider is faster/slower based on one request.

Commit:

`test(voice): record real-device realtime benchmark matrix`

---

# 13. Phase 12 — Security validation

Before production enablement verify:

- vendor API keys never reach browser;
- browser session token cannot select another tenant;
- browser cannot select arbitrary KB;
- browser cannot bypass agent authorization;
- provider cannot request another tenant's document;
- replayed session token is rejected/expired;
- WebSocket closes on session expiration;
- rate limits apply before expensive vendor operations;
- tool permissions are server-side;
- vendor errors do not expose secrets.

Commit:

`test(voice): validate realtime authorization boundaries`

---

# 14. Phase 13 — Production rollout

Feature flags:

```
SARVAM_REALTIME_ENABLED=false
ELEVENLABS_REALTIME_ENABLED=false
```

Rollout:

1. local development;
2. internal/admin tenant;
3. one controlled tenant;
4. small allowlist;
5. broader rollout;
6. general availability.

Rollback must be configuration-only.

No KB migration is allowed as part of voice-provider rollout.

---

# 15. Definition of Done

The implementation is complete only when all are true.

## OpenAI

- [ ] Existing OpenAI Realtime still works.
- [ ] Existing RAG tool bridge works.
- [ ] No measurable regression from baseline without documented reason.

## Gemini

- [ ] Gemini Live still works.
- [ ] Existing Clara RAG behavior remains intact.

## Sarvam

- [ ] Saaras realtime STT works.
- [ ] Partial transcripts work.
- [ ] Final transcripts create exactly one turn.
- [ ] Bulbul WebSocket TTS streams audio.
- [ ] Browser uses AudioWorklet.
- [ ] Interrupt cancels current generation.
- [ ] No stale audio.

## ElevenLabs

- [ ] Standard Mode A still works.
- [ ] Conversational Mode B still works.
- [ ] Clara Realtime mode works.
- [ ] Scribe realtime STT works.
- [ ] ElevenLabs TTS WebSocket works.
- [ ] Text streams into TTS.
- [ ] No sentence-by-sentence HTTP TTS in realtime.
- [ ] Multiple simultaneous answers are impossible.

## Clara knowledge

- [ ] Same tenant-bound KB is used by every provider.
- [ ] Qdrant remains Clara-owned.
- [ ] RAG mode remains Clara-owned.
- [ ] Provider switching cannot change KB.
- [ ] Vendor KB is never required.

## Concurrency

- [ ] One active generation per session.
- [ ] Interrupt invalidates generation immediately.
- [ ] Late events are ignored.
- [ ] Late audio is discarded.
- [ ] Reconnect cannot replay old audio.

## Operations

- [ ] Metering is correct.
- [ ] Rate limits work.
- [ ] Provider errors recover cleanly.
- [ ] TTFA is measurable.
- [ ] p50/p95 benchmark recorded.
- [ ] Security tests pass.
- [ ] `npm test` passes.
- [ ] `npm run type-check` passes.
- [ ] `npm run lint` passes.

---

# 16. Execution order

Do **not** implement all providers simultaneously.

Recommended order:

```
1. baseline
   ↓
2. generation/session coordinator
   ↓
3. Clara RAG boundary
   ↓
4. OpenAI regression lock
   ↓
5. Sarvam realtime completion
   ↓
6. ElevenLabs realtime completion
   ↓
7. provider switching
   ↓
8. UX/state correctness
   ↓
9. failure recovery
   ↓
10. telemetry
   ↓
11. real-device benchmarks
   ↓
12. security
   ↓
13. staged rollout
```

This order deliberately fixes the shared correctness problem before optimizing individual providers.

---

# 17. Superpowers execution protocol

Use:

`superpowers:subagent-driven-development`

for implementation.

For each task:

1. record BASE commit;
2. generate the task brief;
3. dispatch one fresh implementer;
4. implement with RED → GREEN → REFACTOR;
5. run focused verification;
6. commit the task;
7. generate review package;
8. run spec-compliance review;
9. run code-quality review;
10. fix review findings;
11. continue to next task.

Do not dispatch multiple implementation agents simultaneously for the same worktree.

At the end:

1. run complete test suite;
2. run typecheck;
3. run lint;
4. run final provider matrix;
5. run final security checks;
6. run `superpowers:verification-before-completion`;
7. run final code review;
8. use `superpowers:finishing-a-development-branch`.

The Superpowers guidance specifically recommends fresh subagents per task with review gates and a broad final review, rather than treating a large implementation plan as one uncontrolled coding pass. citeturn0search0turn0search5

---

# Final architecture after implementation

```
                         CLARA VOICE SESSION
                                │
                         Auth + Tenant Guard
                                │
                     Agent / KB / RAG Resolver
                                │
                    Generation Coordinator
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
          OpenAI              Gemini             Sarvam
        Realtime              Live             Realtime
             │                  │                  │
             └──────────────────┼──────────────────┘
                                │
                     Existing provider-native
                       execution preserved
                                │
                                │
                         ElevenLabs Clara
                            Realtime
                                │
                    Scribe → Clara Turn
                                │
                         ┌──────┴──────┐
                         │             │
                       Qdrant        Tools
                         │             │
                         └──────┬──────┘
                                │
                         Selected Clara LLM
                                │
                         streamed text
                                │
                    Provider streaming TTS
                                │
                         generation guard
                                │
                           Browser audio
```

**Core rule:**

```
Provider = how Clara talks
Clara KB = what Clara knows
Clara authorization = who may know it
Generation coordinator = which answer is allowed to speak
```

That separation is what makes the implementation practical, testable, and safe to extend without sacrificing the current fast OpenAI behavior.
