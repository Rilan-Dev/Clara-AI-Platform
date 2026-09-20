# Clara Voice Platform — Pending Gap Closure & Production Verification Plan

> **Purpose:** Close only the remaining implementation and verification gaps found after the previous production implementation plan. This is a gap-closure plan, not a new voice architecture.
>
> **Branch:** `Vite-Converted`
>
> **Source state reviewed:** current branch implementation and the executable provider map / baseline reports.
>
> **Execution:** REQUIRED to use `superpowers:subagent-driven-development`, `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, and `superpowers:requesting-code-review` where appropriate.

---

## 0. Current status

The previous implementation plan is substantially implemented. The remaining work is concentrated in:

1. Sarvam browser capture migration/verification.
2. Provider-neutral generation semantics where they materially improve correctness, without rewriting native OpenAI/Gemini realtime lifecycles.
3. Gemini credential/session security.
4. ElevenLabs Clara Realtime real-browser/device validation.
5. Sarvam Realtime real-browser/device validation.
6. Actual OpenAI TTFA baseline measurements.
7. Cross-provider benchmark measurements and interruption matrix.
8. End-to-end provider switching verification.
9. Final security, failure-recovery, and rollout verification.
10. Final Superpowers review and production sign-off.

### Important interpretation

The existing provider map correctly shows:

- OpenAI Realtime: working and must remain the regression baseline.
- Gemini Live: working, but its session URL currently exposes a long-lived API key.
- ElevenLabs Mode A: legacy/compatibility pipeline remains working.
- ElevenLabs Clara Realtime: implemented, but needs real-device proof.
- ElevenLabs Mode B: vendor Conversational AI path remains a separate compatibility mode; it is not the Clara-owned realtime brain path.
- Sarvam Realtime: realtime STT/TTS are implemented, but browser capture and end-to-end validation still need closure.

Do **not** force OpenAI or Gemini into an artificial common transport. The common contract is lifecycle, tenant binding, grounding, cancellation, observability, and correctness—not identical vendor protocols.

---

# 1. Non-negotiable acceptance invariants

All work in this plan must preserve:

## 1.1 Clara owns knowledge

`tenant → agent → kbId/documentId/ragMode → Clara RAG → Qdrant → grounded context`

No vendor KB or vendor memory may silently replace Clara's tenant-bound knowledge.

## 1.2 Provider switching changes transport, not tenant state

Switching:

`OpenAI ↔ Gemini ↔ Sarvam ↔ ElevenLabs`

must preserve:

- tenant
- agent
- KB
- document binding
- RAG mode
- tools
- memory/business configuration
- authorization

## 1.3 Exactly one active assistant generation

For realtime Clara-owned pipelines:

`generation N → interrupt/new turn → invalidate N → generation N+1`

Late events/audio from N must never:

- play audio
- overwrite current transcript/state
- complete generation N+1
- change speaking state for N+1

## 1.4 One committed transcript = one assistant generation

Partial STT is UI/caption state only.

Only a final/committed transcript may start the Clara assistant turn.

## 1.5 OpenAI regression baseline remains unchanged

No refactor may introduce measurable regression to the existing OpenAI Realtime path merely for architectural symmetry.

---

# 2. Phase A — Freeze and re-verify the current starting point

## Task A1 — Record exact starting commit and repository state

Inspect:

- branch
- HEAD
- working tree
- latest voice commits
- existing reports
- current test/typecheck/lint commands

Record:

```
branch:
HEAD:
working tree:
tests:
typecheck:
lint:
known baseline failures:
```

Acceptance:

- Current branch is confirmed.
- No unrelated working-tree changes are overwritten.
- Baseline failures are separated from new failures.

---

## Task A2 — Reconcile the implementation map against code

Re-check these paths:

- `useVoiceClient.ts`
- `useOpenAIRealtime.ts`
- `useGeminiLive.ts`
- `useElevenLabsVoice.ts`
- `useElevenLabsClaraStream.ts`
- `useElevenLabsConvAI.ts`
- `useSarvamVoice.ts`
- `generation-coordinator.ts`
- `generation-playback.ts`
- Sarvam relays
- ElevenLabs relay
- Gemini session route
- RAG/grounding routes
- latency tracker
- security tests
- benchmark harness

Acceptance:

Create/update a gap matrix with:

```
gap
code location
current behavior
required behavior
test/evidence
status
```

---

# 3. Phase B — Finish Sarvam browser audio capture

## Task B1 — Make AudioWorklet the primary Sarvam capture path

Current gap:

`useSarvamVoice.ts` still has a `ScriptProcessorNode` capture path even though the shared:

`public/worklets/audio-recorder-worklet.js`

and `connectWorkletPcm16Capture` infrastructure exist.

Required behavior:

```
Microphone
  ↓
AudioWorklet
  ↓
PCM16
  ↓
16 kHz normalization
  ↓
Sarvam realtime relay
```

Rules:

- AudioWorklet is the default/primary path.
- Reuse the existing shared worklet.
- Keep a narrowly-scoped fallback only if browser capability requires it.
- Fallback must be observable.
- Do not create a second PCM conversion implementation.
- Preserve mono PCM16 and the configured 16 kHz realtime contract.

Tests:

- worklet connection
- PCM16 frame shape
- sample-rate conversion/normalization
- cleanup on disconnect
- fallback selection
- no duplicate capture stream

Acceptance:

No Sarvam realtime production path silently uses ScriptProcessorNode when AudioWorklet is available.

---

## Task B2 — Validate capture under actual browser lifecycle events

Test:

- connect
- disconnect
- mute/pause
- resume
- reconnect
- browser tab visibility change
- microphone permission rejection
- rapid provider switch

Acceptance:

No leaked AudioNode, MediaStream track, worklet port, or duplicate microphone sender remains after reconnect/switch.

---

# 4. Phase C — Close generation semantics without breaking native providers

## Task C1 — Define provider-neutral lifecycle boundary

The coordinator remains responsible only for:

```
sessionId
turnId
generationId
begin
invalidate
isCurrent
abort
complete
```

Do not rewrite native OpenAI/Gemini turn handling solely to make internal implementation identical.

---

## Task C2 — Attach Clara generation identity to Clara-owned realtime pipelines

Required for:

- ElevenLabs Clara Realtime
- Sarvam Realtime
- future provider-neutral realtime paths

At minimum, propagate:

```
sessionId
turnId
generationId
```

through:

```
STT final
→ Clara turn
→ RAG
→ LLM stream
→ TTS
→ playback
```

Where the existing OpenAI/Gemini native session lifecycle already guarantees correct cancellation, retain native lifecycle and add telemetry/correlation rather than introducing unnecessary duplicate state.

Acceptance:

A delayed event can be proven stale using the same session/generation contract in every Clara-owned pipeline.

---

## Task C3 — Verify exactly-once final transcript handling

Add/strengthen tests for:

- duplicate final event
- final event after interrupt
- partial followed by final
- duplicate final with same vendor event id
- final from previous generation
- final during reconnect
- empty/whitespace final transcript

Acceptance:

`one committed turn → one assistant generation`

under all tested event orderings.

---

# 5. Phase D — Fix Gemini credential/session security

## Task D1 — Remove long-lived Gemini API key from browser WebSocket URL

Current gap:

The provider map reports that Gemini Live receives a `wsUrl` containing a long-lived API key.

Required target:

```
Browser
  ↓
same-origin authenticated session endpoint
  ↓
server-side credential handling / short-lived authorization
  ↓
Google Gemini Live
```

The browser must not receive:

- `GEMINI_API_KEY`
- a long-lived Google API credential
- a reusable vendor secret embedded in a URL

Preferred implementation:

- keep provider credentials server-side;
- use a server relay/proxy or supported short-lived/session credential mechanism;
- preserve existing Gemini native Live protocol and audio behavior.

Do not expose credentials merely by base64 encoding or hiding them in another field.

---

## Task D2 — Add regression tests

Tests must prove:

- session payload contains no Gemini API key;
- generated browser URL contains no long-lived secret;
- unauthorized tenant cannot mint a Gemini session;
- rate/plan guards execute before vendor credential use;
- provider switching cannot reuse another tenant's Gemini session.

Acceptance:

Security test fails if any long-lived Gemini vendor credential appears in a browser-facing session response.

---

# 6. Phase E — Finish ElevenLabs Clara Realtime validation

## Task E0 — Replace the realtime ElevenLabs transport with Speech Engine

Implementation update:

The realtime ElevenLabs path now has a dedicated Speech Engine mode. This is intentionally separate from the legacy Mode A batch pipeline and the previous Clara Stream/Scribe + TTS relay.

Target runtime:

```
Browser WebRTC
  ↓
ElevenLabs Speech Engine
  ├─ realtime STT
  ├─ VAD / turn taking
  ├─ interruption
  └─ realtime TTS
       ↓
Clara Speech Engine WebSocket
       ↓
/api/embed/chat
       ↓
Clara KB/RAG + configured brain
```

Implemented code:

- `scripts/elevenlabs-speech-engine.mjs`
- `src/app/api/voice/elevenlabs/speech-engine/session/route.ts`
- `src/modules/assistant/core/hooks/useElevenLabsSpeechEngine.ts`
- `useVoiceClient.ts` routing for `mode: "speech-engine"`
- `/api/embed/session` Speech Engine negotiation
- custom-server Speech Engine attachment in `scripts/start.mjs`
- server-only ElevenLabs SDK dependencies
- `.env.example` Speech Engine configuration

Security:

- browser receives only a short-lived ElevenLabs conversation token;
- ElevenLabs API key remains server-side;
- Speech Engine upstream connections retain SDK JWT verification;
- Clara tenant/KB authorization is stored server-side against the ElevenLabs conversation ID;
- no vendor API key is placed in the browser session payload.

Important:

Task E0 is implementation-complete only. Real browser/device validation, latency measurements, and production rollout remain pending until the deployed environment has `ELEVENLABS_SPEECH_ENGINE_ID` and the public Speech Engine WebSocket URL configured in the ElevenLabs resource.

---

## Task E1 — Verify the complete production pipeline

Required path:

```
Scribe Realtime STT
  ↓
committed transcript
  ↓
generation coordinator
  ↓
Clara /api/chat
  ↓
Clara RAG/Qdrant
  ↓
streaming LLM
  ↓
ElevenLabs streaming TTS
  ↓
generation-aware playback
```

Verify:

- no sentence-by-sentence REST TTS in Clara Realtime;
- one generation per committed turn;
- generation IDs reach TTS/playback;
- stale audio is discarded;
- LLM/TTS abort works;
- barge-in invalidates the old generation;
- no overlapping answers.

---

## Task E2 — Real browser/device test

Use the benchmark harness and a real browser/device.

Test:

1. greeting
2. short answer
3. KB answer
4. long answer
5. rapid second question
6. interrupt during STT
7. interrupt during RAG
8. interrupt during LLM
9. interrupt during TTS
10. reconnect after provider disconnect
11. mute/pause/resume
12. provider switch after disconnect

Acceptance:

- no overlapping assistant voices;
- no stale answer resumes;
- no duplicated answer;
- no stuck speaking indicator;
- no stuck microphone state;
- final transcript matches the generated turn.

---

# 7. Phase F — Finish Sarvam Realtime validation

## Task F1 — Verify complete Sarvam pipeline

Required path:

```
AudioWorklet PCM16 16 kHz
  ↓
Saaras Realtime
  ↓
partial/final transcript
  ↓
Clara generation coordinator
  ↓
Clara /api/chat + RAG
  ↓
streaming LLM
  ↓
Bulbul persistent WS
  ↓
generation-aware playback
```

Verify:

- `vad_speech_start` triggers early interruption;
- partial transcript never creates an assistant turn;
- final transcript creates exactly one turn;
- `session.end.audio_duration_s` is used for authoritative metering;
- TTS generation IDs are preserved;
- interrupt closes/cancels old TTS generation;
- delayed old audio cannot play;
- reconnect does not create duplicate TTS streams.

---

## Task F2 — Real browser/device test

Repeat the same Test A–E matrix used for OpenAI and ElevenLabs.

Include:

- English
- Tamil
- mixed English/Tamil
- KB question
- long response
- rapid turn-taking
- interruption during every stage
- reconnect
- mute/resume

Acceptance:

No P0 correctness issue and no generation overlap.

---

# 8. Phase G — Capture actual latency baselines

The existing latency instrumentation is considered implemented. The missing item is actual measurement.

## Task G1 — Run OpenAI baseline first

Use:

- same device
- same browser
- same network
- same KB
- same agent
- same question set

Run:

- 10 short questions
- 10 KB questions
- 10 long-answer questions

Record:

- TTFA p50/p95
- STT p50/p95
- RAG p50/p95
- LLM first-token p50/p95
- TTS first-audio p50/p95
- playback delay p50/p95

Acceptance:

Replace `to record` placeholders in:

`docs/superpowers/reports/2026-09-20-openai-realtime-ttfa-baseline.md`

with measured values and test metadata.

---

## Task G2 — Run Sarvam and ElevenLabs using the identical protocol

Do not compare single requests.

For each provider record:

```
provider
model
device
browser
network
KB
agent
question class
sample count
p50
p95
failure count
interrupt success count
```

The goal is reproducible engineering evidence, not a provider ranking.

---

# 9. Phase H — Full interruption/cancellation matrix

Create a deterministic test matrix:

| Stage | Interrupt source | Required result |
|---|---|---|
| STT | user starts speaking | current generation invalidated |
| RAG | new speech | RAG/LLM work cancelled where supported |
| LLM | barge-in | no old tokens produce audio |
| TTS | barge-in | queued/current audio stopped |
| Playback | barge-in | no stale audio remains |
| Reconnect | provider failure | old generation cannot resume |
| Rapid turn | second final | first generation cannot speak after invalidation |

Run for:

- OpenAI
- Sarvam
- ElevenLabs Clara Realtime
- Gemini where applicable

Acceptance:

Every Clara-owned realtime pipeline satisfies the stale-generation acceptance scenario.

---

# 10. Phase I — Provider switching verification

## Task I1 — Run full switching matrix

Verify:

```
OpenAI → Gemini
Gemini → Sarvam
Sarvam → ElevenLabs
ElevenLabs → OpenAI
```

Also reverse directions where practical.

For every switch assert:

- same tenant
- same agent
- same KB
- same document binding
- same RAG mode
- same authorization
- old provider session terminated
- old microphone capture terminated
- old audio queue cleared
- no old generation can speak
- new provider receives only new session credentials

---

## Task I2 — Switch while actively speaking

Scenarios:

- switch during STT
- switch during RAG
- switch during LLM
- switch during TTS
- switch during playback
- switch after provider error

Acceptance:

Switch never results in two active speakers, leaked credentials, or stale assistant output.

---

# 11. Phase J — Failure recovery and observability verification

## Task J1 — Verify bounded reconnect behavior

Test:

- upstream WebSocket close
- timeout
- rate limit
- authentication failure
- invalid configuration
- browser disconnect
- server restart
- network loss/recovery

Acceptance:

- transient failures retry within configured bounds;
- fatal errors stop cleanly;
- no infinite reconnect loop;
- no duplicate TTS connection;
- no duplicate assistant generation.

---

## Task J2 — Verify telemetry completeness

For Clara-owned realtime sessions, verify:

```
session.start
stt.final
rag.start
rag.end
llm.start
llm.first_token
tts.start
tts.first_audio
browser.first_audio
turn.complete
interrupt
provider.error
reconnect
```

Telemetry must contain correlation IDs but no:

- transcripts
- API keys
- authorization headers
- vendor secrets
- sensitive KB content

---

# 12. Phase K — Security and tenant-isolation final pass

## Task K1 — Browser secret audit

Search all browser-facing voice/session payloads for:

- OpenAI long-lived keys
- Gemini long-lived keys
- ElevenLabs API keys
- Sarvam API keys
- HMAC signing secrets
- webhook secrets

Acceptance:

Only explicitly designed short-lived/browser-safe credentials may cross the browser boundary.

---

## Task K2 — Tenant binding audit

For every provider:

```
authenticated user/embed key
→ tenant
→ agent
→ KB
→ provider session
```

Verify a credential/session for tenant A cannot be reused against tenant B.

Include replay/expiry tests for signed realtime session tokens.

---

# 13. Phase L — Mode-B compatibility decision and verification

ElevenLabs Conversational AI Mode B is intentionally different:

```
Browser
→ ElevenLabs Conversational AI
→ signed Clara RAG webhook
```

Do not silently describe this as Clara-owned LLM realtime.

Verify only the promises this mode actually makes:

- correct org/agent binding
- HMAC webhook verification
- tenant/KB binding
- no cross-tenant retrieval
- clean vendor interruption behavior
- conversation/session correlation where useful

If Mode B is retained, document it explicitly as a vendor-brain compatibility mode.

If it is not part of the production rollout, keep it dark and state that clearly in the rollout runbook.

---

# 14. Phase M — Production rollout gate

Before enabling any new realtime provider beyond controlled testing, all of these must be true:

### Correctness

- [ ] one committed turn = one response
- [ ] no overlapping answers
- [ ] stale audio discarded
- [ ] barge-in works
- [ ] reconnect is bounded
- [ ] mute/resume is clean

### Security

- [ ] no long-lived vendor secrets in browser payloads
- [ ] tenant binding verified
- [ ] session replay rejected
- [ ] rate limits occur before vendor credential minting

### RAG

- [ ] same Clara KB/Qdrant path
- [ ] same tenant/agent binding
- [ ] same RAG policy
- [ ] no vendor KB substitution

### Performance

- [ ] OpenAI baseline recorded
- [ ] Sarvam measurements recorded
- [ ] ElevenLabs measurements recorded
- [ ] interruption measurements recorded
- [ ] device/network conditions recorded

### Operations

- [ ] telemetry visible
- [ ] provider errors classified
- [ ] rollback flag verified
- [ ] reconnect bounds verified
- [ ] real-device evidence stored

---

# 15. Required artifacts

Update/create only these artifacts unless implementation requires a code-specific test:

1. `docs/superpowers/reports/2026-09-21-voice-gap-closure.md`
   - final gap matrix
   - test evidence
   - measured benchmark summary
   - remaining known limitations

2. `docs/superpowers/reports/2026-09-20-openai-realtime-ttfa-baseline.md`
   - replace placeholders with actual measurements

3. `docs/superpowers/reports/2026-09-20-voice-provider-map.md`
   - update statuses only where code/evidence changed

4. Existing rollout runbook
   - update gates after verification

Do not create another architecture document unless a genuine architecture blocker is discovered.

---

# 16. Recommended execution order

Execute in this order:

```
A  Freeze baseline
↓
B  Sarvam AudioWorklet + lifecycle
↓
C  Generation semantics / exactly-once validation
↓
D  Gemini credential security
↓
E  ElevenLabs real-device validation
↓
F  Sarvam real-device validation
↓
G  OpenAI baseline measurements
↓
H  Cross-provider interruption matrix
↓
I  Provider switching matrix
↓
J  Failure recovery + telemetry verification
↓
K  Final security/tenant audit
↓
L  Mode-B compatibility verification
↓
M  Final rollout gate
```

The OpenAI baseline should be measured before interpreting Sarvam/ElevenLabs latency results.

---

# 17. Superpowers implementation protocol

For every implementation task:

1. Read the relevant existing code before editing.
2. Use `superpowers:test-driven-development` for behavior changes.
3. Use `superpowers:systematic-debugging` when a test or device run fails.
4. Keep diffs small and provider-scoped.
5. Do not refactor unrelated code.
6. Run focused tests first.
7. Run the broader suite after the task.
8. Use `superpowers:requesting-code-review` after each meaningful implementation group.
9. Use `superpowers:verification-before-completion` before marking any task complete.
10. Perform a final whole-branch review before rollout.

Each task must produce:

```
implementation
→ focused test
→ broader verification
→ review
→ commit
```

---

# 18. Definition of Done

This gap-closure plan is complete only when:

- Sarvam realtime uses AudioWorklet as the primary capture path.
- Sarvam realtime passes real browser/device validation.
- ElevenLabs Clara Realtime passes real browser/device validation.
- OpenAI TTFA baseline contains actual measured p50/p95 values.
- Sarvam and ElevenLabs measurements use the same benchmark protocol.
- Interruption is proven at STT/RAG/LLM/TTS/playback stages.
- Provider switching is proven without tenant-state drift.
- Gemini no longer exposes a long-lived API key to the browser.
- Clara-owned realtime paths enforce exactly one active generation.
- Delayed stale audio is demonstrably discarded.
- Failure recovery is bounded and tested.
- Telemetry is complete and secret-safe.
- Tenant isolation and session replay protections pass.
- Rollout gates are verified.
- Final verification report contains evidence for every acceptance item.

**Final production decision must be based on the recorded evidence, not assumptions from the implementation plan.**
