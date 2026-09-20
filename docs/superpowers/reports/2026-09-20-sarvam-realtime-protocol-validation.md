# Sarvam Realtime Protocol Validation (Tasks 5.1 + 5.2)

Validated against the **current** documentation (fetched 2026-09-20):
`https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/realtime-streaming`
(August 2026 "Realtime API for voice agents and live transcription" guide).

## Task 5.1 — Standard vs realtime STT configuration

The separation is confirmed in code and matches the docs exactly:

| Config | Env var | Default | Used by |
|---|---|---|---|
| Standard (batch) STT | `SARVAM_STT_MODEL` | `saaras:v3` | `/api/voice/sarvam/transcribe` (utterance mode) |
| Realtime STT | `SARVAM_REALTIME_STT_MODEL` | `saaras:v3-realtime` | realtime relay (`/api/voice/sarvam/realtime`) |

- Documented realtime model ids: **`saaras:v3-realtime` (default) and `saaras:v4`**
  — identical to `SARVAM_REALTIME_STT_MODEL_IDS` in `model-catalog.ts`.
- `toSarvamRealtimeSttModel()` translates batch ids (`saaras:v3`) to the
  realtime variant; the relay re-validates as the last line of defense
  (`toRealtimeModel`).
- Lock tests: `model-catalog.test.ts` ("Saaras realtime model mapping") +
  `realtime-wire.test.ts` ("documented realtime model ids").

## Task 5.2 — Realtime STT wire protocol alignment

Endpoint + query parameters (relay vs docs):

| Wire element | Relay | Docs | Status |
|---|---|---|---|
| Endpoint | `/speech-to-text-realtime/ws` | same | ✅ |
| `language_code` | normalized (incl. `od-IN`→`or-IN`) | required, 24 codes, Odia changed to `or-IN` | ✅ (fix applied) |
| `model` | `saaras:v3-realtime`/`saaras:v4` | same two ids | ✅ |
| `stream_type` | `fast` | `fast` = lowest-latency partials, recommended for conversational agents | ✅ |
| `encoding` | `linear16` | default `linear16` (mono) | ✅ |
| `sample_rate` | `16000` (8000 allowed) | `8000`/`16000` only, else close `4000` | ✅ |
| `endpointing` | `vad` | `vad` (default) | ✅ |
| `threshold` | `0.3` | default `0.3` | ✅ |
| `silence_duration_ms` | `500` | default `500` | ✅ |
| `min_speech_duration_ms` | `250` | default `250` | ✅ |
| Auth | `api-subscription-key` header | same | ✅ |
| Audio frames | `{"event":"audio_input","audio":"<base64>"}` | same | ✅ |
| Keepalive | 20 s `ping` | "send periodic pings" (close `1008` otherwise) | ✅ |
| Partial events | `transcript.partial` | same | ✅ |
| Final events | `transcript.final` | same | ✅ |
| Errors | `error{code,is_fatal,message}` | same | ✅ |
| Close codes | passthrough | `1003` rate-limit · `1008` inactivity · `1011` internal · `4000` invalid param | ✅ |

**Gaps found and fixed in this task:**

1. **`vad.speech_start` / `vad.speech_end` were not forwarded.** The docs'
   #1 best practice: *"Drive barge-in off `vad.speech_start` or early
   partials, not `transcript.final`."* The relay now forwards both first-class
   (`vad_speech_start` / `vad_speech_end`) and `useSarvamVoice` interrupts
   playback the moment the vendor VAD detects user speech — this also
   addresses the historical "can't hear the user barge-in" symptom.
2. **`session.end` (with `audio_duration_s`) now forwarded** — the
   server-authoritative billed audio per the docs ("Reconcile billing against
   `session.end.audio_duration_s`").
3. **`session.begin` and `pong` are intentionally swallowed** (noise; the
   relay already signals `status=connected` on upstream open).
4. **Odia language code translation** (`od-IN` → `or-IN`) — this endpoint
   renamed the code; legacy configs keep working.
5. **`sample_rate` hard-clamped to 8000/16000** — any other value closes the
   vendor connection with code 4000.

Lock tests: `src/modules/voice-core/api/sarvam/realtime-wire.test.ts` (10 tests
covering the full browser frame contract).

## Acceptance (plan Task 5.2)

```
microphone → PCM16 (16 kHz) → Saaras realtime WS (fast stream)
          → transcript_partial (live captions + early barge-in)
          → transcript_final (exactly one Clara turn)
```

The browser→relay→vendor chain is implemented; end-to-end confirmation runs in
Phase 11 (real-device validation) with the same device/network conditions.
