# Clara Sarvam AI Realtime Voice Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Clara's existing Sarvam voice integration from a partially realtime STT pipeline into a production-grade, low-latency realtime voice-agent path comparable in interaction quality to the planned ElevenLabs Clara Realtime path, while preserving the existing Sarvam standard voice pipeline and keeping Clara's tenant-bound KB/Qdrant/RAG/tool/memory layer authoritative.

**Architecture:** Sarvam supplies the realtime speech transport layer: Saaras Realtime STT for continuous input and Bulbul WebSocket TTS for streaming output. Clara remains responsible for tenant authorization, agent configuration, KB selection, Qdrant retrieval, grounding, tools, memory, policies, metering, and the selected LLM. Sarvam-105B may be selected as Clara's LLM provider when configured, but selecting Sarvam as the realtime voice provider must not force a different KB or move knowledge into Sarvam.

**Current repository branch:** `Vite-Converted`

**Current baseline commit inspected:** `79134dfebe2da82b33239ab5275bae525336fa7c`

**Primary existing files inspected:**
- `scripts/sarvam-relay.mjs`
- `src/modules/voice-core/api/sarvam/realtime.ts`
- `src/modules/assistant/core/hooks/useSarvamVoice.ts`
- `src/modules/voice-core/api/sarvam/session.ts`
- `src/modules/voice-core/api/sarvam/tts.ts`
- `src/modules/voice-core/providers/sarvam.ts`
- `src/modules/voice-core/model-catalog.ts`
- Sarvam integration/design documentation and environment configuration

---

# 1. Verified Sarvam API Architecture — September 2026

Sarvam now has a dedicated realtime STT WebSocket designed for voice agents and live transcription. The current official documentation identifies:

- `saaras:v3-realtime` as the default realtime model.
- `saaras:v4` as an available model on the realtime endpoint with the same connection/message protocol.
- True partial transcripts during speech.
- Millisecond-based VAD tuning.
- Server-side VAD endpointing and manual turn control.
- PCM raw audio support.
- Mid-call configuration updates.

Sarvam's documentation says the new realtime endpoint supersedes the older `/speech-to-text/ws` streaming API for new voice-agent work. citeturn2search6turn2search7

For TTS, Sarvam provides a persistent WebSocket endpoint specifically intended for conversational agents. The WebSocket can receive text incrementally and return audio chunks immediately, allowing a warm connection to handle multiple utterances. citeturn1view1turn1view2

### Recommended production configuration

| Function | Recommended model/API | Reason |
|---|---|---|
| Realtime STT | `saaras:v3-realtime` | Official realtime voice-agent model/default |
| STT alternative | `saaras:v4` on realtime endpoint | Newer model; benchmark before defaulting |
| TTS | `bulbul:v3` WebSocket | Streaming, persistent connection, lower TTFA |
| LLM | Clara-selected LLM | Keeps provider-independent Clara agent architecture |
| Optional LLM | `sarvam-105b` | Use only when Clara admin explicitly selects Sarvam as the LLM provider |

Sarvam's current model documentation still describes Saaras v3 as the default/recommended general STT model and Saaras v4 as the latest model; however, the dedicated realtime documentation should be treated as authoritative for the realtime endpoint/model combination. citeturn2search4turn2search6

**Important decision:** Do not automatically switch production STT to `saaras:v4`. First benchmark `saaras:v3-realtime` versus the available v4 realtime configuration under Clara's actual English/Tamil/code-mixed workload.

---

# 2. Current Repository Audit — Result

The current Sarvam implementation is **not empty and is not a failed integration**. It already contains a meaningful V5 realtime STT implementation, but it is **not yet a complete production realtime voice agent**.

## 2.1 What is already correctly implemented

### Realtime STT relay

`scripts/sarvam-relay.mjs` already provides:

```
Browser
  ↓ WebSocket
Clara Sarvam Relay
  ↓ WebSocket
Sarvam Saaras Realtime
```

It already has:

- server-side Sarvam API key handling;
- browser session HMAC token;
- server-side configuration resolution;
- same-origin browser WebSocket;
- partial transcript forwarding;
- final transcript forwarding;
- connection lifetime cap;
- idle timeout;
- upstream cleanup;
- metering;
- error handling.

This is a strong foundation and should be **extended, not replaced**.

### Clara KB boundary

The existing Sarvam session resolves the KB and uses the platform chat endpoint:

```
Sarvam STT
    ↓
transcript
    ↓
/api/chat or /api/embed/chat
    ↓
Clara RAG/Qdrant
    ↓
answer
    ↓
Sarvam TTS
```

The current implementation explicitly keeps documents/KBs inside Clara. That matches the target architecture.

### Existing provider selection

The database/provider model already supports:

```
openai
gemini
elevenlabs
sarvam
```

and the existing realtime provider migration includes Sarvam as a selectable provider.

Therefore this plan does **not** introduce a new provider-selection architecture.

---

# 3. Current Sarvam Gaps That Must Be Fixed

## Gap A — Realtime STT model identity is not cleanly separated

Current model catalog exposes:

```
saaras:v3
saaras:v4
```

while the realtime API documentation identifies:

```
saaras:v3-realtime
```

as the default realtime model.

The current relay also comments that the REST model IDs "carry over" to the realtime endpoint.

This must be corrected.

### Required change

Introduce explicit model configuration:

```
SARVAM_REALTIME_STT_MODEL=saaras:v3-realtime
```

and keep standard STT configuration separate:

```
SARVAM_STT_MODEL=saaras:v3
```

For the experimental v4 realtime path, support the exact model identifier documented by Sarvam and validate it server-side.

Do not silently reuse the standard REST STT model catalog for realtime.

---

## Gap B — Current realtime STT query parameters need alignment with current docs

The current relay builds a realtime URL containing:

```
encoding=linear16
sample_rate=16000
endpointing=vad
threshold=0.3
silence_duration_ms=500
min_speech_duration_ms=250
```

Current Sarvam documentation describes raw PCM using `input_audio_codec` values such as `pcm_s16le`, with 16 kHz recommended for realtime voice use. citeturn2search0turn2search6

### Required change

Make the relay use the current documented realtime parameter names and semantics, for example:

```
model=saaras:v3-realtime
sample_rate=16000
input_audio_codec=pcm_s16le
endpointing=vad
...
```

The exact accepted parameter names must be verified against the realtime endpoint at implementation time rather than copied from the legacy streaming API.

---

# 4. Gap C — Current TTS is NOT realtime TTS

This is the largest Sarvam implementation gap.

Current `useSarvamVoice.ts` does:

```
Clara streamed LLM text
       ↓
splitSentences()
       ↓
POST /api/voice/sarvam/tts
       ↓
Bulbul REST TTS
       ↓
complete audio response
       ↓
browser queue
```

That means the current Sarvam realtime mode is effectively:

```
Realtime STT
+
streaming Clara chat
+
sentence-by-sentence HTTP TTS
```

It is **not** a full bidirectional realtime voice-agent path.

Sarvam's current WebSocket TTS API is explicitly designed for voice agents: one persistent connection accepts text chunks and returns audio chunks progressively. citeturn1view2turn1view1

### Required architecture

```
Clara LLM text delta
        ↓
Sarvam Bulbul WebSocket
        ↓
audio chunk
        ↓
browser immediately
```

No sentence-by-sentence HTTP TTS calls in the new realtime mode.

---

# 5. Gap D — Current client uses ScriptProcessorNode

The existing realtime Sarvam hook uses:

```
createScriptProcessor()
```

The Clara platform already has an AudioWorklet infrastructure.

### Required change

Reuse the existing AudioWorklet PCM capture path for Sarvam realtime.

Do not create a second audio capture architecture.

Target:

```
Microphone
   ↓
AudioWorklet
   ↓
PCM16 16 kHz
   ↓
Sarvam relay
```

This reduces main-thread audio work and keeps OpenAI/ElevenLabs/Sarvam audio infrastructure consistent.

---

# 6. Gap E — Generation concurrency is incomplete

Current Sarvam code can start:

```
runAssistantTurn()
runAssistantTurn()
runAssistantTurn()
```

without a shared generation identity.

Current interruption aborts chat/TTS and clears playback, but there is no universal generation ID protecting against late callbacks.

This creates the same class of bug already identified in the ElevenLabs path:

**multiple or stale assistant responses can overlap.**

### Required invariant

```
one realtime session
        ↓
one active generation
        ↓
generationId
        ↓
new turn / interrupt
        ↓
invalidate old generation
        ↓
cancel old LLM/TTS
        ↓
discard stale audio
```

This must be solved before production rollout.

---

# 7. Target Sarvam Realtime Architecture

```
                         CLARA VOICE SESSION
                                │
                ┌───────────────┴────────────────┐
                │                                │
          Tenant/Agent                      Provider
          Authorization                     = Sarvam
                │                                │
                │                         Sarvam Adapter
                │                                │
                ▼                       ┌────────┴────────┐
          Clara KB/Qdrant               │                 │
          RAG + Tools + Memory          ▼                 ▼
                │                    Saaras            Bulbul
                │                 Realtime STT        TTS WS
                │                    │                 │
                │              partial/final          │
                │                    │                 │
                └──────────────► Clara Turn ◄─────────┘
                                  │
                              Selected LLM
                                  │
                              text deltas
                                  │
                                  ▼
                              Bulbul WS
                                  │
                              audio chunks
                                  │
                                  ▼
                               Browser
```

The important boundary is:

**Sarvam owns speech transport. Clara owns organizational intelligence and knowledge.**

---

# Phase 0 — Freeze Sarvam Realtime Contract

### Task 0.1 — Define Sarvam realtime capability

**Files:**
- existing voice provider types
- existing provider resolver
- new spec:
  `docs/superpowers/specs/2026-09-20-sarvam-realtime-voice.md`

**Steps:**
- [ ] Define `interactionMode=realtime`.
- [ ] Define `realtimeProvider=sarvam`.
- [ ] Define Sarvam realtime STT model independently from standard STT.
- [ ] Define Sarvam realtime TTS model.
- [ ] Define speaker/language configuration.
- [ ] Define sample rate and codec.
- [ ] Define VAD strategy.
- [ ] Define generation ID.
- [ ] Define interruption behavior.
- [ ] Define Clara KB/RAG/tool boundary.

**Verification:** Provider switching OpenAI/Gemini/ElevenLabs/Sarvam does not change the KB tuple.

**Commit:** `docs(sarvam): define realtime voice contract`

---

# Phase 1 — Correct Sarvam Model Catalog

### Task 1.1 — Separate standard and realtime STT models

**Files:**
- `src/modules/voice-core/model-catalog.ts`
- Sarvam resolver/config types
- tests

**Target:**

```ts
SARVAM_STT_MODELS
  saaras:v3
  saaras:v4

SARVAM_REALTIME_STT_MODELS
  saaras:v3-realtime
  // v4 realtime exact documented identifier
```

**Steps:**
- [ ] Keep standard REST STT unchanged.
- [ ] Add realtime-specific catalog.
- [ ] Add explicit default `saaras:v3-realtime`.
- [ ] Add v4 as a benchmark/opt-in model only after endpoint validation.
- [ ] Reject unsupported model IDs.
- [ ] Add configuration tests.

**Commit:** `feat(sarvam): separate realtime stt model catalog`

---

# Phase 2 — Rebuild the Saaras Realtime Relay Correctly

### Task 2.1 — Align wire protocol

**Files:**
- `scripts/sarvam-relay.mjs`
- `src/modules/voice-core/api/sarvam/realtime.ts`

**Steps:**
- [ ] Use the current Sarvam realtime WebSocket endpoint.
- [ ] Use `saaras:v3-realtime` by default.
- [ ] Use raw PCM16/16 kHz configuration.
- [ ] Verify `input_audio_codec=pcm_s16le`.
- [ ] Keep server-side API key.
- [ ] Keep HMAC session authentication.
- [ ] Keep tenant/KB server resolution.
- [ ] Forward partial transcripts.
- [ ] Forward final transcripts.
- [ ] Forward speech-start/speech-end/VAD events where useful.
- [ ] Forward structured vendor errors.
- [ ] Support server-side configuration updates where useful.

**Verification:** Raw browser PCM produces partial and final transcripts without vendor credentials reaching the browser.

**Commit:** `feat(sarvam): align realtime stt relay with current api`

### Task 2.2 — Optimize VAD for voice-agent interaction

Sarvam's realtime API supports millisecond VAD tuning and manual endpointing. citeturn2search6

**Initial configuration to benchmark:**

```
endpointing=vad
stream_type=fast
threshold=<measured>
silence_duration_ms=<measured>
min_speech_duration_ms=<measured>
```

**Steps:**
- [ ] Start with server VAD.
- [ ] Measure 300–700 ms silence behavior.
- [ ] Test Tamil, English and Tamil-English code mix.
- [ ] Test noisy microphone.
- [ ] Test rapid conversational turns.
- [ ] Test barge-in.
- [ ] Avoid adding browser VAD as a second competing turn detector.
- [ ] Use manual endpointing only if measured behavior requires it.

**Verification:** One spoken utterance produces one committed turn.

**Commit:** `tune(sarvam): optimize realtime voice endpointing`

---

# Phase 3 — Sarvam Streaming TTS WebSocket

### Task 3.1 — Create server-side Bulbul streaming adapter

**Files:**
- new focused Sarvam realtime TTS adapter
- existing `src/modules/voice-core/providers/sarvam.ts`
- existing model/config resolver
- tests

**Target:**

```
Clara text delta
       ↓
Sarvam TTS WS
       ↓
audio chunks
```

Sarvam documents this WebSocket as a persistent connection where text can be streamed in and audio chunks are returned incrementally. It is explicitly recommended for interactive voice agents. citeturn1view2

**Steps:**
- [ ] Open `wss://api.sarvam.ai/text-to-speech/ws` server-side.
- [ ] Use `bulbul:v3`.
- [ ] Configure language and speaker once per connection.
- [ ] Configure output codec suitable for browser low-latency playback.
- [ ] Use `linear16` where it simplifies the existing PCM playback path.
- [ ] Stream text deltas.
- [ ] Use flush/end-of-speech correctly.
- [ ] Handle completion events.
- [ ] Handle vendor errors.
- [ ] Ping long-lived connections.
- [ ] Reconnect only for recoverable network failures.
- [ ] Never retry auth/quota failures blindly.

Sarvam's TTS documentation specifies config, text, flush and ping messages and supports multiple output codecs including LINEAR16. citeturn1view2

**Verification:** One TTS WebSocket handles multiple answer turns and produces incremental audio chunks.

**Commit:** `feat(sarvam): add bulbul realtime tts websocket`

### Task 3.2 — Remove sentence-level HTTP TTS from realtime mode

**Files:**
- `useSarvamVoice.ts`
- new realtime TTS client/relay
- existing standard TTS route

**Steps:**
- [ ] Keep existing REST/HTTP TTS for standard mode.
- [ ] Keep existing `/api/voice/sarvam/tts` compatibility.
- [ ] New realtime mode uses only the TTS WebSocket.
- [ ] Stream LLM text directly.
- [ ] Do not call `splitSentences()` for realtime synthesis unless used only as an optional safety boundary.
- [ ] Do not make N TTS requests for N sentences.

**Verification:** A 5-sentence answer creates exactly one persistent TTS session.

**Commit:** `refactor(sarvam): stream realtime tts instead of sentence requests`

---

# Phase 4 — Clara Realtime Turn Orchestrator

### Task 4.1 — Preserve existing Clara RAG path

**Steps:**
- [ ] Continue using Clara `kbId`.
- [ ] Continue using existing `/api/chat` or a dedicated streaming agent service.
- [ ] Continue Qdrant retrieval through Clara.
- [ ] Continue tenant authorization.
- [ ] Continue tools/MCP authorization.
- [ ] Continue memory.
- [ ] Continue agent instructions.
- [ ] Continue selected LLM provider.
- [ ] Do not send documents or Qdrant data to Sarvam.

**Verification:** Same question + same KB produces the same grounding behavior in text chat and Sarvam realtime.

**Commit:** `test(sarvam): preserve clara knowledge boundary`

### Task 4.2 — Introduce realtime generation coordinator

**Files:**
- new shared realtime turn coordinator
- Sarvam realtime client
- existing voice types

**Steps:**
- [ ] Generate `generationId` for every committed user turn.
- [ ] Store only one active generation.
- [ ] Cancel previous generation before accepting a new one.
- [ ] Abort LLM stream.
- [ ] Cancel TTS stream.
- [ ] Clear browser playback.
- [ ] Ignore late RAG/LLM/TTS events.
- [ ] Ignore stale completion events.
- [ ] Ensure reconnect cannot resurrect old audio.

**Verification:** Two rapid turns never overlap.

**Commit:** `fix(voice): enforce single active generation for sarvam realtime`

---

# Phase 5 — Barge-In

### Task 5.1 — Use Sarvam speech-start as interruption signal

Sarvam's voice-agent guidance explicitly recommends using speech-start/VAD events as the cue to stop current TTS playback during barge-in. citeturn2search0

**Steps:**
- [ ] Subscribe to Sarvam speech-start event.
- [ ] Immediately invalidate current generation.
- [ ] Stop browser playback.
- [ ] Clear queued audio.
- [ ] Cancel Bulbul TTS stream.
- [ ] Abort active Clara generation where supported.
- [ ] Continue capturing the new user turn.
- [ ] Do not wait for final transcript to stop old audio.

**Verification:** User starts speaking while Clara is speaking → old speech stops immediately.

**Commit:** `feat(sarvam): add realtime barge-in cancellation`

---

# Phase 6 — Browser Audio Architecture

### Task 6.1 — Replace ScriptProcessor with existing AudioWorklet

**Steps:**
- [ ] Reuse `public/worklets/audio-recorder-worklet.js`.
- [ ] Produce mono PCM16 16 kHz.
- [ ] Batch approximately 50–100 ms of audio.
- [ ] Avoid main-thread base64 construction for every tiny frame.
- [ ] Use efficient ArrayBuffer → base64 conversion at the relay boundary.
- [ ] Keep browser audio playback compatible with the existing analyser/UI.

**Verification:** Stable microphone stream under CPU load and no audio dropouts.

**Commit:** `refactor(sarvam): use shared audio worklet for realtime capture`

---

# Phase 7 — Sarvam Realtime Hook

### Task 7.1 — Create provider-specific realtime session without breaking Mode A

**Files:**
- `src/modules/assistant/core/hooks/useSarvamVoice.ts`
- preferably new `useSarvamRealtime.ts` if the existing hook becomes too complex
- `useVoiceClient.ts`

**Modes:**

```
standard + sarvam
    ↓
existing Mode A

realtime + sarvam
    ↓
new Sarvam Realtime
```

**Steps:**
- [ ] Preserve standard Sarvam pipeline.
- [ ] Add realtime provider path.
- [ ] Preserve existing public voice hook contract.
- [ ] Render partial transcript.
- [ ] Render final transcript exactly once.
- [ ] Render assistant text deltas.
- [ ] Play streaming audio chunks.
- [ ] Support interrupt.
- [ ] Support disconnect.
- [ ] Support reconnect.
- [ ] Support sendText.
- [ ] Keep embed authentication.

**Verification:** Standard Sarvam remains unchanged when realtime is disabled.

**Commit:** `feat(voice-ui): add sarvam realtime session`

---

# Phase 8 — Provider Switching

### Task 8.1 — Sarvam must obey the same provider contract

**Required invariant:**

```
OpenAI
Gemini
ElevenLabs
Sarvam
      ↓
same:
tenant
agent
kbId
documentId
ragMode
tools
memory
authorization
      ↓
different:
realtime speech adapter
```

**Steps:**
- [ ] Verify Sarvam is selected through the existing `realtime_voice_provider`.
- [ ] Do not add a Sarvam-only KB path.
- [ ] Do not change KB when switching provider.
- [ ] Do not change RAG mode when switching provider.
- [ ] Do not bypass plan guards.
- [ ] Do not expose Sarvam API key.

**Verification:** Switch an organization OpenAI → Sarvam → ElevenLabs and inspect the resolved knowledge tuple.

**Commit:** `test(voice): verify sarvam provider switching invariants`

---

# Phase 9 — LLM / Sarvam-105B Configuration

Sarvam's platform currently exposes `sarvam-105b` as its flagship chat model, with Indian-language-oriented capabilities. Sarvam also documents newer open-source model options, but they should not automatically replace the existing Clara LLM configuration. citeturn0search1turn2search1

### Task 9.1 — Keep speech provider and LLM provider independent

Do **not** implement:

```
realtimeProvider = sarvam
        ↓
force brainProvider = sarvam-105b
```

Instead:

```
realtimeProvider = sarvam
brainProvider = existing selected Clara LLM
```

or, if explicitly configured:

```
realtimeProvider = sarvam
brainProvider = sarvam-105b
```

Both must use the same Clara KB/RAG.

**Steps:**
- [ ] Preserve existing brain provider resolver.
- [ ] Add Sarvam-105B as a selectable LLM only through existing LLM configuration.
- [ ] Benchmark Sarvam-105B separately from Sarvam voice latency.
- [ ] Do not mix speech-provider and LLM-provider configuration.
- [ ] Preserve provider switching semantics.

**Verification:** Sarvam voice + OpenAI LLM and Sarvam voice + Sarvam-105B both use the same KB.

**Commit:** `feat(ai): keep sarvam voice and llm provider selection independent`

---

# Phase 10 — Observability and Latency

### Task 10.1 — Instrument complete Sarvam pipeline

Measure:

```
mic speech start
      ↓
saaras first partial
      ↓
saaras final
      ↓
Clara turn start
      ↓
RAG start
      ↓
RAG complete
      ↓
LLM first token
      ↓
Bulbul first text
      ↓
Bulbul first audio
      ↓
browser first audio
```

Metrics:

```
STT partial latency
STT final latency
RAG latency
LLM first-token latency
TTS first-audio latency
TTFA
total turn latency
barge-in latency
```

**Steps:**
- [ ] Add `provider=sarvam`.
- [ ] Add `sttModel`.
- [ ] Add `ttsModel`.
- [ ] Add `generationId`.
- [ ] Add session ID.
- [ ] Avoid logging sensitive transcript content.
- [ ] Record p50/p95.

**Commit:** `feat(observability): instrument sarvam realtime latency`

### Task 10.2 — Compare Sarvam against existing OpenAI baseline

Run identical scenarios:

1. Short English question.
2. Tamil question.
3. Tamil-English code-mix.
4. KB-heavy question.
5. Tool-heavy question.
6. Long answer.
7. User interruption while speaking.
8. User interruption while assistant speaks.

Compare:

```
OpenAI Realtime
Sarvam Realtime
```

Do not assume Sarvam or Qdrant is the bottleneck. Identify the largest measured stage.

**Acceptance rule:** No production latency target is invented before the current OpenAI baseline and Sarvam measurements exist.

**Commit:** `test(sarvam): establish realtime latency benchmark`

---

# Phase 11 — Testing

### Task 11.1 — STT protocol tests

Test:

- [ ] partial transcript
- [ ] final transcript
- [ ] speech start
- [ ] speech end
- [ ] VAD
- [ ] reconnect
- [ ] authentication error
- [ ] quota error
- [ ] malformed event
- [ ] upstream disconnect

### Task 11.2 — TTS protocol tests

Test:

- [ ] connection
- [ ] config
- [ ] text delta
- [ ] multiple text chunks
- [ ] flush
- [ ] audio chunk
- [ ] completion event
- [ ] ping
- [ ] disconnect
- [ ] retryable network failure
- [ ] non-retryable quota/auth failure

### Task 11.3 — Generation tests

Test:

```
turn A
turn B quickly after A
interrupt during RAG
interrupt during LLM
interrupt during TTS
late audio from A
late completion from A
reconnect during A
```

Expected:

**Only B can produce current assistant audio after B begins.**

### Task 11.4 — Provider regression

Run:

```
OpenAI Realtime
Gemini Live
Sarvam Realtime
Sarvam Standard
ElevenLabs Standard
ElevenLabs Realtime
```

Existing providers must not regress.

**Verification:**

```
npm test
npm run type-check
npm run lint
```

**Commit:** `test(voice): add sarvam realtime regression matrix`

---

# Phase 12 — Rollout

### Stage 1

```
SARVAM_REALTIME_ENABLED=false
```

Existing Sarvam standard mode remains available.

### Stage 2

Enable only for internal/admin agents.

### Stage 3

Enable selected organization allowlist.

### Stage 4

Benchmark:

- TTFA
- STT accuracy
- barge-in
- duplicate responses
- connection stability
- cost
- Tamil/code-mix quality

### Stage 5

Broader rollout only after regression review.

Rollback must require only disabling the realtime feature; no KB or conversation migration should be necessary.

---

# Final Environment Configuration

Recommended separation:

```env
# Sarvam provider
SARVAM_ENABLED=false
SARVAM_API_KEY=
SARVAM_BASE_URL=https://api.sarvam.ai

# Standard voice pipeline
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_DEFAULT_SPEAKER=shubh

# New realtime voice pipeline
SARVAM_REALTIME_ENABLED=false
SARVAM_REALTIME_STT_MODEL=saaras:v3-realtime
SARVAM_REALTIME_TTS_MODEL=bulbul:v3
SARVAM_REALTIME_SAMPLE_RATE=16000
SARVAM_REALTIME_INPUT_CODEC=pcm_s16le
SARVAM_REALTIME_STREAM_TYPE=fast

# Realtime VAD — benchmarked values, not blindly hard-coded
SARVAM_REALTIME_ENDPOINTING=vad
SARVAM_REALTIME_VAD_THRESHOLD=
SARVAM_REALTIME_SILENCE_DURATION_MS=
SARVAM_REALTIME_MIN_SPEECH_DURATION_MS=
```

The exact realtime V4 model identifier and final VAD values must be verified during implementation against the then-current Sarvam realtime API rather than copied from legacy streaming configuration.

---

# Final Target Data Flow

## User → Clara

```
Microphone
   ↓
AudioWorklet
   ↓
PCM16 / 16 kHz
   ↓
Clara Sarvam Relay
   ↓
Saaras Realtime
   ↓
partial transcript
   ↓
final transcript
   ↓
Clara Turn Coordinator
```

## Clara reasoning

```
final transcript
      ↓
Tenant / Agent authorization
      ↓
KB resolver
      ↓
Qdrant
      ↓
Grounded context
      ↓
Tools / Memory
      ↓
Selected Clara LLM
      ↓
streaming text
```

## Clara → User

```
streaming text
      ↓
Bulbul WebSocket
      ↓
audio chunks
      ↓
Clara relay
      ↓
browser playback
```

---

# Definition of Done

- Sarvam standard voice remains functional.
- Sarvam realtime is independently selectable.
- `saaras:v3-realtime` is the explicit default realtime STT model.
- Standard `saaras:v3/v4` configuration is not confused with realtime configuration.
- Raw PCM16 16 kHz is correctly sent to the current realtime STT API.
- Partial transcripts are delivered immediately.
- Only one committed transcript creates one Clara turn.
- Clara remains the KB/Qdrant/RAG authority.
- Sarvam never receives Clara documents or Qdrant indexes.
- Existing Clara tools and memory remain available.
- Bulbul v3 uses a persistent WebSocket for realtime TTS.
- LLM text streams into TTS instead of sentence-by-sentence HTTP synthesis.
- Audio starts before the complete answer is generated where the pipeline allows it.
- Barge-in immediately stops old audio.
- One active generation exists per realtime session.
- Stale audio/text/completion events are discarded.
- Sarvam API credentials remain server-side.
- Existing OpenAI/Gemini/ElevenLabs paths remain untouched except for shared safety abstractions.
- Provider switching does not modify tenant/agent/KB/RAG configuration.
- Sarvam LLM selection is independent from Sarvam speech selection.
- p50/p95 TTFA is measured.
- Sarvam realtime is compared against the current OpenAI realtime baseline.
- `npm test`, `npm run type-check`, and `npm run lint` pass.

---

# Critical Architectural Conclusion

The current Sarvam implementation is **approximately halfway to the target**:

```
                    CURRENT
                       │
        ┌──────────────┴──────────────┐
        │                             │
   Saaras Realtime STT          Bulbul HTTP TTS
        │                             │
   partial/final                  sentence calls
        │                             │
        └──────── Clara Chat/RAG ─────┘
                       │
                    Browser
```

The target is:

```
                     TARGET
                        │
              Sarvam Realtime Adapter
                        │
             ┌──────────┴──────────┐
             │                     │
       Saaras Realtime          Bulbul WS
          streaming             streaming
             │                     ▲
             ▼                     │
          Clara Turn ── LLM text ──┘
             │
       ┌─────┼─────┐
       ▼     ▼     ▼
      RAG   Tools Memory
       │
     Qdrant
```

So **we should not rewrite Sarvam from zero**.

The correct Superpowers implementation strategy is:

**keep the existing Sarvam realtime STT relay → correct its current API/model contract → replace sentence-level HTTP TTS with persistent Bulbul WebSocket TTS → introduce the same generation/cancellation model used for the ElevenLabs realtime design → reuse Clara's existing RAG/LLM/tool/memory pipeline → benchmark against the current OpenAI Realtime path.**

This preserves the work already completed while turning Sarvam into a genuine realtime voice-agent provider.
