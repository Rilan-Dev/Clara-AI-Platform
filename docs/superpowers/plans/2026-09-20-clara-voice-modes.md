# Clara Voice Modes & Provider-Switchable Realtime Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Clara's existing voice system with a fast realtime ElevenLabs path while preserving the existing OpenAI Realtime, Gemini Live, Sarvam, and ElevenLabs paths, so an admin can switch providers without changing the tenant's Clara knowledge base, Qdrant retrieval, agent configuration, tools, memory, or authorization.

**Architecture:** Clara owns tenant/authentication, agent configuration, KB selection, Qdrant retrieval, grounding, tools, memory, policies, metering, and the LLM provider used by Clara-controlled turns. Realtime providers remain selectable adapters: OpenAI Realtime and Gemini Live keep their existing provider-native realtime execution with Clara RAG/tool bridges; Sarvam keeps its existing voice path; ElevenLabs gains a new Clara-controlled realtime path using Scribe v2 Realtime for STT and ElevenLabs streaming TTS for speech output. The provider adapter changes realtime transport/execution mechanics, never the source of organizational knowledge.

**Tech Stack:** Next.js 15, React 18, TypeScript, WebSocket/`ws`, AudioWorklet PCM16, existing `useVoiceClient` routing, existing voice relay, existing Clara chat/RAG/Qdrant pipeline, ElevenLabs Scribe v2 Realtime, ElevenLabs TTS WebSocket, existing OpenAI/Gemini/Sarvam integrations, Vitest, ESLint, TypeScript.

**Spec:** Existing baseline `Doc/19-09-2026/ELEVENLABS_REALTIME_STREAMING_PLAN.md`. This plan is the authoritative implementation plan for the clarified provider-switchable architecture.

---

## Global Constraints

- **One Clara knowledge boundary:** Every provider uses the same authenticated Clara KB/document scope and Qdrant retrieval path. Provider selection must never select or migrate a different KB.
- **Provider switching is transport/execution switching:** `realtimeProvider` may change; `kbId`, `documentId`, `ragMode`, tenant binding, agent rules, tools, memory policy, and authorization do not change.
- **Existing providers are preserved:** Do not replace or rewrite the current OpenAI Realtime or Gemini Live execution paths. Do not remove Sarvam or existing ElevenLabs Mode A/Mode B functionality.
- **Two interaction modes remain explicit:** `standard` = record → STT → Clara chat/RAG/tools → TTS; `realtime` = continuous audio/session with provider-specific realtime transport.
- **Two ElevenLabs realtime choices are distinct:** existing ElevenLabs Conversational AI remains a compatibility option; the new Clara-controlled ElevenLabs realtime path uses Scribe v2 Realtime → Clara turn processing → ElevenLabs streaming TTS.
- **Common Clara grounding contract, not forced common provider brain:** Existing OpenAI/Gemini provider-native execution can continue to call Clara `rag_search`; the new ElevenLabs Clara-controlled path executes the same Clara grounding/tool services directly. Do not force all vendors through a risky rewrite.
- **No vendor KB authority:** ElevenLabs-hosted Knowledge Base/Agent memory is not the source of truth for Clara organization knowledge.
- **Secrets stay server-side:** ElevenLabs, OpenAI, Gemini, Sarvam and database credentials never reach the browser.
- **One active generation per Clara realtime session:** each assistant generation gets a generation/turn ID; interrupted generations become invalid immediately.
- **No stale audio:** browser playback queues, upstream TTS streams, and delayed callbacks must reject audio from an invalid generation.
- **Fast path is measured end-to-end:** optimize time-to-first-audio (TTFA), not only Qdrant query time.
- **OpenAI current performance is a regression baseline:** the current fast OpenAI Realtime path must remain fast and functional after changes.
- **Small diffs:** reuse current relay, hooks, provider abstractions, sanitizer, caching, metering and AudioWorklet instead of introducing parallel infrastructure.
- **No implementation starts from this plan until the execution method is selected and the plan is approved.**
- Every implementation task follows RED → GREEN → REFACTOR and ends with focused verification and a focused commit.

## Review Focus

1. Provider switching changes speech/realtime execution but never changes the Clara KB/tenant/RAG binding.
2. Existing OpenAI Realtime and Gemini Live still produce one response per user turn; no regression into duplicate-response behavior.
3. Scribe partial transcripts update UI only; exactly one committed transcript creates one Clara turn.
4. A second user turn or barge-in invalidates the first generation before new audio can be played.
5. ElevenLabs realtime must stream text into TTS instead of making sentence-by-sentence HTTP TTS calls.
6. A slow/failed vendor connection must produce a recoverable session state, not a permanently speaking/listening session.
7. Standard voice remains independently usable when realtime is disabled.
8. Tenant/agent/KB mismatch must be rejected before any vendor socket is opened.

---

# 1. Target Architecture

## 1.1 Interaction mode vs realtime provider

These are separate configuration axes.

| Axis | Values | Meaning |
|---|---|---|
| `interactionMode` | `standard`, `realtime` | How the voice conversation is transported |
| `realtimeProvider` | `openai`, `gemini`, `elevenlabs`, `sarvam` | Which realtime/provider path is used |
| `elevenlabsRealtimeEngine` | `clara-stream`, `conversational` | Only relevant when ElevenLabs is selected |
| `brainProvider` | existing Clara/LLM provider setting | Which LLM executes Clara-controlled turns |
| `kbId` / `documentId` / `ragMode` | existing Clara values | Always resolved from Clara and never selected by the speech provider |

A provider change must produce:

`same tenant + same agent + same KB + same RAG policy + same tools + different realtime adapter`

It must never produce:

`same user + different vendor KB`

## 1.2 Provider responsibility matrix

| Provider/path | Realtime input | Conversation execution | Clara knowledge | Output | Status |
|---|---|---|---|---|---|
| **OpenAI Realtime** | OpenAI Realtime | Existing OpenAI Realtime execution | Clara `rag_search` bridge → Qdrant | OpenAI realtime audio | Preserve |
| **Gemini Live** | Gemini Live | Existing Gemini Live execution | Clara `rag_search` bridge → Qdrant | Gemini audio | Preserve |
| **Sarvam** | Existing Sarvam realtime/pipeline capability | Existing Clara/Sarvam path | Clara chat/RAG → Qdrant | Sarvam audio | Preserve |
| **ElevenLabs Mode A** | Existing utterance STT | Existing Clara chat/RAG | Clara → Qdrant | Existing ElevenLabs TTS | Preserve |
| **ElevenLabs Mode B** | Existing ElevenLabs Conversational AI | ElevenLabs-hosted execution with Clara RAG webhook | Clara `clara_rag_search` → Qdrant | ElevenLabs agent audio | Preserve |
| **ElevenLabs Clara Realtime** | **Scribe v2 Realtime** | **Clara-controlled turn orchestrator + selected Clara LLM** | **Clara → Qdrant** | **ElevenLabs TTS WebSocket** | New |

This is intentionally **not** a forced migration of OpenAI/Gemini/Sarvam to the new Clara-controlled execution model. Their current provider-native realtime behavior is valuable and remains available.

## 1.3 Clara knowledge contract

Every provider receives an equivalent server-resolved knowledge context:

`tenantId → agentId → kbId/documentId/ragMode → Clara retrieval → grounded context`

The provider never chooses:

- another organization's KB;
- another agent's KB;
- an ElevenLabs KB;
- a different RAG policy;
- a different tool permission set.

For OpenAI/Gemini, this contract is satisfied through their existing server-side `rag_search` function bridge. For the new ElevenLabs Clara Realtime path, the Clara turn orchestrator calls the same underlying retrieval services directly.

## 1.4 Standard voice path

```
Browser recording
      ↓
existing STT provider
      ↓
final transcript
      ↓
Clara chat/agent turn
      ├── tenant + agent authorization
      ├── KB resolver
      ├── Qdrant retrieval
      ├── tools/MCP
      ├── memory
      └── selected LLM
      ↓
existing TTS provider
      ↓
Browser audio
```

Standard voice must remain independent of the realtime gateway.

## 1.5 New ElevenLabs Clara Realtime path

```
Browser
  │
  │ PCM16 16 kHz
  ▼
Clara Voice Relay
  │
  ├──────────────► ElevenLabs Scribe v2 Realtime
  │                       │
  │                       ├─ partial transcript ──► browser
  │                       └─ committed transcript
  │                                  │
  │                                  ▼
  │                         Clara Turn Orchestrator
  │                                  │
  │                    ┌─────────────┼─────────────┐
  │                    ▼             ▼             ▼
  │                  Qdrant        Tools         Memory
  │                    │
  │                    ▼
  │              Grounded context
  │                    │
  │                    ▼
  │               Clara LLM
  │                    │
  │              text deltas
  │                    ▼
  │          ElevenLabs TTS WebSocket
  │                    │
  │              audio deltas
  │                    ▼
  └──────────────► Browser playback
```

The critical latency chain is:

`Scribe final → Clara retrieval → LLM first token → ElevenLabs first audio → browser playback`

The goal is to minimize the whole chain and start speaking while the answer is still being generated.

## 1.6 ElevenLabs realtime transport facts to encode in the implementation

ElevenLabs documents Scribe v2 Realtime as a WebSocket STT API that emits `partial_transcript` and stable `committed_transcript` events. It supports PCM 16 kHz input and VAD/manual commit strategies. The official documentation recommends small streaming chunks for smooth realtime behavior.

ElevenLabs documents its TTS `stream-input` WebSocket as a streaming text-to-audio transport intended for partial text input. The current Clara configuration already uses `eleven_flash_v2_5`, which is appropriate for the low-latency path.

Official references:
- Scribe realtime: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
- Commit strategies: https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/transcripts-and-commit-strategies
- Server-side Scribe: https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/server-side-streaming
- TTS WebSocket: https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input
- Realtime TTS guide: https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tts

---

# Phase 0 — Reconcile the Existing Implementation

### Task 0.1: Freeze the provider-switching contract

**Files:**
- Modify: `docs/superpowers/plans/2026-09-20-clara-voice-modes.md`
- Create: `docs/superpowers/specs/2026-09-20-clara-voice-provider-switching.md`

**Steps:**
- [ ] Define `interactionMode`, `realtimeProvider`, `elevenlabsRealtimeEngine`, `kbId`, `documentId`, and `ragMode` as separate concepts.
- [ ] Document that provider switching cannot alter Clara KB/RAG/tool configuration.
- [ ] Document preserved OpenAI, Gemini, Sarvam and existing ElevenLabs modes.
- [ ] Document the new ElevenLabs Clara Realtime path.
- [ ] Document non-goals: no provider rewrite, no ElevenLabs KB migration, no removal of existing provider-native realtime.

**Verification:** Review the contract against `useVoiceClient.ts`, `useOpenAIRealtime.ts`, `useGeminiLive.ts`, `useElevenLabsVoice.ts`, `useElevenLabsConvAI.ts`, `useSarvamVoice.ts`, and the relay.

**Commit:** `docs(voice): freeze provider-switching contract`

### Task 0.2: Inventory the actual current seams

**Files to inspect:**
- `src/modules/assistant/core/hooks/useVoiceClient.ts`
- `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`
- `src/modules/assistant/core/hooks/useGeminiLive.ts`
- `src/modules/assistant/core/hooks/useElevenLabsVoice.ts`
- `src/modules/assistant/core/hooks/useElevenLabsConvAI.ts`
- `src/modules/assistant/core/hooks/useSarvamVoice.ts`
- `src/modules/voice-core/providers/*`
- `src/modules/voice-core/api/*`
- `scripts/voice-relay.mjs`
- `scripts/sarvam-relay.mjs`
- `scripts/start.mjs`
- `src/modules/assistant/api/realtime.ts`
- existing `/api/voice/provider`, `/api/embed/session`, `/api/embed/voice-init`, chat, RAG, STT and TTS routes

**Steps:**
- [ ] Record the exact provider resolution flow.
- [ ] Record the exact current OpenAI/Gemini RAG tool bridge.
- [ ] Record the current ElevenLabs Mode A pipeline.
- [ ] Record the current ElevenLabs Mode B Conversational AI path.
- [ ] Record the current Sarvam realtime/pipeline negotiation.
- [ ] Record current metering, sanitization, caching and interruption logic.
- [ ] Identify where a generation ID can be added without duplicating state.

**Verification:** The inventory must identify the current files before any implementation file is selected.

**Commit:** `docs(voice): map current provider and rag seams`

---

# Phase 1 — Provider-Neutral Session Contract

### Task 1.1: Add explicit interaction/provider session types

**Files:**
- Modify: existing voice-core type module
- Modify: `src/modules/assistant/core/voice/types*` as applicable
- Test: adjacent voice-core type/validation tests

**Required types:**

```ts
type InteractionMode = "standard" | "realtime";

type RealtimeProvider = "openai" | "gemini" | "elevenlabs" | "sarvam";

type ElevenLabsRealtimeEngine = "clara-stream" | "conversational";

type ClaraVoiceContext = {
  tenantId: string;
  agentId: string;
  kbId: string | null;
  documentId: string | null;
  ragMode: string | null;
};

type RealtimeSessionConfig = {
  interactionMode: "realtime";
  realtimeProvider: RealtimeProvider;
  elevenlabsRealtimeEngine?: ElevenLabsRealtimeEngine;
  sessionId: string;
  voiceContext: ClaraVoiceContext;
  language?: string | null;
};
```

Do not expose secrets in these types.

**Steps:**
- [ ] Add the smallest compatible type surface.
- [ ] Reuse existing provider names rather than introducing duplicate enums.
- [ ] Validate provider/engine combinations server-side.
- [ ] Add tests for valid and invalid combinations.

**Verification:** Type-check plus focused validation tests.

**Commit:** `feat(voice): define provider-switchable realtime session types`

### Task 1.2: Define the Clara realtime event protocol

**Browser → Clara:**

```text
session.start
audio(binary PCM16)
text
interrupt
session.stop
ping
```

**Clara → Browser:**

```text
session.ready
status
transcript.partial
transcript.final
assistant.text.delta
assistant.text.done
tool.start
tool.result
audio(binary/base64 according to existing transport)
assistant.done
interrupted
error
pong
```

**Steps:**
- [ ] Keep audio frames separate from JSON control events.
- [ ] Include `sessionId` and `generationId` where an event can arrive late.
- [ ] Make `transcript.partial` explicitly non-turn-creating.
- [ ] Make `transcript.final` idempotent by turn ID.

**Verification:** Duplicate-final and stale-generation tests.

**Commit:** `test(voice): enforce realtime event and turn boundaries`

---

# Phase 2 — Preserve and Harden Existing Provider Routing

### Task 2.1: Preserve current useVoiceClient provider resolution

**Files:**
- Modify: `src/modules/assistant/core/hooks/useVoiceClient.ts`
- Test: existing voice client/provider tests

**Steps:**
- [ ] Keep unconditional hook invocation required by React.
- [ ] Preserve OpenAI → `useOpenAIRealtime`.
- [ ] Preserve Gemini → `useGeminiLive`.
- [ ] Preserve ElevenLabs Mode A → `useElevenLabsVoice`.
- [ ] Preserve ElevenLabs Mode B → `useElevenLabsConvAI`.
- [ ] Preserve Sarvam → `useSarvamVoice`.
- [ ] Add the new ElevenLabs Clara Realtime selection without changing existing provider names.
- [ ] Resolve provider and mode from the server rather than assuming `NEXT_PUBLIC_AI_PROVIDER` is the complete source of truth.

**Verification:** A provider matrix test confirms all current routes still resolve to their current hook and the new path resolves only when explicitly selected.

**Commit:** `refactor(voice): extend provider routing without replacing existing paths`

### Task 2.2: Make provider switching KB-invariant

**Files:**
- Modify: `src/modules/voice-core/api/provider.ts` or current provider resolver
- Modify: corresponding session/bootstrap route
- Test: provider resolver tests

**Steps:**
- [ ] Resolve tenant and agent first.
- [ ] Resolve `kbId`, `documentId`, `ragMode), language and tool policy once.
- [ ] Resolve the requested realtime provider separately.
- [ ] Return capability/provider information without vendor credentials.
- [ ] Ensure changing provider does not mutate KB configuration.
- [ ] Reject a provider that is disabled for the organization/plan.

**Verification:** Given the same session context, OpenAI/Gemini/ElevenLabs/Sarvam resolutions return the same Clara knowledge binding.

**Commit:** `feat(voice): make provider selection knowledge-bound`

---

# Phase 3 — Clara Realtime Gateway

### Task 3.1: Extend the existing voice relay

**Files:**
- Modify: `scripts/voice-relay.mjs`
- Modify: `scripts/start.mjs`
- Modify: `scripts/dev-relay.mjs` only if required

**Steps:**
- [ ] Preserve existing OpenAI and Gemini branches unchanged unless a shared helper is strictly necessary.
- [ ] Add an ElevenLabs Clara Realtime branch.
- [ ] Validate the Clara session before opening Scribe/TTS sockets.
- [ ] Pass only server-resolved provider configuration to adapters.
- [ ] Reuse existing server-side secret handling.
- [ ] Close all upstream sockets when browser/session closes.
- [ ] Add bounded connect and idle timeouts.

**Verification:** Existing OpenAI/Gemini smoke paths remain functional; a new ElevenLabs session reaches `session.ready`.

**Commit:** `feat(voice): add elevenlabs clara realtime relay path`

### Task 3.2: Add one session lifecycle state machine

**States:**

```text
idle
→ connecting
→ listening
→ thinking
→ speaking
→ interrupted
→ error
→ idle
```

**Steps:**
- [ ] Ensure only the active generation can move a session into `speaking`.
- [ ] Ensure interruption immediately invalidates the current generation.
- [ ] Ensure an upstream disconnect cannot leave the browser in `speaking`.
- [ ] Ensure session close removes all listeners/timers.

**Verification:** State transition tests for normal turn, interruption, timeout, upstream close and browser close.

**Commit:** `feat(voice): enforce realtime session lifecycle`

---

# Phase 4 — Scribe v2 Realtime STT

### Task 4.1: Implement server-side Scribe adapter

**Files:**
- Create: focused Scribe realtime adapter under the existing voice-core provider structure
- Modify: existing ElevenLabs provider export/index
- Test: Scribe adapter tests

**Steps:**
- [ ] Connect to the ElevenLabs realtime STT WebSocket using server credentials.
- [ ] Use `scribe_v2_realtime`.
- [ ] Send PCM16 16 kHz audio.
- [ ] Use VAD or explicit commit according to measured latency/accuracy; do not add a second client turn detector.
- [ ] Map `partial_transcript` to `transcript.partial`.
- [ ] Map `committed_transcript` to `transcript.final`.
- [ ] Preserve detected language when available.
- [ ] Surface `auth_error`, `quota_exceeded`, `transcriber_error`, `input_error` and close events as typed Clara errors.

**Verification:** Mock all documented event classes and assert exact mapping.

**Commit:** `feat(voice): add scribe v2 realtime adapter`

### Task 4.2: Make Scribe commit the only Clara turn trigger

**Files:**
- Scribe relay/adapter
- Clara turn dispatcher
- Realtime tests

**Steps:**
- [ ] Partial transcript updates the live UI only.
- [ ] Ignore empty/noise commits using the existing speech/noise filtering rules.
- [ ] Deduplicate repeated committed transcript IDs.
- [ ] Create exactly one `generationId` for each accepted committed user turn.
- [ ] Do not invoke Clara chat/RAG/LLM from browser-side VAD events.

**Verification:** 20 partial events + 1 commit produces exactly one agent invocation.

**Commit:** `test(voice): guarantee one agent turn per scribe commit`

---

# Phase 5 — Clara-Controlled Realtime Agent Turn

### Task 5.1: Reuse the existing Clara chat/RAG pipeline

**Files:**
- Existing Clara chat/agent service identified during Phase 0
- Existing RAG/Qdrant service
- New focused realtime turn adapter only where the existing API cannot stream
- Tests

**Steps:**
- [ ] Accept `tenantId`, `agentId`, `kbId`, `documentId`, `ragMode`, conversation state and committed transcript from the authenticated session.
- [ ] Call the existing Clara RAG resolver rather than implementing a second Qdrant query.
- [ ] Preserve the same retrieval filters and tenant checks used by typed chat.
- [ ] Preserve existing tools/MCP authorization.
- [ ] Preserve agent instructions and memory behavior.
- [ ] Use the selected Clara LLM provider.
- [ ] Stream assistant text deltas as soon as the LLM produces them.
- [ ] Do not send provider API credentials or raw Qdrant internals to the browser.

**Verification:** The same question with the same agent/KB produces the same grounding source set in text chat and ElevenLabs Clara Realtime.

**Commit:** `feat(voice): connect realtime turns to existing clara grounding`

### Task 5.2: Keep provider-native OpenAI/Gemini execution intact

**Files:**
- `scripts/voice-relay.mjs`
- `src/modules/assistant/core/hooks/useOpenAIRealtime.ts`
- `src/modules/assistant/core/hooks/useGeminiLive.ts`
- Existing RAG bridge tests

**Steps:**
- [ ] Do not replace OpenAI Realtime's response generation with the new Clara turn orchestrator.
- [ ] Do not replace Gemini Live's modelTurn generation with the new Clara turn orchestrator.
- [ ] Preserve their existing server-side `rag_search` bridge.
- [ ] Add only shared knowledge-context/session invariants where required.
- [ ] Preserve existing interruption behavior.

**Verification:** Existing OpenAI and Gemini realtime tests/smoke flows remain unchanged in behavior.

**Commit:** `test(voice): lock existing provider-native realtime behavior`

---

# Phase 6 — ElevenLabs Streaming TTS

### Task 6.1: Add streaming TTS adapter

**Files:**
- Modify/create focused ElevenLabs realtime TTS provider
- Reuse: existing `src/modules/voice-core/tts-text.ts`
- Reuse: existing `providers/elevenlabs.ts`
- Test: TTS stream tests

**Steps:**
- [ ] Open the ElevenLabs TTS `stream-input` WebSocket server-side.
- [ ] Use the existing voice ID and `eleven_flash_v2_5` default.
- [ ] Send partial Clara assistant text chunks as they arrive.
- [ ] Use the existing sanitizer before synthesis.
- [ ] Avoid sentence-by-sentence HTTP TTS calls in this mode.
- [ ] Flush the final text.
- [ ] Forward audio chunks immediately.
- [ ] Emit completion only after the stream reports final audio lifecycle.
- [ ] Reuse existing voice config caching and metering.

**Verification:** A streamed answer results in one TTS stream and multiple audio chunks, not N independent sentence requests.

**Commit:** `feat(voice): add elevenlabs streaming tts adapter`

### Task 6.2: Solve the multiple-simultaneous-answer bug before rollout

**Files:**
- New realtime turn coordinator
- `useVoiceClient.ts`
- ElevenLabs realtime client/playback code
- Relay lifecycle

**Generation invariant:**

```ts
type ActiveGeneration = {
  sessionId: string;
  generationId: string;
  cancelled: boolean;
};
```

**Steps:**
- [ ] Create one active generation per session.
- [ ] On a new committed user turn, cancel/invalidate the previous generation before starting another.
- [ ] On `interrupt`, immediately mark the generation cancelled.
- [ ] Clear browser audio queues immediately.
- [ ] Close/cancel the active TTS stream.
- [ ] Abort the active Clara LLM/RAG operation where the existing API supports cancellation.
- [ ] Discard any late text/audio event whose generation ID is no longer active.
- [ ] Ensure a stale `assistant.done` cannot terminate a newer turn.
- [ ] Ensure a reconnect cannot replay the old generation.

**Verification:** Automated concurrency tests cover:
1. two commits in quick succession;
2. interrupt during TTS;
3. interrupt during RAG;
4. interrupt during LLM streaming;
5. late audio after cancellation;
6. reconnect during active generation.

**Commit:** `fix(voice): prevent concurrent and stale realtime generations`

---

# Phase 7 — Browser Realtime UX

### Task 7.1: Add the new ElevenLabs Clara Realtime hook path

**Files:**
- Create: `src/modules/assistant/core/hooks/useElevenLabsClaraRealtime.ts`
- Modify: `src/modules/assistant/core/hooks/useVoiceClient.ts`
- Reuse: existing AudioWorklet and playback utilities
- Test: hook/provider routing tests

**Steps:**
- [ ] Keep the existing `useElevenLabsVoice` hook untouched for standard Mode A behavior except shared bug fixes proven safe.
- [ ] Keep `useElevenLabsConvAI` untouched as the existing compatibility Mode B unless explicitly selected.
- [ ] Connect the new hook only to Clara's realtime relay.
- [ ] Stream PCM16 continuously.
- [ ] Render partial transcripts.
- [ ] Render committed transcripts once.
- [ ] Render assistant text deltas.
- [ ] Play audio chunks through the existing playback path.
- [ ] Expose `interrupt()`, `disconnect()`, `sendText()` and state using the same public shape as existing voice hooks.

**Verification:** Provider routing selects this hook only for `realtimeProvider=elevenlabs` + `interactionMode=realtime` + `engine=clara-stream`.

**Commit:** `feat(voice-ui): add clara-controlled elevenlabs realtime hook`

### Task 7.2: Keep standard and legacy ElevenLabs modes explicit

**Steps:**
- [ ] `standard + elevenlabs` continues using existing Mode A.
- [ ] `realtime + elevenlabs + conversational` continues using existing Mode B.
- [ ] `realtime + elevenlabs + clara-stream` selects the new path.
- [ ] Do not silently convert Mode B to Clara Realtime.
- [ ] Do not silently fall back from realtime to standard after partial speech.
- [ ] If the server explicitly permits recovery, show the recovery state and restart a clean session.

**Verification:** Three ElevenLabs configurations are independently selectable and do not share stale state.

**Commit:** `test(voice-ui): preserve all elevenlabs interaction modes`

---

# Phase 8 — Metering, Security and Observability

### Task 8.1: Realtime usage accounting

**Files:**
- Existing voice metering service
- New realtime usage adapter
- Tests

**Steps:**
- [ ] Count input audio duration from accepted PCM frames.
- [ ] Count committed STT turns, not partial transcripts.
- [ ] Count generated assistant text/audio according to existing provider billing rules.
- [ ] Do not double-count interrupted/restarted generations.
- [ ] Keep standard voice billing unchanged.
- [ ] Keep existing plan/rate-limit enforcement.

**Verification:** Normal, interrupted, failed and retried turns produce deterministic usage records.

**Commit:** `feat(voice): add realtime usage accounting`

### Task 8.2: Add end-to-end latency instrumentation

**Events:**

```text
voice.session.start
stt.first_partial
stt.committed
clara.turn.start
rag.start
rag.end
llm.first_token
tts.first_text
tts.first_audio
browser.first_audio
voice.interrupt
voice.turn.complete
voice.error
```

**Steps:**
- [ ] Attach session, generation, provider and model identifiers.
- [ ] Do not log API keys or unnecessary transcript content.
- [ ] Measure each stage separately.
- [ ] Calculate TTFA from committed user turn to browser first audio.
- [ ] Record whether the turn used OpenAI, Gemini, Sarvam, ElevenLabs Clara Realtime or ElevenLabs Conversational AI.
- [ ] Keep enough telemetry to explain why a turn was slow.

**Verification:** Synthetic turn produces a complete ordered event trace.

**Commit:** `feat(observability): instrument provider-switchable voice latency`

---

# Phase 9 — Configuration and Admin Provider Switching

### Task 9.1: Define server-side provider configuration

**Files:**
- `.env.example`
- Existing AI/voice configuration resolver
- Existing provider settings schema/migration only if required

**Configuration:**

```text
VOICE_INTERACTION_MODE=standard
REALTIME_VOICE_PROVIDER=openai
ELEVENLABS_REALTIME_ENABLED=false
ELEVENLABS_REALTIME_ENGINE=clara-stream
ELEVENLABS_REALTIME_STT_MODEL=scribe_v2_realtime
ELEVENLABS_REALTIME_TTS_MODEL=eleven_flash_v2_5
```

**Steps:**
- [ ] Add safe defaults matching current production behavior.
- [ ] Keep provider credentials server-only.
- [ ] Do not use environment variables as the only per-organization provider selector if the current DB settings already support provider selection.
- [ ] Preserve existing ElevenLabs standard TTS configuration.
- [ ] Gate the new Clara Realtime path independently.

**Verification:** Configuration tests confirm the new path is opt-in and existing provider defaults remain unchanged.

**Commit:** `feat(config): add elevenlabs clara realtime configuration`

### Task 9.2: Admin/organization provider switching

**Files:**
- Existing AI/voice settings UI/API
- Existing organization settings persistence
- Existing `/api/voice/provider` resolver

**Steps:**
- [ ] Expose provider selection using existing admin configuration patterns.
- [ ] Expose interaction mode separately where the current UI supports it.
- [ ] Show ElevenLabs engine choice only when ElevenLabs is selected.
- [ ] Keep the selected KB/agent configuration visually and logically separate from provider selection.
- [ ] Resolve the effective provider server-side on every new session.
- [ ] Do not modify KB rows when changing providers.

**Verification:** Switch an organization OpenAI → Gemini → ElevenLabs → Sarvam and verify the same KB/agent IDs are returned for each new session.

**Commit:** `feat(admin): add realtime provider switching`

---

# Phase 10 — Testing and Performance Validation

### Task 10.1: Provider regression matrix

**Required cases:**

```text
OpenAI Realtime
  - connect
  - RAG tool call
  - answer
  - interrupt
  - disconnect

Gemini Live
  - connect
  - RAG tool call
  - answer
  - interrupt
  - disconnect

Sarvam
  - existing supported voice flow
  - Clara chat/RAG
  - interrupt/cleanup

ElevenLabs Mode A
  - STT → Clara → TTS

ElevenLabs Mode B
  - existing Conversational AI + Clara RAG webhook

ElevenLabs Clara Realtime
  - Scribe partial
  - Scribe commit
  - Clara RAG
  - LLM stream
  - TTS stream
  - browser audio
  - interrupt
```

**Steps:**
- [ ] Add/extend tests without replacing provider-specific tests.
- [ ] Run the matrix after each provider-routing change.
- [ ] Treat duplicate answers and stale audio as correctness failures.

**Verification:** `npm test`, `npm run type-check`, and `npm run lint`.

**Commit:** `test(voice): cover complete provider regression matrix`

### Task 10.2: Clara KB consistency test

**Steps:**
- [ ] Create a test organization with a known KB and unique document facts.
- [ ] Run the same question through each provider path.
- [ ] Assert the resolved tenant/agent/KB/document/ragMode tuple is identical.
- [ ] Assert provider-specific transport may differ but the Clara knowledge source does not.
- [ ] Assert a cross-tenant KB cannot be selected by changing provider.

**Verification:** The test fails if any provider bypasses Clara's KB boundary.

**Commit:** `test(rag): enforce provider-independent knowledge binding`

### Task 10.3: Real-device latency benchmark

Measure:

```text
user stops speaking
  → Scribe committed
  → Clara turn accepted
  → RAG start/end
  → LLM first token
  → TTS first audio
  → browser first audio
```

Also record:

```text
mic speech start
  → Scribe first partial
```

**Steps:**
- [ ] Benchmark the current OpenAI Realtime path first and save its p50/p95 baseline.
- [ ] Benchmark new ElevenLabs Clara Realtime under the same network and KB.
- [ ] Test short answer, KB-heavy answer, tool-heavy answer and long answer.
- [ ] Test English and Tamil/English code-switching.
- [ ] Test background noise.
- [ ] Test interruption during RAG, LLM and TTS.
- [ ] Compare each stage rather than blaming Qdrant without evidence.
- [ ] Optimize the largest measured contributor before adding infrastructure.

**Acceptance rule:** Do not set an arbitrary production latency SLO before baseline data exists. The new ElevenLabs path must be judged by measured end-to-end TTFA and correctness, with the current OpenAI path serving as the regression reference.

**Commit:** `test(voice): record realtime provider latency baselines`

---

# Phase 11 — Rollout and Recovery

### Task 11.1: Staged enablement

**Stages:**
- [ ] Feature disabled by default.
- [ ] Internal/admin agents.
- [ ] Selected organization allowlist.
- [ ] Broader tenant rollout.
- [ ] General availability after regression and latency review.

**Rollback:**
- [ ] Disable `ELEVENLABS_REALTIME_ENABLED` or the organization feature flag.
- [ ] Existing OpenAI/Gemini/Sarvam/standard ElevenLabs paths remain selectable.
- [ ] Do not modify KB, document, agent or conversation data during rollback.

**Verification:** Rollback test returns a previously working provider without database repair.

**Commit:** `docs(voice): add realtime rollout and rollback runbook`

### Task 11.2: Final architecture review

**Checklist:**
- [ ] Clara is the common knowledge authority.
- [ ] Qdrant is accessed through Clara's existing tenant-bound retrieval.
- [ ] Provider selection never changes KB binding.
- [ ] OpenAI Realtime remains available.
- [ ] Gemini Live remains available.
- [ ] Sarvam remains available.
- [ ] ElevenLabs Mode A remains available.
- [ ] ElevenLabs Mode B remains available.
- [ ] ElevenLabs Clara Realtime is independently selectable.
- [ ] Standard voice remains available.
- [ ] Only committed Scribe turns invoke Clara.
- [ ] One active generation exists per session.
- [ ] Stale audio is discarded.
- [ ] Barge-in cancels playback and generation.
- [ ] No vendor secrets reach the browser.
- [ ] TTFA is observable end-to-end.
- [ ] `npm test`, `npm run type-check`, and `npm run lint` pass.

**Commit:** `docs(voice): finalize provider-switchable realtime architecture`

---

# Dependency Map

```
                         Clara Provider / Mode Resolver
                                   │
                ┌──────────────────┴──────────────────┐
                │                                     │
        interactionMode=standard              interactionMode=realtime
                │                                     │
          existing pipeline                    realtimeProvider
                                                        │
             ┌───────────────┬───────────────┬─────────┴──────────────┐
             │               │               │                        │
           OpenAI          Gemini          Sarvam                 ElevenLabs
             │               │               │                        │
       existing path    existing path   existing path        engine selection
             │               │               │                  ┌─────┴─────┐
             │               │               │              conversational clara-stream
             │               │               │                  │             │
             │               │               │             existing        NEW:
             │               │               │             Mode B      Scribe → Clara → TTS
             └───────────────┴───────────────┴──────────────────┬──────────────┘
                                                                │
                                                        Same Clara KB contract
                                                                │
                                                        tenant → agent → KB
                                                                │
                                                              Qdrant
```

Phases 4–6 can be developed in parallel after the gateway/session contract is frozen. Provider regression and performance validation must wait until the new path is integrated.

---

# Final Interfaces

The provider-neutral client surface should remain close to the existing `useVoiceClient` contract:

```ts
interface RealtimeVoiceSession {
  connect(): Promise<void>;
  sendAudio(pcm16: ArrayBuffer): void;
  sendText(text: string): void;
  interrupt(): void;
  disconnect(): void;

  onTranscriptPartial(cb: (text: string, generationId: string) => void): void;
  onTranscriptFinal(cb: (text: string, generationId: string) => void): void;
  onAssistantText(cb: (delta: string, generationId: string) => void): void;
  onAudio(cb: (pcm16: ArrayBuffer, generationId: string) => void): void;
  onToolEvent(cb: (event: ToolEvent, generationId: string) => void): void;
  onState(cb: (state: VoiceSessionState) => void): void;
  onError(cb: (error: VoiceError) => void): void;
}
```

Provider-specific implementations remain replaceable:

```text
StandardVoiceSession
OpenAIRealtimeSession              ← existing
GeminiLiveSession                  ← existing
SarvamRealtimeSession              ← existing
ElevenLabsConversationSession     ← existing
ElevenLabsClaraRealtimeSession    ← new
```

The key abstraction is **not** that every provider must share one conversation engine. The key abstraction is that every provider is bound to the **same Clara knowledge/authorization contract**.

---

# Definition of Done

- Standard non-realtime voice continues to work independently.
- Current OpenAI Realtime behavior remains functional and fast enough to serve as the regression baseline.
- Current Gemini Live behavior remains functional.
- Current Sarvam behavior remains functional.
- Current ElevenLabs Mode A remains functional.
- Current ElevenLabs Mode B remains functional.
- New ElevenLabs Clara Realtime uses Scribe v2 Realtime for live STT.
- Only committed Scribe turns invoke Clara reasoning.
- New ElevenLabs Clara Realtime uses Clara's existing tenant-bound KB/Qdrant/RAG pipeline.
- New ElevenLabs Clara Realtime uses Clara's selected LLM/tool/memory path.
- Clara assistant text streams into ElevenLabs TTS WebSocket.
- Browser receives streamed audio through Clara's server relay.
- One active generation exists per session.
- Multiple simultaneous answers are prevented.
- Interrupted/stale audio cannot be played.
- Provider switching does not change KB/agent/RAG/tool configuration.
- No ElevenLabs hosted KB is required for Clara grounding.
- No vendor API key reaches the browser.
- Metering and latency telemetry are provider-aware.
- `npm test`, `npm run type-check`, and `npm run lint` pass.
- Real-device p50/p95 TTFA measurements are recorded before broad rollout.

---

# Important Implementation Decision

The previous plan's phrase **"all providers use one Clara Agent Core"** is intentionally replaced here with:

> **All providers use one Clara knowledge, authorization, and grounding contract; provider-native realtime execution remains intact unless a provider is explicitly implemented through Clara-controlled execution.**

This is the critical correction.

It preserves the reason the existing OpenAI Realtime path is fast while allowing the new ElevenLabs path to solve the current slow pipeline and concurrent-answer problem without moving Clara's organizational knowledge into ElevenLabs.

The current OpenAI implementation already demonstrates the desired knowledge boundary: the provider can perform realtime conversation while Clara handles the `rag_search` tool server-side. The new ElevenLabs path extends that principle rather than replacing the existing provider architecture.

## Superpowers execution order

1. `superpowers:brainstorming` — architecture/requirements already clarified in this planning cycle.
2. `superpowers:writing-plans` — this document.
3. **Next:** user reviews and approves this plan.
4. Then choose one execution method:
   - `superpowers:subagent-driven-development` for task-by-task independent implementation/review.
   - `superpowers:executing-plans` for native implementation in this session.
5. Before claiming implementation completion: `superpowers:verification-before-completion`.
6. Before merging/finishing: `superpowers:requesting-code-review` and `superpowers:finishing-a-development-branch`.
