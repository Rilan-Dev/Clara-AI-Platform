# Clara Voice — Executable Provider Map (Task 1.2)

Built from the actual implementation (not the plans). Companion to
`docs/superpowers/plans/2026-09-20-clara-voice-production-implementation.md`.

Routing entry: `src/modules/assistant/core/hooks/useVoiceClient.ts` — calls all five
provider hooks unconditionally; `resolveProvider()` → `POST /api/voice/provider`
(platform JWT) or `POST /api/embed/session` (clr_ key) → `voiceProvider ?? provider`;
ElevenLabs mode split `pipeline | conversational` (embed keys never get Mode B);
Mode-B connect failure falls back to Mode A.

---

## 1. OpenAI Realtime — WORKING (regression baseline)

| Stage | Implementation |
|---|---|
| Browser hook | `useOpenAIRealtime.ts` — **WebRTC** (`RTCPeerConnection` + data channel `oai-events`); SDP answer fetched browser→`https://api.openai.com/v1/realtime/calls` with the **ephemeral** key from `/api/realtime/session` (or `/api/embed/session`). |
| Relay | None for the React app. `scripts/voice-relay.mjs` (`relayOpenAI`) serves only the standalone `public/embed/clara.js` script on upgrade path `/api/embed/voice` (attached by `scripts/start.mjs`). |
| STT | Native realtime transcription (`OPENAI_REALTIME_TRANSCRIPTION_MODEL` ?? `gpt-4o-mini-transcribe`); `input_audio_transcription.delta/.completed`. |
| Clara turn | `scheduleRag()` (300 ms debounce) → `performRagAndRespond()`: POST `/api/rag/search` (or `/api/embed/rag`) with `{query, kbId}` → context injected via `conversation.item.create` → **single** `response.create` (`tool_choice:"none"`, "FIX V3"). Secondary: model-initiated `rag_search` tool call → `handleToolCall()` → same route → `function_call_output` + `response.create`. |
| RAG | `src/modules/assistant/api/rag.ts` `postRagSearch()` — kbId mode: quota admission, `resolveAIConfig({kbId, surface:"rag-embedding"})`, Qdrant `searchKbCollection()`, topK 6, score 0.25, `diversifyByDocument`, optional graph RAG. |
| LLM | The realtime model itself (`OPENAI_REALTIME_MODEL` ?? `gpt-realtime-2.1-mini`) + `buildSystemPrompt` instructions. `/api/chat` NOT called. |
| TTS | Native realtime audio (`output_modalities:["audio"]`). |
| Playback | WebRTC `MediaStream` → hidden `<audio>` element. No client queue. |
| Interrupt | `response.cancel` + isSpeaking reset. VAD barge-in is passive (speech_started only resets turn refs; embed session sets `interrupt_response:false`). |
| Identity | Client-only turnId (`activeTurnIdRef`/`latestTurnIdRef`). No sessionId/generationId in the realtime protocol; per-turn latency telemetry added 2026-09-21 (gap-closure) — `LatencyTracker` + `clara:voice:latency` events, timings only. |

## 2. Gemini Live — WORKING

| Stage | Implementation |
|---|---|
| Browser hook | `useGeminiLive.ts` — session via `/api/gemini/session` (or `/api/embed/session`) → `{ realtime: { endpoint, token }, model, voice, instructions }` → browser builds `wss://<self>/api/voice/gemini/realtime?token=<hmac>` (gap-closure Phase D, 2026-09-21); mic via **AudioWorklet** (`/worklets/audio-recorder-worklet.js`), PCM16 flushed every 100 ms. |
| Relay | `scripts/gemini-relay.mjs` — transparent passthrough (mounted by `start.mjs`): verifies the session-minted HMAC token in-process, holds `GEMINI_API_KEY` server-side, pipes BidiGenerateContent frames verbatim both directions. The long-lived vendor key never reaches the browser. |
| STT | Native `inputAudioTranscription` → `serverContent.inputTranscription`. |
| Clara turn | Tool-call-only ("FIX G3/G7"): Gemini autonomously calls `rag_search` → hook POSTs `/api/rag/search` → `toolResponse.functionResponses[]` → Gemini resumes generation. |
| RAG | Same `/api/rag/search` endpoint as OpenAI. |
| LLM | `GEMINI_LIVE_MODEL` ?? `gemini-2.5-flash-native-audio-preview-12-2025` (native audio). |
| TTS | Native model audio: `modelTurn.parts[].inlineData` base64 PCM16 @24 kHz. |
| Playback | WebAudio gapless scheduler (`nextPlayTimeRef` + `playQueueRef`, dedicated 24 kHz AudioContext); `stopPlayback()` on `serverContent.interrupted`. |
| Interrupt | `stopPlayback()` + `activityStart`. |
| Identity | Client-only turnId. Session route requires platform auth + shared realtime rate bucket + plan guard; relay token is kb+org scoped, 60-minute TTL (`voice-core/api/gemini/realtime-auth.ts`). |

## 3. ElevenLabs Mode A (pipeline) — WORKING

| Stage | Implementation |
|---|---|
| Browser hook | `useElevenLabsVoice.ts` — `/api/voice/elevenlabs/session` descriptors → MediaRecorder webm/opus + client RMS VAD → batch STT per utterance → `/api/chat` → sentence-chunked TTS → PCM16 queue. |
| STT | **Batch** Scribe REST per utterance (`/api/voice/elevenlabs/transcribe` → vendor `POST /v1/speech-to-text`, `scribe_v1`). |
| Clara turn | `runAssistantTurn(question)` → `streamChatCompletion` → `/api/chat` (or `/api/embed/chat`) — server does RAG + LLM, NDJSON stream back. |
| RAG | Server-side inside `postChatKb()` — `resolveAIConfig({kbId, surface:"chat"})` + `searchKbEmbedded` topK 6 → context into system prompt. |
| LLM | `ProviderFactory.getProvider(...).chatStream()` (OpenAI/Gemini/Sarvam brain per `resolveAIConfig`). |
| TTS | **Sentence-by-sentence HTTP** (`splitSentences` → POST `/api/voice/elevenlabs/tts` → vendor `POST /v1/text-to-speech/{voiceId}?output_format=pcm_16000`). |
| Playback | WebAudio FIFO queue @16 kHz — **not generation-aware**; `interruptPlayback()` flushes whole queue (triggered by client VAD start or `interrupt()`). |
| Identity | Client-only turnId; `chatAbortRef`/`ttsAbortRef` AbortControllers. No sessionId passed to `/api/chat`. |

## 4. ElevenLabs Mode B (Conversational AI) — PARTIALLY WORKING (dark until flags+binding)

| Stage | Implementation |
|---|---|
| Browser hook | `useElevenLabsConvAI.ts` — `/api/voice/elevenlabs/agent-session` → `{signedUrl}` → direct browser→`wss://api.elevenlabs.io`; AudioWorklet PCM16 100 ms `{user_audio_chunk}`. |
| STT | Vendor-native VAD/turn-taking (`user_transcript`). |
| Clara turn | **No Clara turn** — the vendor agent IS the brain. Grounding via vendor server-tool → signed webhook `POST /api/internal/elevenlabs/tools/rag-search` (HMAC + org/kb/agent header binding + `elevenlabs_agents` org-ack). |
| RAG | Same retrieval as chat inside the webhook (`searchKbEmbedded` topK ≤ 8). |
| LLM | Vendor Conversational AI agent (bypasses Clara LLM stack). |
| TTS | Vendor-native streamed `audio` frames (PCM16 or μ-law). |
| Playback | WebAudio FIFO queue @16 kHz; `interruption` event drops queued tail. `interrupt()` is **local-only** (sends nothing to vendor). |
| Identity | `conversation_id` arrives in `conversation_initiation_metadata` but is dropped. Gated by `ELEVENLABS_ENABLED` + `ELEVENLABS_CONVERSATIONAL_AI_ENABLED` + agent binding + org ack + HMAC/webhook secrets. |

## 5. Sarvam — PARTIALLY WORKING (realtime STT + realtime TTS exist; gaps below)

| Stage | Implementation |
|---|---|
| Browser hook | `useSarvamVoice.ts` — `/api/voice/sarvam/session`; realtime mode when `stt.realtime` descriptor present (`SARVAM_REALTIME_STT_ENABLED`), else utterance fallback identical in shape to ElevenLabs Mode A. |
| STT (realtime) | Same-origin relay `/api/voice/sarvam/realtime` (`scripts/sarvam-relay.mjs`, attached by `start.mjs`) → upstream `wss://api.sarvam.ai/speech-to-text-realtime/ws` `saaras:v3-realtime`/`saaras:v4`, `stream_type=fast`, linear16, VAD endpointing (threshold 0.3, silence 500 ms). Browser token = HMAC `v1.<exp>.<kbId>.<orgId>.<sig>`. Partial + final transcripts. |
| STT (utterance) | Batch Saaras REST `/api/voice/sarvam/transcribe`. |
| Clara turn | `transcript_final` → `runAssistantTurn(text)` → `streamChatCompletion` → `/api/chat` with `realtimeVoice:true` (routes to `sarvam-105b-conversations` LLM + latency-tuned settings). Partial transcripts update live-caption UI only. Early barge-in on first partial during playback. |
| RAG | Server-side inside `/api/chat` (same as ElevenLabs Mode A). |
| TTS (realtime) | **Persistent Bulbul WebSocket relay** `/api/voice/sarvam/tts-realtime` (`scripts/sarvam-tts-relay.mjs`) — `{type:"text"|"flush", generationId}` in, generation-tagged `audio` frames out; interrupt closes upstream and reopens. **The only generation-aware audio path in the codebase.** |
| TTS (utterance) | Sentence-by-sentence HTTP `/api/voice/sarvam/tts` (Bulbul PCM16). |
| Playback | WebAudio FIFO queue @16 kHz; `interruptPlayback()` aborts TTS, stops sources, closes realtime TTS WS, nulls generation. |
| Capture | **AudioWorklet primary** (`connectWorkletPcm16Capture` — the shared worklet, 16 kHz capture context) with a narrowly scoped, observable ScriptProcessor fallback (gap-closure Phase B, 2026-09-21; duplicate-capture guarded). |
| Identity | `realtimeTtsGenerationRef` + session `GenerationCoordinator` + `GenerationPlaybackQueue` (2026-09-21 gap-closure: duplicate-session guard in `startRealtimeCapture`). No `vad.speech_start`-style events upstream historically — relay now forwards `vad_speech_start`/`vad_speech_end`; barge-in also rides early partials. |

## Relays & process wiring

- `scripts/start.mjs` hosts: `/api/embed/voice` (OpenAI+Gemini relay for `clara.js`), `/api/voice/sarvam/realtime` (STT relay), `/api/voice/sarvam/tts-realtime` (TTS relay), `/api/voice/gemini/realtime` (Gemini Live passthrough relay — Phase D, 2026-09-21), phone streams.
- `scripts/dev-relay.mjs` runs the OpenAI/Gemini relay standalone in dev (port 3001).
- `scripts/sarvam-relay.mjs`: 60-min lifetime cap, 120-s idle timeout, 20-s ping keep-alive, HMAC-guarded `realtime-init` + `realtime-meter` calls, metering per `transcript.final`.
- `scripts/sarvam-tts-relay.mjs`: warm Bulbul connection, reconnect-on-close (250 ms), `generation_start`/`text`/`flush`/`interrupt`/`ping` frames, `min_buffer_size:30`, `max_chunk_length:150`, linear16 @24 kHz.

## Existing identity seams (what Phase 2 builds on)

1. Client-only `turnId` in every hook (local `VoiceTurn.id` history only — never sent to a server).
2. `generationId` — Sarvam realtime TTS only (`realtimeTtsGenerationRef` + relay frame tagging).
3. `sessionId` plumbing exists in `streamChatCompletion` → `/api/chat` → `admitQueryEvent` (query-audit link) but **no voice caller passes it**.
4. Mode B `conversation_id` dropped client-side.
5. `voice-core` has zero session/generation/turn concepts today.

## Feature flags

`OPENAI_API_KEY`, `OPENAI_REALTIME_*` · `GEMINI_API_KEY/LIVE_MODEL/LIVE_VOICE` ·
`ELEVENLABS_ENABLED` (+key), `ELEVENLABS_CONVERSATIONAL_AI_ENABLED`,
`ELEVENLABS_TOOL_HMAC_SECRET`, `ELEVENLABS_WEBHOOK_SECRET` · `SARVAM_ENABLED` (+key),
`SARVAM_STT_MODEL`, `SARVAM_REALTIME_STT_MODEL`, `SARVAM_REALTIME_LLM_MODEL`,
`SARVAM_REALTIME_TTS_ENABLED`, `SARVAM_REALTIME_STT_ENABLED` · `RAG_MODE` etc.

## Test coverage today

No unit tests for any voice hook. Adjacent: `sentence-split`, `realtime-audio-config`,
`pcm-capture`, `voice-core` catalog/resolve/pricing/webhook-auth, `sarvam/realtime-auth`.
E2E scripts: `e2e-elevenlabs{,-modeb}.js`, `e2e-sarvam.js`, `visitor-tests/03-06`.

## Status matrix

| Path | Status |
|---|---|
| OpenAI Realtime | **working** — protected baseline (invariant 1.5) |
| Gemini Live | **working** |
| ElevenLabs Mode A | **working** (sentence-HTTP TTS, no generation identity) |
| ElevenLabs Mode B | **partially working** (flag/binding-gated; local-only interrupt) |
| Sarvam realtime | **working** (realtime STT/TTS shipped; AudioWorklet capture primary with observable fallback; Clara-side generation coordinator wired) |
