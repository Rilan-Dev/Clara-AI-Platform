
---

## 5. Target Architecture

### 5.1 Module tree (changes and additions)

```
src/modules/ai-core/
  types.ts                        # AIProvider += "sarvam"; EMBEDDING_UNSUPPORTED error type
  factory.ts                      # createProvider case "sarvam"
  providers/sarvam.ts             # NEW — SarvamProvider (chatStream via /v1/chat/completions)
  providers/sarvam.test.ts        # NEW — adapter unit tests (mocked fetch)
  model-catalog.ts                # SARVAM_CHAT_MODELS + pattern heuristics + INR→USD costs
  resolve.ts                      # embeddingProvider split + sarvam env defaults
  config-types.ts                 # ResolvedAIConfig.embeddingProvider; OrgAISettings sarvam fields

src/modules/voice-core/
  types.ts                        # VoiceProvider += "sarvam"; SarvamSpeaker DTO
  factory.ts                      # createVoiceService case "sarvam"
  providers/sarvam.ts             # NEW — SarvamVoiceProvider (Saaras STT + Bulbul TTS)
  providers/sarvam.test.ts        # NEW
  model-catalog.ts                # SARVAM_TTS_MODELS, SARVAM_STT_MODELS, SARVAM_SPEAKERS,
                                  #   isSarvamEnabled(), getSarvam*() env getters, caps
  resolve.ts                      # sarvam defaults + speaker resolution
  pricing.ts                      # sarvamTtsCostUsdMicros / sarvamSttCostUsdMicros
  metering.ts                     # provider field on usage writers
  api/sarvam/
    status.ts                     # GET  — health probe (super-admin)
    session.ts                    # POST — capability payload (planGuard + rate bucket)
    transcribe.ts                 # POST — Saaras STT (multipart, caps, SARVAM_STT_RATE)
    tts.ts                        # POST — Bulbul TTS (WAV→PCM strip, SARVAM_TTS_RATE)
    voices.ts                     # GET  — static speaker catalogue
    preview.ts                    # POST — short preview (SARVAM_PREVIEW_RATE)
  api/provider.ts                 # routing lookup: voiceProvider "sarvam" → mode "pipeline"

src/modules/language-core/        # NEW MODULE (V4)
  types.ts                        # LanguageService { translate, transliterate, identifyLanguage }
  providers/sarvam.ts             # SarvamLanguageProvider (/translate, /transliterate, /identify-language)
  factory.ts / model-catalog.ts / pricing.ts / metering.ts
  api/translate.ts / transliterate.ts / identify.ts

src/app/api/
  admin/sarvam/status/route.ts    # re-export
  voice/sarvam/{session,transcribe,tts,voices,preview}/route.ts   # one-line re-exports
  language/{translate,transliterate,identify}/route.ts            # V4

src/components/admin/
  ai-settings-options.ts          # BRAIN_PROVIDERS += sarvam; SARVAM_* option lists;
                                  #   COMMON_LANGUAGES → 22 Indic entries; sarvamTts/SttOptions()
  OrgAIConfigEditor.tsx           # Sarvam brain card + Sarvam voice card + speaker picker
  PlatformEnvPanel.tsx            # Sarvam section in AI tab (keys, defaults, flags)

src/modules/admin-ui/api.ts       # AIProvider / VoiceProvider unions += "sarvam"

src/modules/assistant/core/hooks/
  useVoiceClient.ts               # RuntimeProvider += "sarvam" → useSarvamVoice
  useSarvamVoice.ts               # NEW — Mode A pipeline (clone of useElevenLabsVoice wiring)

scripts/
  validate-model-config.mjs       # mirror SARVAM_CHAT_MODELS catalogue
  e2e-sarvam.js                   # NEW — guarded-or-success acceptance suite (V6)
```

### 5.2 Resolution layer — the exact change points

```
resolveAIConfig({ kbId?, orgId?, surface })
  ├─ provider      : org override → agent → org → env            ("sarvam" now legal)
  ├─ chatModel     : catalogue-validated, per allowed-lists       (SARVAM_CHAT_MODELS)
  ├─ embeddingModel: unchanged — backbone catalogues only
  └─ NEW embeddingProvider:
        provider === "sarvam"
          ? SARVAM_EMBEDDING_FALLBACK_PROVIDER (default "openai")
          : provider
      → surfaces "rag-embedding" | "embed" build their factory config
        from embeddingProvider; sources.embeddingProvider records the split.
```

`resolveVoiceConfig()` — identical shape to ElevenLabs, one new arm:

```
voiceProvider = kbOverride.voiceProvider → agent → org → NULL (inherit brain)
  sarvam arm:
    ttsModel   = org.sarvamTtsModel  ?? env SARVAM_TTS_MODEL    (bulbul:v3)
    sttModel   = org.sarvamSttModel  ?? env SARVAM_STT_MODEL    (saaras:v3)
    speaker    = assistant voice → org.defaultSarvamSpeaker → env → "shubh"
    kill switch: isSarvamEnabled() (SARVAM_ENABLED AND key present)
```

### 5.3 Session payload (never keys)

```json
POST /api/voice/sarvam/session →
{
  "provider": "openai",
  "voiceProvider": "sarvam",
  "mode": "pipeline",
  "sarvam": {
    "tts": { "model": "bulbul:v3", "speaker": "shubh", "sampleRate": 16000,
             "maxCharsPerRequest": 2500, "supportedLanguages": ["hi-IN", "ta-IN", "..."] },
    "stt": { "model": "saaras:v3", "mode": "transcribe",
             "maxAudioSeconds": 30, "formats": ["webm", "wav", "mp3", "ogg", "flac", "m4a"] }
  },
  "languages": ["en-IN", "hi-IN", "ta-IN"]
}
```

### 5.4 Sarvam API surface map (wire truth for the adapter)

| Clara call | HTTP | Sarvam endpoint | Notes |
|---|---|---|---|
| `chatStream` | POST | `https://api.sarvam.ai/v1/chat/completions` | OpenAI-compatible; `stream:true`; usage arrives in the final chunk (`choices` empty — guard before indexing); beta models use `/v2/chat/completions` |
| `transcribeAudio` | POST | `/speech-to-text` | multipart `file`, `model` (`saaras:v3`\|`saaras:v4`), `mode`, optional `language_code`; ≤30 s; formats WAV/MP3/AAC/AIFF/OGG/OPUS/FLAC/MP4/AMR/WMA/WebM; raw PCM (16 kHz) needs `input_audio_codec`; response `{request_id, transcript, timestamps, diarized_transcript, language_code, language_probability}` |
| `speak` | POST | `/text-to-speech` | JSON `{text, language_code, model, speaker, speech_sample_rate, pace?}`; ≤2 500 chars; WAV bytes out; sample rates 8k/16k/22.05k/24k (+32k/44.1k/48k REST-only); `pace` 0.5–2.0 |
| `listVoices` | — | static | 38 Bulbul v3 speakers (see §14) — no API call |
| health probe | POST | `/v1/chat/completions` (`max_tokens: 1`) | Sarvam publishes **no** credits/subscription REST endpoint (dashboard-only) — probe with a 1-token completion; a 200 ⇒ `connected:true`; 401/403 ⇒ bad key; 429 ⇒ reachable but throttled |
| realtime STT | WS | `GET /speech-to-text-realtime/ws?language_code=…&model=saaras:v3-realtime&stream_type=fast&encoding=linear16&sample_rate=16000&endpointing=vad&threshold=0.3&silence_duration_ms=500&min_speech_duration_ms=250` | client→server `{"event":"audio_input","audio":"<base64>"}`; server→client `transcript.partial` / `transcript.final` / `error{code,is_fatal,message}`; `config.update` mid-stream; close codes documented (4000 = bad sample rate) |
| `translate` | POST | `/translate` | `sarvam-translate:v1` (22 langs) / `mayura:v1`; `{input, source_language_code, target_language_code, model}` |
| `transliterate` | POST | `/transliterate` | script conversion (romanized ↔ native) |
| `identifyLanguage` | POST | `/identify-language` | returns language code + confidence |

Auth on every call: `api-subscription-key: <key>` header (not Bearer).

---

## 6. Platform Endpoint Plan

| Endpoint | Method | Purpose | Guards | Metering |
|---|---|---|---|---|
| `/api/admin/sarvam/status` | GET | Key presence + probe + configured defaults | super-admin | — |
| `/api/voice/sarvam/session` | POST | Capability payload for Mode A | `planGuard("voice")` → `REALTIME_SESSION_RATE` → `resolveVoiceConfig` | — |
| `/api/voice/sarvam/transcribe` | POST | Utterance → text (multipart) | auth/embed-key → `SARVAM_STT_RATE` (30/min/org) → caps (30 s vendor / 120 s platform / 25 MB) → server-side re-resolution | `logSttUsage` (seconds) |
| `/api/voice/sarvam/tts` | POST | Sentence chunk → PCM 16 kHz | auth/embed-key → `SARVAM_TTS_RATE` (60/min/org) → `planGuard("tts")` → char caps (2 500 vendor / 2 000 platform) → re-resolution | `logTtsUsage` (chars) |
| `/api/voice/sarvam/voices` | GET | Speaker catalogue (org-scoped view) | auth | — |
| `/api/voice/sarvam/preview` | POST | ≤300-char studio preview | `SARVAM_PREVIEW_RATE` (10/min/org) | `logTtsUsage` |
| `/api/voice/sarvam/realtime` | WS | **V5** — relay: browser PCM ⇄ Saaras realtime WS, partials pushed to client | session token minted by `/session` variant → one upstream socket per client | `logSttUsage` on each `transcript.final` |
| `/api/language/translate` | POST | **V4** — text translation | auth → rate → `SARVAM_TRANSLATION_ENABLED` | `logTranslationUsage` (chars) |
| `/api/language/transliterate` | POST | **V4** | auth → rate | `logTranslationUsage` |
| `/api/language/identify` | POST | **V4** | auth → rate | `logTranslationUsage` |

Session-binding discipline (unchanged from ElevenLabs): every voice route
re-resolves config server-side from org/agent/kb context; the client payload
is advisory only; keys never appear in any response; CORS/OPTIONS handlers
live in the route modules themselves (the proxy-level CORS block removal of
2026-09 made this the single source of truth).

---

## 7. Limits & Usage — Parity Contract

Sarvam must be indistinguishable from ElevenLabs in every governance surface.
Acceptance checklist (each item has an e2e assertion in `e2e-sarvam.js`):

| Contract | Sarvam behaviour |
|---|---|
| Plan feature gate | `planGuard(orgId, "voice"/"tts"/"stt")` before any vendor call; 402 with machine-readable `code` on limit |
| Plan budgets | Reuses the provider-agnostic `max_tts_chars_day` / `max_stt_audio_sec_day` columns — shared pool across ElevenLabs + Sarvam per org |
| Rate buckets | `SARVAM_STT_RATE` 30/min/org; `SARVAM_TTS_RATE` 60/min/org; `SARVAM_PREVIEW_RATE` 10/min/org; 429 + `Retry-After` + `RATE_LIMITED` |
| Request caps | TTS 2 000 chars platform (2 500 vendor); preview 300; STT 30 s vendor / 120 s platform / 25 MB |
| Kill switch | `SARVAM_ENABLED` AND key present ⇒ enabled; otherwise 400 `SARVAM_DISABLED` at resolution, 503 at vendor call — 404-free graceful degradation identical to ElevenLabs |
| Usage events | TTS/STT rows in `usage_events` with `provider='sarvam'`, amount = chars / audio-seconds; chat rows in `query_events` with model + tokens + `cost_usd_micros` |
| Dashboards | Org voice-metering aggregate picks up Sarvam rows with no dashboard change (same kinds, same columns) |
| Quota warnings | 80 % soft warning event flows through the existing `quota_warning` chat-stream event |
| Audit | Settings mutations audited via the existing platform-audit writer with `provider='sarvam'` context |

New plan column (V4 only): `max_translation_chars_day` (default −1 dormant) +
`planGuard("translation")`.

---

## 8. Client Implementation

### 8.1 Voice hook

`useSarvamVoice.ts` is a thin re-skin of the ElevenLabs Mode A hook — the
pipeline shape is identical:

```
mic → MediaRecorder webm/opus utterances
    → POST /api/voice/sarvam/transcribe        (Saaras)
    → existing chat stream route                (brain: any provider, incl. sarvam-105b)
    → splitSentences()
    → queued POST /api/voice/sarvam/tts         (Bulbul, PCM 16 kHz)
    → playback queue with barge-in
```

`useVoiceClient.ts` routing: `payload.voiceProvider === "sarvam"` →
`useSarvamVoice`. `RuntimeProvider` union gains `"sarvam"`. No CSP change is
required in V1–V4 (all vendor traffic is server-side). **V5** adds the realtime
relay: `/api/voice/sarvam/realtime` is a server-proxied WebSocket (the Sarvam
key never reaches the browser), so still no `connect-src` additions for vendor
hosts — only our own origin's `wss:` which is already allowed.

### 8.2 Read-aloud & embed widget

The existing read-aloud affordance and embed voice screens route through
`useVoiceClient` — they pick up Sarvam automatically. The widget design panel
gains the Sarvam speaker picker (fed by the static catalogue — no sync button
needed, unlike ElevenLabs).

### 8.3 Voice sandbox / preview

`VoiceSandboxPreview` and `VoicePreviewModal` gain a Sarvam tab: pick speaker +
language + (V4) translate toggle → preview via `/api/voice/sarvam/preview`.

---

## 9. Language Services & Cross-Lingual RAG (V4)

The feature that no incumbent provider mix gives Clara today.

### 9.1 The pipeline

```
User query (any language, incl. code-mixed Hinglish)
  │
  ├─ identifyLanguage()                     (only when ambiguous)
  ├─ transliterate()                        (romanized Indic → native script —
  │                                          Bulbul/Saaras quality depends on native script)
  ├─ translate(query → KB language)         (org opt-in: SARVAM_TRANSLATION_ENABLED + org flag)
  │
  ├─ RAG retrieval + chat (unchanged, in KB language)
  │
  └─ translate(answer → user language)      (org opt-in, streamed sentence-wise
                                             where possible; falls back to whole-answer)
```

### 9.2 Configuration surface

- Org setting: `translation_mode` = `off` (default) | `query` (translate query
  only — retrieval quality, English answers) | `query+answer` (full round-trip)
- Assistant `language` field gains the full 22-language Indic set (BCP-47 codes
  matching Saaras/Bulbul exactly: `hi-IN`, `bn-IN`, `ta-IN`, `te-IN`, `gu-IN`,
  `kn-IN`, `ml-IN`, `mr-IN`, `pa-IN`, `od-IN`, `ur-IN`, `ne-IN`, `kok-IN`,
  `ks-IN`, `sd-IN`, `sa-IN`, `sat-IN`, `mni-IN`, `brx-IN`, `mai-IN`, `doi-IN`,
  `as-IN`, `en-IN`)
- `allowed_languages` chips in the assistant-defaults editor pick up the same list
- Phone/voice surfaces: Bulbul `language_code` is derived from the existing
  brain-language chain — Hindi caller, Hindi voice, English KB: the cross-lingual
  path makes this coherent for the first time.

### 9.3 Cost control

Translation is billed per character (₹20/10K). The pipeline enforces:
query-translation cap (2 000 chars), answer-translation cap (4 000 chars),
`planGuard("translation")` daily budget, per-org rate bucket, and a per-request
kill decision (`translation_mode=off` skips all calls). Metering writes
`TRANSLATION` usage rows with char counts; the org dashboard gains a small
"Language services" card in the voice-metering panel.

---

## 10. Phone Integration (V5)

Saaras is **tuned for 8 kHz telephony audio** — the phone bridge becomes the
best-quality Indic phone surface available to Clara:

- `CallHandler` gains a `sarvam-pipeline` variant: Twilio mulaw 8 kHz →
  decode → Saaras REST STT (`mode=transcribe`, utterance-windowed server-side
  exactly like the Mode A bridge) → chat + RAG (existing internal
  `/api/embed/search` injection) → `splitSentences` → Bulbul TTS at
  `speech_sample_rate=8000` → resample path already in
  `src/modules/phone/providers/twilio.ts`.
- Alternatively (same phase): server-side realtime — pipe the call's PCM16
  into a single `saaras:v3-realtime` socket per call
  (`encoding=mulaw&sample_rate=8000` supported natively!), consuming
  `transcript.final` events as turn boundaries. This removes the
  utterance-window heuristic entirely.
- Vonage L16 16 kHz path uses `encoding=linear16&sample_rate=16000`.
- Keyterm prompting (v4): the KB's top entity names (≤50) are passed as the
  `prompt` parameter so brand/domain terms transcribe correctly.
