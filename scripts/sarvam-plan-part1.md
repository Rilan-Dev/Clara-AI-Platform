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
