# Realtime Listening and Latency Design

**Goal:** Make Clara's realtime voice assistant more reliable in noisy environments and reduce end-to-end turn latency while preserving project/tenant language, voice, and AI isolation.

## Current findings

- The realtime client uses WebRTC and sends browser microphone audio to OpenAI.
- `useOpenAIRealtime.ts` already disables the competing automatic response path and performs one RAG request before `response.create`.
- RAG currently waits for retrieval before model speech, so retrieval latency is directly visible to the user.
- Project-resolved `allowedLanguages`, `defaultLanguage`, voice, realtime model, and transcription model are already exposed by `/api/embed/voice-init`.
- The current client needs explicit audio-capture constraints, VAD/transcription instrumentation, and stronger stale-response/turn handling.
- Latency should be measured by stage before changing thresholds so improvements are evidence-based.

## Design

### 1. Audio capture

Use browser media constraints for `echoCancellation`, `noiseSuppression`, and `autoGainControl` where supported. Treat these as project/runtime configuration with conservative defaults, not hard-coded assumptions. Record which constraints were actually accepted by the browser.

### 2. Language-aware listening

The project allowlist remains authoritative. The realtime session receives the resolved default language and allowed-language guidance. Recognition and response instructions must explicitly prohibit switching to an unassigned language. Unsupported-language speech should receive a response in the project default language rather than causing an uncontrolled language switch.

### 3. Turn detection

Use server VAD with configurable threshold, prefix padding, silence duration, and eagerness where supported by the selected realtime model. Defaults should favor avoiding premature cut-off in noisy/mobile environments. Do not globally increase silence duration without measurement.

### 4. Response lifecycle

Maintain one response per user turn. Ignore stale events after cancellation/reconnect. Keep transcription and response state keyed to the active turn. Never let an old RAG request inject context into a newer turn.

### 5. Latency

Instrument:

- connection start/ready
- speech started/stopped
- transcription completed
- RAG start/end
- embedding/search/graph timing where available
- response created
- first text/audio delta
- response completed

Compute time-to-first-audio and total turn latency. Parallelize independent server work, reuse resolved AI configuration, cap retrieval results/context, and avoid duplicate embedding/search calls.

### 6. RAG

Keep tenant/project filtering before retrieval. Use the smallest useful top-K and context budget configured by the project. Run graph retrieval concurrently with vector retrieval when graph RAG is enabled. Do not wait for optional graph retrieval when it cannot improve the answer materially.

### 7. Tests

Add unit tests for language boundaries, audio configuration, VAD configuration, turn cancellation, and latency telemetry. Add API/integration tests for voice-init configuration and RAG timing. Add a deterministic realtime event-sequence test that verifies a noisy/pause-heavy turn does not produce duplicate responses or lose the final transcription.

## OpenAI documentation basis

The implementation follows the current OpenAI Realtime/WebRTC event model and official platform guidance. Realtime/audio model availability and pricing should be treated as dynamic; model/voice IDs must remain resolved from the platform catalog rather than hard-coded in tenant configuration.
