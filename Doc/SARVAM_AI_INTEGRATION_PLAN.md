# Sarvam AI Integration Plan

**CLARA AI PLATFORM** — Indic-First Brain, Voice & Language Provider Architecture

Revision 1.0 · September 2026 · For Internal Planning Use

---

## 1. Executive Summary

This document defines the implementation plan for integrating **Sarvam AI** into
the Clara AI Platform as the platform's **fourth first-class provider**, alongside
OpenAI, Gemini and ElevenLabs — and, uniquely, as the platform's first
**Indic-first** stack covering chat, speech and language services for the Indian
market.

Sarvam AI is India's sovereign full-stack AI platform (api.sarvam.ai). Its Model
APIs cover the exact surface Clara needs, behind a single API key:

| Capability | Sarvam model | Coverage |
|---|---|---|
| Chat / reasoning (brain) | `sarvam-105b` (128K ctx), `sarvam-105b-conversations` (32K) + hosted open-source models (`gemma4`, `deepseekv4-flash`, `glm5.3`) | 10 most-spoken Indian languages + English; native script, romanized and code-mixed input |
| Speech-to-text | `saaras:v3` (default) / `saaras:v4` (latest) / `saaras:v3-realtime` (WebSocket) | 23 languages (22 Indian + English), 8 kHz telephony-optimized, code-mixed speech |
| Text-to-speech | `bulbul:v3` | 11 languages (10 Indian + English), 38 speaker voices, 8–48 kHz |
| Translation | `sarvam-translate:v1` (22 languages) / `mayura:v1` (11 languages) | En↔Indic + inter-Indic, formal style, numeral format control |
| Transliteration & language ID | `/transliterate`, `/identify-language` | 22 Indian languages |

The defining business constraint, stated by the product owner:

> *"Adapt and satisfy the business needs — we are adding an additional provider
> so the platform scales to Indian-language customers, on Indian
> infrastructure, at Indian price points."*

This drives three central architectural decisions:

**Decision 1 — Sarvam joins the BRAIN axis (unlike ElevenLabs).**
`AIProvider` extends to `"openai" | "gemini" | "sarvam"`. Sarvam's chat API is
OpenAI-compatible (`POST /v1/chat/completions`), so the adapter is thin — but
**Sarvam publishes no embeddings API**. The resolution layer therefore gains an
*embedding capability split*: when a tenant selects Sarvam as its thinking
provider, embeddings continue to execute on the platform's embedding backbone
(OpenAI by default). Existing Qdrant collections stay valid — switching a
tenant's brain to Sarvam **does not re-embed anything**.

**Decision 2 — Sarvam joins the VOICE axis in pipeline mode (Mode A).**
`VoiceProvider` extends to `"openai" | "gemini" | "elevenlabs" | "sarvam"`.
Saaras STT + Bulbul TTS slot into the exact server-side pipeline
infrastructure built for ElevenLabs (transcribe → chat → sentence-split → TTS
PCM playback). Sarvam has **no signed-agent Conversational API** (its "Voice
Agents" Samvaad product is a separate no-code platform, not an embeddable
runtime), so there is **no Mode B equivalent** — pipeline only.

**Decision 3 — a new LANGUAGE axis (the strategic differentiator).**
Sarvam's translation / transliteration / language-identification services are
productised as a new `language-core` module, enabling **cross-lingual RAG**
(a tenant's KB lives in English; users ask in Hindi/Tamil/code-mixed Hinglish;
Clara translates the query, retrieves, and answers in the user's language)
and Indic language support across assistant configuration. This is the feature
no incumbent provider combination currently gives Clara.

The work is structured into **7 sequential phases (V0–V6)**, each independently
testable and deployable. Estimated scope: **~32 working days (~6–7 weeks)**;
V0–V3 (brain + voice + metering parity) deliver in roughly **3.5 weeks**.

---

## 2. Current State Audit

Ground truth from the repository (branch `Vite-Converted`, post `568983d`,
including the ElevenLabs V0–V6 program and the settings-UI unification).

### 2.1 Brain axis (ai-core)

| File | Role |
|---|---|
| `src/modules/ai-core/types.ts` | `AIProvider = "openai" \| "gemini"`; `LLMProvider` interface (`chatStream`, `embedText`, `embedBatch`, `getModelName`, `getEmbeddingDimension`) with `onUsage` metering hook |
| `src/modules/ai-core/factory.ts` | `ProviderFactory` switch (`createProvider`), instance cache keyed by config JSON, server-only |
| `src/modules/ai-core/providers/openai.ts` | OpenAI SDK adapter; `stream_options.include_usage`; reasoning-model helpers |
| `src/modules/ai-core/providers/gemini.ts` | `@google/genai` adapter; Matryoshka dimension pinning |
| `src/modules/ai-core/model-catalog.ts` | Canonical chat/embedding catalogues with USD pricing, pattern heuristics, `validateModelField`, `estimateChatCostUsdMicros` |
| `src/modules/ai-core/resolve.ts` | `resolveAIConfig()` — precedence **kb_override → agent_settings → org → env**, `allowedProviders` enforcement, `sources` audit trail, surface flags |
| `src/modules/ai-core/config-types.ts` | `OrgAISettings`, `KBAIOverrides`, `ResolvedAIConfig`, `AISurface = chat \| rag-embedding \| realtime \| embed` |

DB enforcement of the current two-provider world:

- `013_org_ai_settings.sql`: `default_provider CHECK IN ('openai','gemini')`, `allowed_providers <@ ARRAY['openai','gemini']`
- `014_kb_ai_overrides.sql`: `provider CHECK IN ('openai','gemini')`
- `033_elevenlabs_voice.sql`: `voice_provider CHECK IN ('openai','gemini','elevenlabs')` on `org_ai_settings`, `agent_ai_settings`, `kb_ai_overrides`; `organisation_voices_provider_check` widened the same way

### 2.2 Voice axis (voice-core — post `9e58953` refactor)

`src/modules/voice-core/` mirrors ai-core file-for-file: `types.ts`
(`VoiceProviderService` + optional `ConversationalVoiceService`, duck-typed),
`factory.ts` (`VoiceProviderFactory` — one file in `providers/` + one case in
the switch), `model-catalog.ts` (TTS/STT catalogue + kill switches + caps),
`resolve.ts` (`resolveVoiceConfig()` with NULL-inherits-brain precedence),
`pricing.ts`, `metering.ts`, `api/elevenlabs/*` handlers re-exported by
`src/app/api/voice/elevenlabs/*/route.ts`.

Mode A pipeline (client): `useVoiceClient.ts` → `useElevenLabsVoice.ts` —
mic → webm/opus utterances → `POST /api/voice/elevenlabs/transcribe` → chat
stream → `splitSentences` → queued `POST /tts` (PCM 16 kHz,
`audio/octet-stream`, `X-ElevenLabs-Model` / `X-ElevenLabs-Voice` headers) →
playback with barge-in.

### 2.3 Language surface today

- `src/components/admin/ai-settings-options.ts` → `COMMON_LANGUAGES` — a
  short hand-maintained list (en, si, ta, hi, …) feeding assistant default /
  allowed-language pickers. No translation, transliteration or language-detection
  capability exists anywhere in the platform. Chat is strictly
  same-language-in / same-language-out: a Hindi question against an English KB
  silently degrades retrieval.
- `src/modules/assistant` language chain: assistant `language` →
  `resolveVoiceConfig` → TTS `languageCode`. Only ElevenLabs carries a
  multilingual TTS flag today.

### 2.4 Limits, metering & plan budgets (the contract Sarvam must honour)

| Mechanism | Behaviour |
|---|---|
| `planGuard(orgId, "tts"/"stt")` | Plan feature + budget columns `max_tts_chars_day` / `max_stt_audio_sec_day` (migration 033) — **provider-agnostic**, already shared |
| `usage_events` | Append-only; kinds `EMBEDDING / TTS / OCR / TRANSCRIPTION / CONVERSATION`; `prompt_tokens` column reused as usage amount (chars / audio-seconds) |
| `query_events` | Chat metering: model, provider, tokens, `cost_usd_micros` |
| Rate buckets | `REALTIME_SESSION_RATE` 10/h/org; `ELEVENLABS_STT_RATE` 30/min/org; `ELEVENLABS_TTS_RATE` 60/min/org; `ELEVENLABS_PREVIEW_RATE` 10/min/org |
| Voice caps | TTS 2 000 chars/request, preview 300, STT 120 s / 25 MB, PCM 16 kHz output |
| Runtime settings | `loadRuntimeSettings()` boot-loads `platform_env_settings` into `process.env`; admin writes via HMAC-confirmed `/api/platform/env` |

---

## 3. Critical Design Review

### 3.1 Sarvam as a chat brain — with the embedding capability split

The obvious hazard: `LLMProvider` is monolithic (chat **and** embeddings).
Sarvam publishes **no embeddings endpoint**. Three options were considered:

| Option | Verdict |
|---|---|
| (a) Reject Sarvam from the brain axis until it ships embeddings | ✗ Throws away the headline feature (Indic chat quality) for a gap nobody asked Sarvam to fill |
| (b) `SarvamProvider.embedText` internally delegates to a private OpenAI/Gemini instance | ✗ Hides the fallback; metering and the `sources` audit trail would lie about which vendor ran; violates the platform's "re-resolution is explicit" discipline |
| **(c) Explicit capability split in the resolver** | ✓ Chosen |

**Chosen design (c):** `ResolvedAIConfig` gains `embeddingProvider: AIProvider`
and the resolver routes embedding execution independently of the brain:

```ts
// resolve.ts (conceptual)
if (provider === "sarvam") {
  embeddingProvider = parseProvider(env.SARVAM_EMBEDDING_FALLBACK_PROVIDER ?? "openai");
  sources.embeddingProvider = `${embeddingProvider} (fallback — sarvam has no embeddings API)`;
}
```

- Surfaces `rag-embedding` / `embed` resolve their provider as
  `embeddingProvider` (not the brain provider) → the factory never receives a
  Sarvam config for embedding work.
- `SarvamProvider.embedText/embedBatch` throw a typed
  `EMBEDDING_UNSUPPORTED` error — a unit test proves the resolver never routes
  an embedding surface to Sarvam, so the throw is a guardrail, not a behaviour.
- **Qdrant collections remain valid.** Embedding dimensions are pinned to the
  backbone (1536 / 3072 / 768 — unchanged); a tenant flipping its brain to
  Sarvam keeps its existing vector collections byte-identical. This is the
  single most important migration-safety property of the whole plan.
- Org model allow-lists keep their existing semantics: chat-model lists gain
  Sarvam entries; embedding-model lists remain OpenAI/Gemini-only
  (`validateModelField` already rejects provider/model mismatches, so a
  `sarvam-105b` in an embedding field fails with `provider_model_mismatch`).

This is the same architectural move the ElevenLabs program made for voice —
*split the capability from the vendor choice* — applied to embeddings.

### 3.2 Sarvam as a voice provider — pipeline only (no Mode B)

Sarvam's speech stack slots into `VoiceProviderService` cleanly:

- `saaras` REST STT is utterance-shaped (multipart in, JSON transcript out) →
  exactly what `transcribeAudio()` needs; 8 kHz telephony tuning is a bonus for
  the phone bridge.
- `bulbul:v3` TTS is request/response (JSON in, WAV out) → `speak()` requests
  16 kHz WAV and strips the RIFF container server-side to raw PCM, dropping
  into the existing playback queue **unchanged** (same `audio/octet-stream`
  contract, `X-Sarvam-Model` / `X-Sarvam-Speaker` headers).
- Bulbul voices are **enumerable string speakers** (`shubh`, `priya`, …), not
  opaque 17–25 char IDs — the voice catalogue is a static list; no DB sync
  round-trip, no `sarvam_voices` table, no per-org voice sync job.

**No Mode B.** Sarvam's "Voice Agents" (Samvaad) is a hosted no-code platform
(deployments, campaigns, outbound calls, analytics dashboards) — not a
signed-URL embeddable runtime like ElevenLabs Conversational AI. Exposing it
would mean proxying an entire external agent platform, duplicating what Clara
already is. OUT of scope; revisited only if Sarvam ships an embeddable agent
SDK with RAG tool-calling (see §17).

**What Sarvam gives Mode A that is genuinely new:** `saaras:v3-realtime`
WebSocket STT with true partial transcripts, VAD tuning in milliseconds, and
mid-stream reconfiguration. ElevenLabs Mode A currently pays a full
utterance-round-trip before the user's words exist as text. V5 upgrades the
Sarvam pipeline to stream partials to the client for live captions and
faster barge-in — a capability Mode A on ElevenLabs does not have.

### 3.3 A third axis: language-core

Translation must **not** be buried inside the chat route as an if-statement.
It is a platform capability with its own lifecycle (org opt-in, its own
metering kind, its own kill switch), so it gets a module like the other axes:

```
src/modules/language-core/
  types.ts          # LanguageService interface + DTOs
  providers/sarvam.ts   # SarvamLanguageProvider (translate / transliterate / identify)
  factory.ts        # LanguageProviderFactory
  model-catalog.ts  # translate models + kill switches + caps
  pricing.ts        # per-10K-char costs → usdMicros
  metering.ts       # TRANSLATION / TRANSLITERATION usage_events writers
  api/              # route handlers re-exported by src/app/api/language/*
```

### 3.4 Data boundary matrix

Sarvam's stack is **self-hosted in India** (their own models, their own
infrastructure — not a third-party reseller), which is a compliance asset:
data residency in India, aligned with DPDP Act expectations for Indian
enterprise tenants. The boundary discipline mirrors ElevenLabs Mode A:

| Data | Leaves the platform? | Destination |
|---|---|---|
| Documents, chunks, embeddings, KB metadata | **Never** | — (RAG runs inside Clara; retrieval results are re-injected as prompt context) |
| User spoken audio (STT) | Yes, per utterance | Saaras STT endpoint |
| Final answer text (TTS) | Yes, per sentence chunk | Bulbul TTS endpoint |
| User query text / answer text (translation) | Yes, when org enables cross-lingual RAG | Translate endpoint |
| Prompts, system prompts, retrieved chunks | No (V1–V3); V4 optionally translates the **query** only, by explicit org opt-in | — |

Org-facing disclosure: the org settings panel states plainly which text/audio
crosses the Sarvam boundary when Sarvam is selected — the same acknowledgement
pattern ElevenLabs Mode B uses (`org_acknowledged_data_flow`), applied as a
read-only explainer for pipeline mode (no gate required — no agent-side
storage exists).

### 3.5 Rejected alternatives (recorded for posterity)

- **Single "sarvam-everything" provider flag** — one org switch that flips
  chat + embeddings + voice + translation together. Rejected: orgs must be able
  to mix (Sarvam brain + ElevenLabs voice; OpenAI brain + Sarvam voice for
  Indic callers; Sarvam voice + translation with an OpenAI brain). The
  per-axis resolution the platform already has is the whole point.
- **Using the official `sarvamai` JS SDK** — rejected for the same reason the
  ElevenLabs program dropped `@elevenlabs/client`: a plain-`fetch` adapter is
  self-contained, dependency-free, trivially mockable in vitest, and immune to
  SDK breaking changes. The SDK's wire format is OpenAI-compatible JSON anyway.
- **`/v2/chat/completions` beta open-source models in V1** — `gemma4`,
  `deepseekv4-flash`, `glm5.3` are beta and rate-limit-whitelisted; catalogued
  but disabled by default (`SARVAM_BETA_MODELS_ENABLED=false`), enabled per
  platform decision.

---

## 4. Feature Inventory & Scope Decisions

| # | Sarvam capability | Decision | Phase | Rationale |
|---|---|---|---|---|
| 1 | Chat completions `sarvam-105b` (128K) | **IN** | V1 | The Indic brain; OpenAI-compatible adapter |
| 2 | `sarvam-105b-conversations` (dialogue-tuned) | **IN** | V1 | Default for voice-agent / chat surfaces |
| 3 | Streaming + usage-in-final-chunk | **IN** | V1 | `chatStream` contract + `onUsage` metering hook |
| 4 | Beta open-source models (`gemma4`, `deepseekv4-flash`, `glm5.3`) | **IN** (catalogued, flag-gated OFF) | V1 | Catalogue entries + kill switch; zero runtime cost |
| 5 | Function calling / structured outputs | **OUT** (documented) | — | Clara's chat pipeline is RAG-first; no tool loop exists today. Hook documented for future agentic work |
| 6 | Saaras STT REST (`saaras:v3`/`v4`, 5 output modes) | **IN** | V2 | `transcribe` mode for Mode A; `translate` mode powers cross-lingual V4 |
| 7 | Saaras realtime WS (`saaras:v3-realtime`, partials + VAD tuning) | **IN** | V5 | Latency + barge-in upgrade over utterance round-trips |
| 8 | Saaras batch API (≤2 h files, diarization) | **OUT** | — | Future: call-analytics ingestion (see §17) |
| 9 | Keyterm prompting (v4, ≤50 terms) | **IN** (config passthrough) | V5 | Bias recognition to tenant domain terms |
| 10 | Bulbul v3 TTS REST (38 speakers, 8–48 kHz) | **IN** | V2 | Core voice synthesis |
| 11 | Bulbul HTTP-stream / WebSocket TTS | **OUT** (v1) | — | REST + client-side sentence queue already hides latency; revisit if p95 first-audio regresses |
| 12 | Pronunciation dictionary CRUD | **OUT** | — | Future polish for brand-name audio |
| 13 | `sarvam-translate:v1` translation (22 languages) | **IN** | V4 | Cross-lingual RAG query path |
| 14 | `mayura:v1` translation | **IN** (secondary catalogue entry) | V4 | Cheap alternative, 11 languages |
| 15 | Transliteration API | **IN** | V4 | Hinglish/romanized query normalization for search |
| 16 | Language identification API | **IN** | V4 | Auto-detect query language; drives translation routing |
| 17 | Document Translation jobs | **OUT** | — | Future: bulk KB localization (§17) |
| 18 | Sarvam Vision / Doc AI OCR | **OUT** | — | Future: Indic OCR for the ingestion pipeline |
| 19 | Dubbing / Content Studio | **OUT** | — | Media product, not a platform capability |
| 20 | Voice Agents (Samvaad) platform + REST | **OUT** | — | Separate no-code product; no embeddable agent runtime (§3.2) |
| 21 | Embeddings | **N/A — does not exist** | — | Handled by the embedding capability split (§3.1) |

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

---

## 11. Database Migration Plan

One migration: `036_sarvam_provider.sql` (house style: additive-only,
`IF NOT EXISTS`, `DO $$ … EXCEPTION` guards for constraint swaps,
`ON CONFLICT (key) DO NOTHING` for seeds, `COMMENT ON` every object).

```sql
-- 036_sarvam_provider.sql
BEGIN;

-- 1. Brain-axis widenings (013 / 014 constraints)
ALTER TABLE org_ai_settings DROP CONSTRAINT IF EXISTS org_ai_settings_default_provider_check;
ALTER TABLE org_ai_settings ADD CONSTRAINT org_ai_settings_default_provider_check
  CHECK (default_provider IN ('openai', 'gemini', 'sarvam'));
ALTER TABLE org_ai_settings DROP CONSTRAINT IF EXISTS org_ai_settings_allowed_providers_check;
ALTER TABLE org_ai_settings ADD CONSTRAINT org_ai_settings_allowed_providers_check
  CHECK (allowed_providers <@ ARRAY['openai', 'gemini', 'sarvam']::TEXT[]
         AND cardinality(allowed_providers) > 0);
ALTER TABLE kb_ai_overrides DROP CONSTRAINT IF EXISTS kb_ai_overrides_provider_check;
ALTER TABLE kb_ai_overrides ADD CONSTRAINT kb_ai_overrides_provider_check
  CHECK (provider IN ('openai', 'gemini', 'sarvam'));

-- 2. Voice-axis widenings (033 constraints — DO $$ guards, exactly the 033 pattern)
DO $$
BEGIN
  ALTER TABLE org_ai_settings DROP CONSTRAINT org_ai_settings_voice_provider_check;
  ALTER TABLE org_ai_settings ADD CONSTRAINT org_ai_settings_voice_provider_check
    CHECK (voice_provider IN ('openai', 'gemini', 'elevenlabs', 'sarvam'));
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;
-- (same block for agent_ai_settings.voice_provider and kb_ai_overrides.voice_provider)

DO $$
BEGIN
  ALTER TABLE organisation_voices DROP CONSTRAINT organisation_voices_provider_check;
  ALTER TABLE organisation_voices ADD CONSTRAINT organisation_voices_provider_check
    CHECK (provider IN ('openai', 'gemini', 'elevenlabs', 'sarvam'));
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 3. Org-scoped Sarvam voice defaults (mirrors the elevenlabs_* columns of 033)
ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS sarvam_tts_model        TEXT,
  ADD COLUMN IF NOT EXISTS sarvam_stt_model        TEXT,
  ADD COLUMN IF NOT EXISTS default_sarvam_speaker  TEXT;

-- 4. Language services (V4)
ALTER TABLE org_ai_settings
  ADD COLUMN IF NOT EXISTS translation_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (translation_mode IN ('off', 'query', 'query+answer'));
ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_kind_check;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_kind_check
  CHECK (kind IN ('EMBEDDING', 'TTS', 'OCR', 'TRANSCRIPTION', 'CONVERSATION', 'TRANSLATION'));
ALTER TABLE subscription_plans        ADD COLUMN IF NOT EXISTS max_translation_chars_day INTEGER NOT NULL DEFAULT -1;
ALTER TABLE subscription_plan_versions ADD COLUMN IF NOT EXISTS max_translation_chars_day INTEGER NOT NULL DEFAULT -1;

-- 5. Platform env catalogue seeds (source of truth = admin Settings page)
INSERT INTO platform_env_settings (key, value, description, category, is_secret, requires_restart) VALUES
  ('SARVAM_ENABLED',                   'false',         'Master kill switch for the Sarvam provider',              'ai', false, false),
  ('SARVAM_API_KEY',                   '',              'Sarvam API subscription key (api-subscription-key)',       'ai', true,  false),
  ('SARVAM_BASE_URL',                  'https://api.sarvam.ai', 'Sarvam API base (SSRF-guarded)',                    'ai', false, false),
  ('SARVAM_TIMEOUT_MS',                '30000',         'Vendor timeout (STT uses 90s headroom)',                   'ai', false, false),
  ('SARVAM_CHAT_MODEL',                'sarvam-105b',   'Platform default chat model',                              'ai', false, false),
  ('SARVAM_BETA_MODELS_ENABLED',       'false',         'Expose beta open-source chat models (gemma4, glm5.3, deepseekv4-flash)', 'ai', false, false),
  ('SARVAM_TTS_MODEL',                 'bulbul:v3',     'Platform default TTS model',                               'ai', false, false),
  ('SARVAM_STT_MODEL',                 'saaras:v3',     'Platform default STT model',                               'ai', false, false),
  ('SARVAM_DEFAULT_SPEAKER',           'shubh',         'Platform default Bulbul speaker',                          'ai', false, false),
  ('SARVAM_EMBEDDING_FALLBACK_PROVIDER','openai',       'Embedding backbone when brain provider is sarvam',         'ai', false, false),
  ('SARVAM_TRANSLATION_ENABLED',       'false',         'Kill switch for language services',                        'ai', false, false),
  ('SARVAM_TRANSLATE_MODEL',           'sarvam-translate:v1', 'Default translation model',                          'ai', false, false),
  ('SARVAM_INR_TO_USD',                '0.012',         'INR→USD FX for cost estimation',                           'ai', false, false)
ON CONFLICT (key) DO NOTHING;

COMMIT;
```

Idempotency: every statement is add/drop-if-exists or seeded-on-conflict; the
`schema_migrations` ledger row makes re-runs impossible. **No table is
created** — Sarvam voices are a static catalogue, so there is deliberately no
`sarvam_voices` table and no sync job (an explicit simplification vs 033).

---

## 12. Security & Privacy Engineering

The ElevenLabs security invariants carry over verbatim; Sarvam-specific notes:

1. **Key handling** — `SARVAM_API_KEY` lives only in `platform_env_settings`
   (secret, masked `●●●●●●●●` in UI, never echoed by the env API) or
   process env; orgs never hold keys; adapters read via a lazy
   `requireApiKey()` → 503 `SARVAM_NOT_CONFIGURED` (never a vendor 401 leak).
2. **SSRF guard** — `getSarvamBaseUrl()` validates scheme+host against a
   pinned allow-list (default `https://api.sarvam.ai`); the base URL is
   operator-overridable for future self-hosted SageMaker endpoints, and is
   rejected if it points at private/link-local ranges (same guard as ElevenLabs).
3. **Vendor error sanitisation** — all vendor bodies are logged server-side
   only; clients receive `{error, code}` with our codes, never vendor JSON
   (which can echo request payloads).
4. **Data minimisation** — pipeline mode sends only utterance audio and
   sentence text; V4 translation sends only the query (≤2 000 chars) or the
   answer (≤4 000 chars); documents/chunks/embeddings never leave.
5. **India residency disclosure** — org settings show a plain-language data
   flow card when Sarvam is active (which fields/audio cross to
   api.sarvam.ai, hosted in India); audit rows record provider switches.
6. **Timeouts & retries** — `AbortController` 30 s default (chat 60 s, STT
   90 s); single retry on 429/503 with `Retry-After` respect; no retry on
   4xx.
7. **Rate limits & caps** — per-org buckets before every vendor call;
   request caps clamped server-side after re-resolution.
8. **Kill switches** — `SARVAM_ENABLED` (whole provider),
   `SARVAM_TRANSLATION_ENABLED` (language services),
   `SARVAM_BETA_MODELS_ENABLED` (beta models); all default OFF — deploys are
   dark launches.
9. **Audit** — settings mutations, provider switches, and per-request usage
   all flow through existing audited writers with tamper-evident hash chains
   (WS-1.4).
10. **Webhook posture** — Sarvam has no inbound webhooks in scope (no Mode B),
    so the ElevenLabs HMAC/nonce machinery is deliberately not replicated.
    If Voice Agents APIs are ever adopted (§17), the webhook-auth module is
    reused as-is.

---

## 13. Usage Metering & Pricing

Sarvam bills in INR. Clara's metering is USD micros — conversion happens once,
at estimation time, via `SARVAM_INR_TO_USD` (default 0.012; operator-tunable,
so cost dashboards stay honest when the rupee moves).

| Service | Sarvam list price | Clara unit | Cost function |
|---|---|---|---|
| Chat `sarvam-105b` / `-conversations` | ₹29.28 in / ₹10.98 cached / ₹73.2 out per 1M tokens | tokens | `estimateChatCostUsdMicros` (catalogue entries, INR→USD at catalogue build) |
| Chat `gemma4` (beta) | ₹36.6 / ₹13.73 / ₹91.5 per 1M | tokens | same |
| Chat `deepseekv4-flash` (beta) | ₹19.8 / ₹0.63 / ₹59.4 per 1M | tokens | same |
| Chat `glm5.3` (beta) | ₹126 / ₹23.4 / ₹396 per 1M | tokens | same |
| STT (Saaras) | ₹30 / hour (₹45 with diarization) | audio-seconds | `sarvamSttCostUsdMicros` — env override `SARVAM_STT_USD_PER_MIN` |
| TTS (Bulbul v3) | ₹30 / 10K chars | chars | `sarvamTtsCostUsdMicros` — env override `SARVAM_TTS_USD_PER_1K_CHARS` |
| Translate / transliterate | ₹20 / 10K chars | chars | `sarvamTranslateCostUsdMicros` — env override |
| Language ID | ₹3.5 / 10K chars | chars | same |

Rules inherited from the ElevenLabs pricing module: env override → catalogue
fallback; integer micro-dollars; metering failure never breaks a user request;
`usageAmount <= 0` rows are skipped; chat usage arrives via the provider's
`onUsage` hook (Sarvam's final stream chunk carries usage — the adapter guards
`chunk.choices` being empty before indexing, per the vendor docs).

Benchmark sanity (why the business case holds): `sarvam-105b` output at
₹73.2/1M tokens ≈ **$0.88/1M output tokens** — an order of magnitude below
typical frontier-model output pricing — with Indic quality that wins 90 % of
pairwise Indic comparisons per Sarvam's published benchmarks. STT at
₹30/h ≈ **$0.36/h**.

---

## 14. Admin UI Plan

All changes ride on the unified settings design system
(`settings-ui.tsx` kit + `ai-settings-options.ts` option lists) shipped in
`7b1754b` — the new panels are configured, not designed.

| Component | Change |
|---|---|
| `ai-settings-options.ts` | `BRAIN_PROVIDERS += { id: "sarvam", label: "Sarvam AI", blurb: "Sarvam-105B — Indic-first chat, 128K context (embeddings stay on platform backbone)" }`; `sarvamChatOptions()` from `SARVAM_CHAT_MODELS`; `VOICE_PROVIDER_OPTIONS += sarvam card`; `sarvamTtsOptions()` (`bulbul:v3/v2` with ₹/1K-chars meta); `sarvamSttOptions()` (`saaras:v3/v4`); `SARVAM_SPEAKERS` list; `COMMON_LANGUAGES` → 22 Indic + English entries with native-script labels |
| `OrgAIConfigEditor.tsx` | Sarvam brain card; "Sarvam settings" panel under the voice-provider section: TTS/STT `ModelSelect`s + speaker `ModelSelect` (no sync button — static catalogue); language chips pick up the Indic list |
| `PlatformEnvPanel.tsx` | `FIELD_METADATA` + `CATEGORY_KEYS.ai` entries for all `SARVAM_*` keys; "Voice provider (Sarvam)" section with `StatusPills` (connected / key missing / disabled), defaults, `SecretField` for the key; translation toggle; FX-rate field |
| `OrgAIConfigEditor` data flow | `PatchOrgAISettingsInput` gains `sarvamTtsModel`, `sarvamSttModel`, `defaultSarvamSpeaker`, `translationMode` — server-validated (`isSupportedTtsModel`-style checks against the Sarvam catalogue, 400 on mismatch) |
| `admin-ui/api.ts` | `AIProvider` / `VoiceProvider` unions += `"sarvam"` (the 4th duplicated type site) |
| `settings-screen.tsx` | No structural change — the unified editors absorb the new sections |
| Voice studio / sandbox | Sarvam tab: speaker + language pickers, preview button, per-speaker gender badges (catalogue metadata) |

The static speaker catalogue (38 Bulbul v3 voices, gender-tagged for the
picker):

```
shubh (m, default) · aditya (m) · ritu (f) · priya (f) · neha (f) · rahul (m)
pooja (f) · rohan (m) · simran (f) · kavya (f) · amit (m) · dev (m) · ishita (f)
shreya (f) · ratan (m) · varun (m) · manan (m) · sumit (m) · roopa (f) · kabir (m)
aayan (m) · ashutosh (m) · advait (m) · anand (m) · tanya (f) · tarun (m)
sunny (m) · mani (f) · gokul (m) · vijay (m) · shruti (f) · suhani (f)
mohit (m) · kavitha (f) · rehan (m) · soham (m) · rupali (f)
```

---

## 15. Implementation Phases

Every phase lands green: `vitest` + `tsc --noEmit` + eslint + production
build + phase e2e (mock mode where vendor keys are absent — CI never burns
credits). Commit discipline: one phase ≈ one commits-per-workstream series,
plan-first as in the ElevenLabs program.

### V0 — Foundations & migration (3 days)

- Migration `036_sarvam_provider.sql` (§11) — all widenings, columns, seeds.
- `voice-core/model-catalog.ts`: `SARVAM_TTS_MODELS` (bulbul:v3 ₹30/10K = $0.36/1K chars, 2 500 cap; bulbul:v2 legacy), `SARVAM_STT_MODELS` (saaras:v3 default, saaras:v4), `SARVAM_SPEAKERS`, caps (`SARVAM_STT_MAX_AUDIO_SECONDS = 30` vendor / 120 platform, `SARVAM_TTS_MAX_CHARS = 2000` platform), env getters (`isSarvamEnabled()`, `getSarvamApiKey/BaseUrl/TimeoutMs()`, `getPlatformDefaultSarvamTtsModel/SttModel/Speaker()`), `looksLikeSarvamSpeaker()`.
- `ai-core/model-catalog.ts`: `SARVAM_CHAT_MODELS` (5 entries incl. beta, INR pricing → USD at `SARVAM_INR_TO_USD`), pattern heuristics (`/^sarvam-/`, `/^bulbul:/`, `/^saaras:/`), `validateModelField` provider set extension.
- `scripts/validate-model-config.mjs` catalogue mirror + CI wiring.
- `.env.example` entries (Appendix A).
- **Accept:** migration applies idempotently on a snapshot DB; `validate-model-config` green; type-check/tests/lint/build green; zero runtime behaviour change (`SARVAM_ENABLED=false` everywhere).

### V1 — Brain axis: Sarvam chat provider (5 days)

- `ai-core/providers/sarvam.ts` — `SarvamProvider implements LLMProvider` via plain fetch: `chatStream` (SSE parse of `/v1/chat/completions`, `onUsage` from final chunk, `choices`-empty guard), `embedText/embedBatch` → typed `EMBEDDING_UNSUPPORTED`, `getProviderName/getModelName`; `sarvamFetch` with `api-subscription-key` header, `AbortController`, sanitized `SarvamError`.
- `factory.ts` case + `resolve.ts` embedding split (`embeddingProvider`, `sources.embeddingProvider`, `SARVAM_EMBEDDING_FALLBACK_PROVIDER`), `getProviderApiKey("sarvam")`, `getPlatformAIDefaults()` sarvam models record.
- `env.ts`: optional validation — `AI_PROVIDER=sarvam` requires `SARVAM_API_KEY` (same boot-refusal pattern as OpenAI/Gemini).
- Settings UI: brain card, model selects, platform defaults, status pill.
- `admin-ui/api.ts` + `ai-settings-options.ts` unions/lists.
- Unit tests: adapter stream/usage/error paths (mocked fetch); resolver split precedence + `sources` trail; `EMBEDDING_UNSUPPORTED` never reachable via `rag-embedding` surface.
- **Accept:** org switched to Sarvam brain chats end-to-end on a dev key (manual smoke); embeddings still execute on backbone (asserted by unit test + `query_events.provider='sarvam'` rows with correct token metering); settings round-trip persists; tsc/vitest/lint/build green.

### V2 — Voice axis: Saaras STT + Bulbul TTS (6 days)

- `voice-core/providers/sarvam.ts` — `SarvamVoiceProvider implements VoiceProviderService`: `getSubscriptionInfo()` (1-token chat probe → normalized health), `listVoices()` (static catalogue), `transcribeAudio()` (multipart, `mode`, optional `language_code`; map `{transcript, language_code, language_probability}` → `TranscribeResult`; duration from client hint clamped to caps), `speak()` (JSON body; request 16 kHz WAV; RIFF-parse and strip to raw PCM — chunk-length-aware, never assume 44-byte header; `X-Sarvam-Model`/`X-Sarvam-Speaker` response headers).
- `factory.ts` case; `resolve.ts` sarvam arm + speaker resolution chain.
- Routes `api/sarvam/{status,session,transcribe,tts,voices,preview}.ts` + app re-exports, with rate buckets, caps, planGuard, metering, CORS/OPTIONS handlers.
- `useVoiceClient.ts` routing + `useSarvamVoice.ts` Mode A hook; voice studio Sarvam tab; org settings Sarvam panel (TTS/STT/speaker pickers).
- Unit tests: WAV strip correctness (synthetic RIFF fixtures), provider resolution, route guard matrix.
- **Accept:** Mode A voice conversation works end-to-end on a dev key (manual smoke); e2e guard matrix (401/400/429/402/503) green in mock mode; org settings round-trip; dashboards show Sarvam voice usage rows.

### V3 — Metering, pricing & budget parity (4 days)

- `voice-core/pricing.ts` Sarvam cost functions + env overrides; `metering.ts` provider field; INR→USD conversion helper with cached FX.
- Shared budget enforcement (tts/stt `planGuard` across providers), 80 % soft warnings, dashboard aggregate verification.
- `query_events` chat cost rows for Sarvam models; catalogue price assertions in `model-catalog.test.ts`.
- **Accept:** simulated usage (unit level) produces correct micro-dollar rows for chat/STT/TTS; plan budget rejection at limit; dashboard voice panel aggregates Sarvam + ElevenLabs together; all existing suites still green.

### V4 — Language services & cross-lingual RAG (5 days)

- `language-core` module (types/factory/provider/catalog/pricing/metering/api) with `sarvam-translate:v1` + `mayura:v1`, transliterate, identify.
- Chat pipeline integration: query identify→transliterate→translate (per org `translation_mode`), answer translation; embed-search transliteration normalization (romanized query → native script before vector search).
- `COMMON_LANGUAGES` → 22 Indic entries; assistant defaults + allowed-language chips; org `translation_mode` setting (off/query/query+answer).
- `planGuard("translation")` + `max_translation_chars_day`; TRANSLATION usage rows; dashboard language-services card.
- **Accept:** Hindi question over English KB returns correct English-sourced Hindi answer on a dev key (manual smoke); translit normalization raises retrieval recall in a seeded test; translation off ⇒ zero vendor calls (asserted); metering rows correct.

### V5 — Realtime STT relay & phone bridge (5 days)

- `POST /api/voice/sarvam/realtime` WS relay: session-token handshake → one upstream `saaras:v3-realtime` socket per client (`stream_type=fast`, `endpointing=vad`, tuned `silence_duration_ms`), partials forwarded to client for live captions + early barge-in, `transcript.final` closes turns; STT metering per final; hard caps on socket lifetime (60 min) and idle (120 s).
- Client: `useSarvamVoice` realtime mode behind a session capability flag (graceful fallback to utterance mode).
- Phone: `CallHandler` sarvam-pipeline variant (Saaras STT 8 kHz + Bulbul 8 kHz TTS) and/or direct realtime socket per call; keyterm prompting from KB entities (≤50).
- **Accept:** p95 first-partial latency < 900 ms on a dev key (manual benchmark); phone smoke call round-trips Hindi; relay enforces auth/caps/metering (unit + e2e guards).

### V6 — Hardening, e2e & GA (4 days)

- `scripts/e2e-sarvam.js` — the guarded-or-success acceptance suite mirroring `e2e-elevenlabs.js`: status probe → settings round-trip (incl. invalid model → 400) → session resolution → transcribe/tts guard-or-payload → voices catalogue auth → translation guards → rate-limit 429 → plan-budget 402 → dashboard aggregates → state restore.
- `Doc/SARVAM_AI_INTEGRATION.md` operator runbook (env tables, going-live checklist, kill switches, data-flow disclosure copy, troubleshooting, INR pricing notes).
- Security review pass against §12 invariants; error-path fuzzing on the WAV parser; load test on the WS relay.
- Docs: README/docs index entries; AGENTS.md provider table update.
- **Accept:** full e2e matrix green (mock + live-key modes); runbook reviewed; all seven phases' suites green together; deploy checklist executed on staging.

**Total: ~32 working days.** Critical path: V0 → V1 → V2 (core brain+voice);
V4 is the differentiator; V3/V5/V6 harden and extend.

---

## 16. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sarvam rate limits (60 req/min Starter) throttle multi-tenant voice traffic | High early | Medium | Provision Pro/Business tier before GA; per-org buckets already cap fan-out; queue + `Retry-After` backoff in adapter; realtime WS collapses STT calls per session to one connection |
| No vendor subscription/credits API → blind spend | Medium | Medium | 1-token probe for connectivity only; spend tracked via our own usage_events; optional daily `SARVAM_SPEND_ALERT_USD` alert mirroring the ElevenLabs credit-alert pattern (V6) |
| INR/USD drift skews cost dashboards | Certain, slowly | Low | Single conversion point + env override; costs are estimates, clearly labelled |
| Beta open-source models (`/v2`) change or vanish | Medium | Low | Flag-gated OFF by default; catalogue isolated; heuristics classify unknown IDs gracefully |
| WAV header variance breaks PCM strip | Low | High (audio garbage) | Chunk-length-aware RIFF parser + fuzz tests + fallback: if parse fails, return WAV with correct content-type and let the client decode |
| Bulbul quality degrades on romanized Indic input | Certain | Medium | Documented vendor limitation; V4 transliteration normalizes before TTS; text-preprocessing flag on the TTS route |
| 30 s STT REST cap truncates long utterances | Medium | Medium | Client utterance windows stay ≤ 25 s (same discipline as ElevenLabs); V5 realtime removes the cap entirely |
| Cross-lingual pipeline doubles perceived latency | Medium | Medium | Query translation is one ≤ 2 000-char call (~300 ms); answer translation streams sentence-wise; orgs default to `query` mode |
| Embedding-split confusion for operators | Low | Medium | `sources.embeddingProvider` audit trail + settings UI copy states the split plainly (§3.4 card) |
| Sarvam API surface evolves fast (v4 already shipped mid-program) | High | Low | Model IDs + endpoints isolated in catalogue/adapter; version bumps are one-line changes; llms.txt-driven docs tracking in the runbook |

---

## 17. Out of Scope / Future Enhancements

- **Batch STT + diarization** for call-analytics ingestion (`/speech-to-text/job/*`, ₹45/h diarized) — natural extension of the phone logging pipeline.
- **Sarvam Vision / Doc AI** as an Indic OCR engine inside the ingestion pipeline (₹0.5/page) — would replace/augment the current OCR step for Indic documents.
- **Document Translation jobs** — bulk KB localization (translate an entire corpus into a target Indic language with a job API).
- **Samvaad Voice Agents REST** (deployments/campaigns/outbound/analytics) — only if Sarvam ships an embeddable signed-agent runtime with RAG tool-calling; would slot in as a third voice mode behind the existing Mode B machinery.
- **Function calling / agentic tool loops** on `sarvam-105b` — Clara's chat pipeline is RAG-first today; the wire support exists when the platform grows an agentic surface.
- **Bulbul HTTP-stream / WebSocket TTS** — if p95 first-audio regresses with REST + sentence queueing.
- **Pronunciation dictionary** CRUD for brand-name audio fidelity.
- **Vyakyarth-style embeddings** — if Sarvam ships a hosted embeddings API, retire the fallback split (`embeddingProvider` becomes `provider` again; the resolver change is one conditional).
- **`/v2/responses` API** (OpenAI Responses-style) — adopt when stable.

---

## 18. Appendix A — Environment Variables (new)

All optional; the provider is dark until `SARVAM_ENABLED=true` **and** a key
exists. Values are managed via admin Settings → AI Configuration
(`platform_env_settings`), same as ElevenLabs.

| Var | Default | Purpose |
|---|---|---|
| `SARVAM_ENABLED` | `false` | Master kill switch |
| `SARVAM_API_KEY` | — | `api-subscription-key` header value (secret) |
| `SARVAM_BASE_URL` | `https://api.sarvam.ai` | Vendor base (SSRF-guarded; override for SageMaker self-hosting) |
| `SARVAM_TIMEOUT_MS` | `30000` | Default vendor timeout (chat 60 s, STT 90 s headroom) |
| `SARVAM_CHAT_MODEL` | `sarvam-105b` | Platform default chat model |
| `SARVAM_BETA_MODELS_ENABLED` | `false` | Expose `/v2` beta models in UI/catalogue enforcement |
| `SARVAM_TTS_MODEL` | `bulbul:v3` | Platform default TTS model |
| `SARVAM_STT_MODEL` | `saaras:v3` | Platform default STT model |
| `SARVAM_DEFAULT_SPEAKER` | `shubh` | Platform default Bulbul speaker |
| `SARVAM_EMBEDDING_FALLBACK_PROVIDER` | `openai` | Embedding backbone when brain = sarvam |
| `SARVAM_TRANSLATION_ENABLED` | `false` | Language-services kill switch (V4) |
| `SARVAM_TRANSLATE_MODEL` | `sarvam-translate:v1` | Default translation model |
| `SARVAM_INR_TO_USD` | `0.012` | FX rate for cost estimation |
| `SARVAM_TTS_USD_PER_1K_CHARS` | catalogue | Cost override |
| `SARVAM_STT_USD_PER_MIN` | catalogue | Cost override |
| `SARVAM_TRANSLATE_USD_PER_10K_CHARS` | catalogue | Cost override |
| `SARVAM_SPEND_ALERT_USD` | — (off) | Daily vendor-spend alert threshold (V6) |

Rate-bucket constants (code, not env — matching ElevenLabs convention):
`SARVAM_STT_RATE` 30/min/org · `SARVAM_TTS_RATE` 60/min/org ·
`SARVAM_PREVIEW_RATE` 10/min/org · `SARVAM_TRANSLATE_RATE` 30/min/org.

---

## 19. Appendix B — File Touch Map (summary)

**New (19):** `ai-core/providers/sarvam.ts` (+test) · `voice-core/providers/sarvam.ts` (+test) · `voice-core/api/sarvam/{status,session,transcribe,tts,voices,preview}.ts` · `language-core/` (9 files) · `src/app/api/{admin/sarvam/status,voice/sarvam/*,language/*}/route.ts` re-exports · `useSarvamVoice.ts` · `036_sarvam_provider.sql` · `e2e-sarvam.js` · `Doc/SARVAM_AI_INTEGRATION.md`

**Modified (17):** `ai-core/{types,factory,model-catalog,resolve,config-types}.ts` · `voice-core/{types,factory,model-catalog,resolve,pricing,metering,api/provider}.ts` · `ai-settings-options.ts` · `OrgAIConfigEditor.tsx` · `PlatformEnvPanel.tsx` · `admin-ui/api.ts` · `useVoiceClient.ts` · `assistant-defaults editor` (language list) · `lib/env.ts` · `lib/plan-guard.ts` (translation key) · `scripts/validate-model-config.mjs` · `.env.example` · phone `call-handler.ts` (V5)

Zero changes to: chat route contracts, Qdrant collections, auth/middleware,
embed widget wire format, billing/checkout.
