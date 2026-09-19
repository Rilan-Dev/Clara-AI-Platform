# Clara Voice Architecture — STT/TTS Chat + Realtime Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one provider-neutral Clara voice architecture with two explicit interaction modes: reliable non-realtime voice chat (record → STT → Clara chat/RAG/tools → TTS) and realtime agent voice (Scribe v2 Realtime STT → Clara agent brain → streaming ElevenLabs TTS), while keeping Clara's knowledge base, retrieval, tools, memory, policies, and LLM orchestration authoritative.

**Architecture:** The browser talks only to Clara. Clara owns session/auth/tenant boundaries, agent configuration, conversation state, KB selection, Qdrant retrieval, tool execution, memory, metering, and LLM orchestration. ElevenLabs supplies speech capabilities only: Scribe v2 Realtime is the realtime speech-input layer and ElevenLabs streaming TTS is the realtime speech-output layer. The existing non-realtime STT/TTS path remains supported as a separate compatibility mode rather than being replaced by realtime infrastructure.

**Tech Stack:** Next.js 15, React 18, TypeScript, WebSocket/`ws`, AudioWorklet PCM16, ElevenLabs Scribe v2 Realtime, ElevenLabs streaming TTS, existing Clara LLM/provider abstraction, existing RAG/Qdrant pipeline, existing voice relay, Vitest, ESLint, TypeScript.

**Spec:** Existing voice design baseline: `Doc/19-09-2026/ELEVENLABS_REALTIME_STREAMING_PLAN.md`; this plan supersedes its V7 scope where the new two-mode contract below is more explicit.

## Global Constraints

- Clara remains the source of truth for KBs, documents, retrieval, agent instructions, tools, memory, tenant authorization, plan/rate limits, and LLM selection.
- ElevenLabs must never become the authoritative knowledge base or agent brain for this architecture.
- Browser clients must not receive ElevenLabs API keys or Clara server credentials.
- Non-realtime voice remains available and must not depend on a persistent realtime WebSocket.
- Realtime agent mode uses `scribe_v2_realtime` for speech input and a streaming ElevenLabs TTS transport for speech output.
- Both modes use the same Clara conversation/agent core so RAG and tools behave consistently.
- RAG/tool execution is server-side and tenant-bound; browser events are informational only.
- Realtime interruption must stop browser playback immediately and cancel/close the active upstream generation path.
- Existing OpenAI Realtime, Gemini Live, Sarvam, and ElevenLabs Agents integrations remain provider options; this work must not silently remove them.
- Prefer additive interfaces and small diffs over broad provider rewrites.
- Every task follows RED → GREEN → REFACTOR and ends with a verification checkpoint and focused commit.
- Do not introduce a new database abstraction when the current agent/KB configuration and voice configuration can carry the required mode/provider fields.

## Review Focus

- A realtime transcript must enter the exact same Clara agent/RAG/tool pipeline as typed chat, not a second hidden brain.
- A KB must never be searched outside the authenticated tenant/agent binding.
- A Scribe partial transcript must not accidentally trigger a full assistant turn; only committed turns do.
- Speaking while the assistant is talking must interrupt playback and generation without leaving stale audio queued.
- Non-realtime voice must continue working if realtime providers are disabled or unavailable.
- A failed ElevenLabs stream must produce a recoverable Clara error state rather than a hung voice session.
- Usage/metering must count actual speech/audio/text work for each mode without double charging a single turn.
- Multilingual/code-switched input must not be forced to English when Scribe can auto-detect.

---

## 1. Target Architecture

### 1.1 Product-level modes

| Mode | Speech input | Clara brain | Speech output | Transport | Primary use |
|---|---|---|---|---|---|
| **Voice Chat / Standard** | Existing STT HTTP or provider STT | Clara chat + RAG + tools + memory | Existing ElevenLabs/Sarvam/OpenAI TTS | HTTP/SSE | Compatibility, low complexity, non-live interactions |
| **Realtime Agent** | **ElevenLabs Scribe v2 Realtime** | **Clara Agent Core** + RAG + tools + memory + selected LLM | **ElevenLabs streaming TTS** | Clara WebSocket relay | Live conversations, barge-in, partial transcript |
| OpenAI Realtime | OpenAI Realtime | Clara RAG/tool bridge where supported | OpenAI realtime audio | Existing relay | Existing provider |
| Gemini Live | Gemini Live | Clara RAG/tool bridge | Gemini audio | Existing relay | Existing provider |
| Sarvam Realtime | Sarvam realtime | Clara Agent Core | Sarvam voice | Existing adapter | Future multilingual/provider path |

The new architecture must make **Realtime Agent** a mode of Clara's voice system, not a replacement for standard voice chat.

### 1.2 End-to-end realtime flow

```
┌──────────────────────────── Browser ────────────────────────────┐
│                                                                  │
│ Mic → AudioWorklet → PCM16 16 kHz                                │
│       ↓                                                          │
│ Realtime Voice Client                                             │
│       ↕ Clara WebSocket                                           │
└───────┬──────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────── Clara Voice Gateway ───────────────────────┐
│ Auth / tenant / plan / session                                   │
│ Voice mode + provider resolution                                 │
│ Realtime event protocol                                           │
│ Session lifecycle / interruption / metering                       │
└───────────────┬──────────────────────────┬───────────────────────┘
                │                          │
        speech input                   assistant output
                │                          ▲
                ▼                          │
┌────────────────────────┐       ┌─────────┴───────────────────────┐
│ ElevenLabs Scribe v2   │       │ ElevenLabs Streaming TTS        │
│ Realtime                │       │ Flash / PCM16                   │
│ partial transcript      │       │ text chunks → audio chunks     │
│ VAD                     │       │ flush at turn end               │
│ committed transcript    │       │ interrupt/cancel                │
└───────────┬────────────┘       └─────────▲───────────────────────┘
            │                              │
            ▼                              │
┌──────────────────── Clara Agent Core ────────────────────────────┐
│ Conversation state                                               │
│ Agent instructions                                               │
│ Clara KB resolver → Qdrant retrieval                             │
│ Tool/MCP execution                                                │
│ Memory / history                                                  │
│ LLM provider abstraction                                          │
│ Streaming assistant text                                         │
└───────────────────────────────────────────────────────────────────┘
```

### 1.3 Non-realtime flow

```
Browser
  │ recorded audio
  ▼
Clara / voice/transcribe
  │ final transcript
  ▼
Clara Conversation/Agent Core
  ├─ tenant + agent binding
  ├─ KB retrieval / Qdrant
  ├─ tools
  ├─ memory
  └─ selected LLM
  │ response text
  ▼
Clara / voice/tts
  │
  ▼
Browser audio
```

The standard mode remains deliberately simple. It must not require Scribe WebSocket setup, a persistent realtime relay, or realtime session state.

---

# Phase 0 — Architecture Contract and Inventory

### Task 0.1: Freeze the two-mode contract

**Files:**
- Create: `docs/superpowers/specs/2026-09-20-clara-voice-modes.md`
- Reference: `Doc/19-09-2026/ELEVENLABS_REALTIME_STREAMING_PLAN.md`

**Steps:**
- [ ] Write the mode contract: `standard` vs `realtime-agent`.
- [ ] Define provider roles as `stt`, `brain`, and `tts`, independently.
- [ ] Define that Clara Agent Core owns every knowledge/tool decision.
- [ ] Define allowed realtime events and lifecycle states.
- [ ] Document explicit non-goals: no ElevenLabs hosted KB migration and no vendor LLM becoming authoritative.

**Verification:** Review the contract against existing OpenAI/Gemini/Sarvam paths and confirm it does not require breaking changes.

**Commit:** `docs(voice): define standard and realtime agent architecture`

### Task 0.2: Inventory existing voice seams

**Files to inspect:**
- `scripts/voice-relay.mjs`
- `scripts/start.mjs`
- `scripts/dev-relay.mjs`
- `voice-core/*`
- Existing ElevenLabs provider/client files
- Existing `useVoiceClient` and AudioWorklet
- Existing `/api/embed/voice-init`, chat, STT, and TTS routes

**Steps:**
- [ ] Map current standard STT → chat → TTS flow.
- [ ] Map current OpenAI/Gemini relay lifecycle.
- [ ] Identify the exact Clara function used for agent/RAG turns.
- [ ] Identify current session authorization and metering hooks.
- [ ] Record reusable files; do not duplicate their logic.

**Verification:** Produce a short file map in the spec.

**Commit:** `docs(voice): map existing voice integration seams`

---

# Phase 1 — Provider-Neutral Voice Session Contract

### Task 1.1: Add shared voice mode/event types

**Files:**
- Create/modify: existing voice-core/provider type location
- Test: corresponding voice-core unit tests

**Steps:**
- [ ] Define `VoiceMode = standard | realtime-agent`.
- [ ] Define `RealtimeVoiceSessionConfig` with tenant/agent/session identifiers resolved server-side.
- [ ] Define browser → Clara events: `session.start`, `audio`, `text`, `interrupt`, `session.stop`, `ping`.
- [ ] Define Clara → browser events: `session.ready`, `transcript.partial`, `transcript.final`, `assistant.text.delta`, `assistant.text.done`, `tool.start`, `tool.result`, `audio`, `assistant.done`, `interrupted`, `error`, `pong`.
- [ ] Keep binary audio frames separate from JSON control events.

**Verification:** Type-check and unit-test event validation.

**Commit:** `feat(voice): add provider-neutral realtime session contract`

### Task 1.2: Define the agent turn boundary

**Steps:**
- [ ] Treat Scribe partials as UI/transcript state only.
- [ ] Start Clara reasoning only from a committed transcript.
- [ ] Pass the committed transcript through the same conversation/agent core used by text chat.
- [ ] Return streamed assistant text independently of audio transport.
- [ ] Emit tool lifecycle events without exposing internal credentials or raw tool secrets.

**Verification:** Unit test partial → no turn; committed → exactly one turn.

**Commit:** `test(voice): enforce committed-transcript turn boundary`

---

# Phase 2 — Clara Realtime Gateway

### Task 2.1: Add realtime session bootstrap

**Files:**
- Existing voice/embed session route or new focused realtime session route
- Existing auth/plan/rate-limit helpers

**Steps:**
- [ ] Resolve the caller's tenant and agent binding exactly as standard voice does.
- [ ] Resolve the agent's KB IDs, RAG mode, language policy, voice provider, and model server-side.
- [ ] Return only non-secret session configuration required by the browser.
- [ ] Never return ElevenLabs API keys.
- [ ] Reject realtime mode when the tenant/provider/plan gate is not allowed.

**Verification:** Tests for valid tenant, invalid key, disabled provider, missing KB binding, and expired session.

**Commit:** `feat(voice): add realtime session bootstrap`

### Task 2.2: Extend the existing relay instead of creating a second server

**Files:**
- Modify: `scripts/voice-relay.mjs`
- Modify: `scripts/start.mjs`
- Modify: `scripts/dev-relay.mjs` if required

**Steps:**
- [ ] Add a provider/mode branch for `elevenlabs + realtime-agent`.
- [ ] Keep existing OpenAI and Gemini branches intact.
- [ ] Validate the Clara session before opening vendor sockets.
- [ ] Add bounded cleanup on browser close, upstream close, timeout, and error.
- [ ] Add heartbeat/idle handling for long sessions.

**Verification:** Existing OpenAI/Gemini relay tests/smoke checks remain green.

**Commit:** `feat(voice): route elevenlabs realtime sessions through existing relay`

---

# Phase 3 — Scribe v2 Realtime Speech Input

ElevenLabs documents Scribe v2 Realtime as a WebSocket realtime STT service with partial transcripts and committed transcripts, and documents server-side streaming using an ElevenLabs API key. citeturn0search12turn0search15turn0search17

### Task 3.1: Implement the server-side Scribe adapter

**Files:**
- Create: focused ElevenLabs realtime STT provider/adapter
- Modify: existing ElevenLabs provider abstraction
- Test: adapter unit tests

**Steps:**
- [ ] Open `scribe_v2_realtime` only from the Clara server/relay.
- [ ] Stream PCM16 audio from the browser relay.
- [ ] Configure VAD/commit strategy.
- [ ] Forward partial transcripts to the browser as `transcript.partial`.
- [ ] Forward committed transcripts as `transcript.final`.
- [ ] Preserve previous-text/context only within documented limits.
- [ ] Avoid forcing `en` when Clara's language policy allows Scribe auto-detection.

**Verification:** Mock Scribe frames and assert partial/commit mapping, malformed-event handling, and disconnect cleanup.

**Commit:** `feat(voice): add scribe v2 realtime stt adapter`

### Task 3.2: Replace client RMS VAD only for realtime mode

**Files:**
- Existing realtime voice client hook
- Existing AudioWorklet

**Steps:**
- [ ] Keep AudioWorklet PCM capture.
- [ ] Stream PCM16 frames continuously during a realtime session.
- [ ] Stop using the old 700 ms client RMS VAD as the source of turn commits in realtime mode.
- [ ] Use Scribe committed events as the authoritative turn boundary.
- [ ] Keep browser-side speech detection only as an interruption UX signal if needed.

**Verification:** Test that one speech segment creates one final transcript even when partial events arrive many times.

**Commit:** `refactor(voice): use scribe commits for realtime turn boundaries`

---

# Phase 4 — Clara Agent Brain Integration

### Task 4.1: Create a single reusable realtime agent-turn orchestrator

**Files:**
- Create/modify focused voice-core agent-turn module
- Reuse existing chat/RAG/provider modules
- Tests beside the module

**Steps:**
- [ ] Accept a committed user transcript plus authenticated session context.
- [ ] Resolve agent instructions and conversation memory.
- [ ] Resolve KB/RAG configuration from Clara.
- [ ] Run the existing retrieval pipeline against Qdrant.
- [ ] Execute approved tools/MCP calls through Clara.
- [ ] Stream LLM text tokens/chunks.
- [ ] Emit tool events and assistant text events to the realtime session.
- [ ] Never call ElevenLabs Knowledge Base APIs for grounding.

**Verification:** Test a grounded question, a no-result question, a tool call, and a tenant-boundary failure.

**Commit:** `feat(voice): route realtime turns through clara agent core`

### Task 4.2: Unify typed chat and voice-agent context

**Steps:**
- [ ] Reuse the same conversation message schema where possible.
- [ ] Preserve agent/KB/document/ragMode context.
- [ ] Mark voice turns with transport metadata rather than creating a separate conversation type.
- [ ] Ensure the final transcript and assistant response can be persisted/replayed consistently.

**Verification:** A question asked by text and by voice reaches the same RAG/agent resolver with equivalent context.

**Commit:** `refactor(chat): unify typed and voice agent turn context`

---

# Phase 5 — Streaming ElevenLabs TTS Output

ElevenLabs documents Speech Engine as a way to add voice to a custom chat agent while the application server provides the LLM logic; its realtime TTS APIs support streaming text/audio workflows. citeturn0search5turn0search7

### Task 5.1: Add a persistent TTS stream adapter

**Files:**
- Existing ElevenLabs provider
- Existing TTS stream/relay code
- New focused adapter if required
- Tests

**Steps:**
- [ ] Open the ElevenLabs stream-input WebSocket per assistant turn/session strategy.
- [ ] Feed assistant text chunks as they arrive from Clara's LLM.
- [ ] Sanitize text before synthesis using the existing sanitizer.
- [ ] Flush at the end of the assistant turn.
- [ ] Forward PCM audio chunks to the browser.
- [ ] Forward `assistant.done` only after text and audio lifecycle are complete.
- [ ] Preserve current voice-config cache and plan/metering guards.

**Verification:** Mock text chunks and vendor audio frames; assert no per-sentence HTTP TTS calls occur in realtime mode.

**Commit:** `feat(voice): stream elevenlabs tts for realtime agent turns`

### Task 5.2: Add realtime playback and interruption

**Steps:**
- [ ] Feed PCM16 chunks into the existing browser playback pipeline.
- [ ] Clear queued audio immediately on interruption.
- [ ] Cancel the active Clara generation where supported.
- [ ] Close/cancel the active ElevenLabs TTS generation.
- [ ] Ignore late audio frames belonging to the interrupted turn.
- [ ] Start the new user turn without waiting for stale audio.

**Verification:** Test interruption during first audio, middle of response, and immediately before final audio.

**Commit:** `feat(voice): add realtime barge-in and stale-audio protection`

---

# Phase 6 — Browser Realtime Agent UX

### Task 6.1: Add realtime mode to useVoiceClient

**Files:**
- Existing `useVoiceClient`
- Existing ElevenLabs voice hook/client
- Realtime voice UI

**Steps:**
- [ ] Add `realtime-agent` as a distinct mode.
- [ ] Keep standard voice mode behavior unchanged.
- [ ] Route ElevenLabs realtime-agent to the Clara relay.
- [ ] Show live partial transcript without persisting it as a final user message.
- [ ] Replace partial text with committed text.
- [ ] Stream assistant transcript deltas.
- [ ] Display tool activity where the current chat UI already supports tool events.
- [ ] Preserve mute, disconnect, retry, and permission states.

**Verification:** Browser smoke test for start → partial → commit → tool → audio → done.

**Commit:** `feat(voice-ui): add realtime agent mode to voice client`

### Task 6.2: Keep standard voice UX as an explicit fallback

**Steps:**
- [ ] If realtime is disabled/unavailable, standard STT → Clara → TTS remains selectable.
- [ ] Do not silently switch from realtime to standard after a partial transcript unless the session explicitly enters recovery.
- [ ] Surface a clear retry/fallback state.
- [ ] Preserve existing embed/platform restrictions.

**Verification:** Disable realtime provider and confirm standard voice remains functional.

**Commit:** `feat(voice-ui): preserve standard voice fallback`

---

# Phase 7 — Metering, Security, Observability

### Task 7.1: Realtime usage accounting

**Steps:**
- [ ] Measure streamed input audio duration from PCM frames.
- [ ] Measure committed transcript turns.
- [ ] Measure assistant output text/audio.
- [ ] Avoid counting partial transcripts as billable assistant turns.
- [ ] Ensure interruption does not double-count a restarted turn.
- [ ] Reuse existing plan/rate-limit infrastructure.

**Verification:** Unit tests for normal turn, interrupted turn, reconnect, and failed upstream.

**Commit:** `feat(voice): add realtime usage accounting`

### Task 7.2: Add latency and lifecycle telemetry

**Events/metrics:**
- `voice.session.start`
- `stt.first_partial`
- `stt.final`
- `rag.start/end`
- `tool.start/end`
- `llm.first_token`
- `tts.first_audio`
- `browser.first_audio`
- `voice.interrupt`
- `voice.turn.complete`
- `voice.error`

**Steps:**
- [ ] Attach correlation/session/tenant identifiers without logging sensitive transcript content unnecessarily.
- [ ] Calculate TTFA and interruption latency.
- [ ] Record provider/model/mode, not secrets.
- [ ] Add structured error categories for STT, RAG, LLM, TTS, browser, and relay.

**Verification:** A synthetic turn produces the expected event sequence.

**Commit:** `feat(observability): instrument realtime voice lifecycle`

---

# Phase 8 — Configuration and Migration

### Task 8.1: Add explicit configuration

**Files:**
- `.env.example`
- Existing platform settings/config resolver
- Existing AI/voice settings UI where appropriate

**Configuration concept:**
```
VOICE_MODE=standard
ELEVENLABS_REALTIME_ENABLED=false
ELEVENLABS_REALTIME_STT_MODEL=scribe_v2_realtime
ELEVENLABS_REALTIME_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_REALTIME_TTS_OUTPUT_FORMAT=pcm_16000
```

**Steps:**
- [ ] Add server-only defaults.
- [ ] Add provider enable/disable gates.
- [ ] Keep existing ElevenLabs standard TTS configuration.
- [ ] Do not expose API keys through public environment variables.
- [ ] Make realtime opt-in until production validation completes.

**Verification:** Config validation rejects unsafe/missing combinations.

**Commit:** `feat(config): add elevenlabs realtime voice settings`

### Task 8.2: Agent-level mode selection

**Steps:**
- [ ] Allow a Clara agent to select standard voice or realtime agent mode where the plan/provider permits.
- [ ] Resolve mode from agent/workspace configuration server-side.
- [ ] Keep provider selection independent from mode.
- [ ] Document that KB selection always belongs to Clara.

**Verification:** Two agents can use different modes without cross-session configuration leakage.

**Commit:** `feat(agents): add voice interaction mode selection`

---

# Phase 9 — Testing and Performance Validation

### Task 9.1: Unit and integration test matrix

**Required cases:**
- [ ] Scribe partial transcript.
- [ ] Scribe committed transcript.
- [ ] Duplicate commit protection.
- [ ] Empty/noise transcript.
- [ ] Clara KB retrieval success.
- [ ] Clara KB no-result response.
- [ ] Tool invocation.
- [ ] Tool failure.
- [ ] ElevenLabs TTS first audio.
- [ ] TTS disconnect.
- [ ] Barge-in.
- [ ] Browser reconnect.
- [ ] Session expiry.
- [ ] Tenant mismatch.
- [ ] Standard voice regression.

**Verification:** `npm test`, `npm run type-check`, and `npm run lint`.

**Commit:** `test(voice): cover realtime agent integration matrix`

### Task 9.2: Real-device latency benchmark

Measure separately:

```
speech start
  → Scribe first partial
  → Scribe final
  → Clara turn accepted
  → RAG start/end
  → LLM first token
  → TTS first audio
  → browser first audio
```

**Steps:**
- [ ] Run clean English conversation.
- [ ] Run Tamil/English code-switching.
- [ ] Run noisy microphone/background audio.
- [ ] Run KB-heavy question.
- [ ] Run tool-heavy question.
- [ ] Run barge-in during long answer.
- [ ] Compare against current standard STT → chat → TTS baseline.

**Acceptance target:** Establish measured p50/p95 values before setting hard production SLOs. The implementation must not claim vendor latency as Clara end-to-end latency.

**Commit:** `test(voice): add realtime latency benchmark results`

---

# Phase 10 — Production Rollout

### Task 10.1: Staged rollout

**Stages:**
- [ ] Internal/admin agents only.
- [ ] Selected tenant/agent allowlist.
- [ ] Embed/platform rollout.
- [ ] General availability after stability review.

**Rollback:** Set realtime mode disabled and return agents to standard voice mode without changing KB, agent, or conversation data.

**Commit:** `docs(voice): add realtime production rollout runbook`

### Task 10.2: Final architecture review

**Review checklist:**
- [ ] Clara owns the brain.
- [ ] Clara owns RAG/KB.
- [ ] Clara owns tools/MCP.
- [ ] ElevenLabs owns speech recognition/synthesis only.
- [ ] Browser never receives vendor secrets.
- [ ] Standard voice remains operational.
- [ ] Existing OpenAI/Gemini/Sarvam paths remain intact.
- [ ] Realtime interruptions do not leak stale audio.
- [ ] Metering is mode-aware.
- [ ] Tenant isolation is preserved.
- [ ] Observability can explain every slow turn.

**Commit:** `docs(voice): finalize realtime agent architecture review`

---

# Phase Dependency Map

```
Phase 0
  │
  ├── Phase 1 ──► Phase 2
  │                 │
  │                 ├── Phase 3 (Scribe)
  │                 │
  │                 ├── Phase 4 (Clara Agent Core)
  │                 │
  │                 └── Phase 5 (Streaming TTS)
  │                           │
  │                           ▼
  │                     Phase 6 (Browser)
  │                           │
  │                           ▼
  │                     Phase 7 (Ops)
  │                           │
  │                           ▼
  └──────────────────── Phase 8 (Config)
                              │
                              ▼
                        Phase 9 (Validation)
                              │
                              ▼
                        Phase 10 (Rollout)
```

Phases 3, 4, and 5 can be developed in parallel after the gateway contract is frozen, but integration testing must wait until all three are available.

# Final Provider Contract

The implementation should converge on this conceptual interface:

```ts
interface RealtimeVoiceSession {
  connect(): Promise<void>;
  sendAudio(pcm16: ArrayBuffer): void;
  sendText(text: string): void;
  interrupt(): void;
  stop(): void;

  onTranscriptPartial(cb: (text: string) => void): void;
  onTranscriptFinal(cb: (text: string) => void): void;
  onAssistantText(cb: (delta: string) => void): void;
  onAudio(cb: (pcm16: ArrayBuffer) => void): void;
  onToolEvent(cb: (event: ToolEvent) => void): void;
  onState(cb: (state: VoiceSessionState) => void): void;
  onError(cb: (error: VoiceError) => void): void;
}
```

Provider implementations should remain replaceable:

```
StandardVoiceSession
OpenAIRealtimeSession
GeminiLiveSession
ElevenLabsScribeRealtimeSession
SarvamRealtimeSession
```

The important boundary is that these providers implement **speech/transport**, while Clara's Agent Core remains shared.

# Definition of Done

- Standard non-realtime voice continues to work independently.
- ElevenLabs realtime-agent mode uses Scribe v2 Realtime for live STT.
- Clara receives only committed user turns for reasoning.
- Every realtime turn uses Clara's existing agent + KB/RAG + tool + memory pipeline.
- Assistant text streams from Clara's selected LLM.
- ElevenLabs streaming TTS converts that text to realtime audio.
- Browser receives audio through the Clara-controlled relay.
- Barge-in cancels stale generation/audio.
- No ElevenLabs Knowledge Base is required for Clara grounding.
- No vendor API key reaches the browser.
- Existing OpenAI/Gemini/Sarvam integrations remain functional.
- `npm run type-check`, `npm run lint`, and `npm test` pass.
- Production benchmark results are recorded before enabling the feature broadly.

# Reference Notes

ElevenLabs currently documents Scribe v2 Realtime as its realtime speech-recognition model for live applications, with WebSocket streaming, partial/committed transcripts, and server-side API-key usage. citeturn0search12turn0search15turn0search17

ElevenLabs also documents Speech Engine specifically for adding voice to a custom chat agent where the application server supplies the LLM logic. This aligns with the Clara boundary: speech can be delegated while Clara retains the agent brain and data/knowledge path. citeturn0search5turn0search7

Superpowers' writing-plans workflow calls for a comprehensive plan with exact file responsibilities, bite-sized TDD tasks, verification, and frequent commits; the structure above follows that workflow. citeturn0search0turn0search3
