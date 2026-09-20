# ElevenLabs Voice Integration Plan

**CLARA AI PLATFORM** — Hybrid Voice Provider Architecture

Revision 1.0 · September 2025 · For Internal Planning Use

---

## 1. Executive Summary

This document defines the implementation plan for integrating **ElevenLabs**
into the Clara AI Platform as a **first-class voice provider**, alongside the
existing OpenAI and Gemini integrations.

The defining constraint of this integration — stated by the product owner — is:

> *"We need to do the work in Hybrid mode, but the documents / KBs should only
> live within the platform and never exit to the outside."*

This drives the central architectural decision:

**ElevenLabs is a VOICE layer, not a BRAIN layer.**

- **Brain (chat + embeddings + RAG)** stays on the platform's existing
  OpenAI / Gemini pipeline — unchanged.
- **Voice (speech-in, speech-out)** moves to ElevenLabs where configured:
  Scribe STT for transcription, TTS for speech synthesis, and (as an
  explicit opt-in) Conversational AI agents for turn-taking.
- **Documents, chunks, embeddings, prompts, and KB metadata never leave the
  platform.** No document is ever uploaded to ElevenLabs. No ElevenLabs-side
  knowledge base is ever created. In the default pipeline mode the only data
  that crosses the boundary is (a) the user's spoken audio and (b) the final
  answer text to be spoken.

The work is structured into **7 sequential phases (V0–V6)**, each
independently testable and deployable. Estimated scope: **6–8 weeks** of
focused engineering time for the full program; Phases V0–V3 (the core hybrid
voice experience) deliver in roughly **3–4 weeks**.

---

## 2. Current State Audit

Ground truth from the repository (branch `Vite-Converted`, post `b7d1837`).

### 2.1 Provider architecture (brain layer)

| File | Role |
|---|---|
| `src/modules/ai-core/types.ts` | `AIProvider = "openai" \| "gemini"`; `LLMProvider` interface (`chatStream`, `embedText`, `embedBatch`) |
| `src/modules/ai-core/factory.ts` | `ProviderFactory` switch; server-only (`AI_PROVIDER` env, never `NEXT_PUBLIC_`) |
| `src/modules/ai-core/providers/openai.ts` | Chat streaming w/ `stream_options.include_usage`; embeddings; env fallbacks |
| `src/modules/ai-core/providers/gemini.ts` | Gemini equivalents via `@google/genai` |
| `src/modules/ai-core/model-catalog.ts` | Canonical chat/embedding catalog with per-model USD pricing + pattern heuristics (`looksLikeChatModel` / `looksLikeEmbeddingModel`) |
| `src/modules/ai-core/resolve.ts` | `resolveAIConfig()` — precedence **kb_override → agent_settings → org → env**, allowed-list enforcement, voice normalisation, token/temperature clamping |
| `src/modules/ai-core/config-types.ts` | `OrgAISettings`, `KBAIOverrides`, `ResolvedAIConfig`, `AISurface = chat \| rag-embedding \| realtime \| embed` |

Key observation: **`AIProvider` is monolithic today** — one provider choice
drives chat + embedding + realtime + transcription + voices for a tenant.
The DB enforces this:

- `013_org_ai_settings.sql`: `allowed_providers TEXT[] CHECK (<@ ARRAY['openai','gemini'])`
- `008_org_ai_catalog.sql`: `organisation_voices.provider CHECK IN ('openai','gemini')`
- `014_kb_ai_overrides.sql`: `kb_ai_overrides.provider CHECK IN ('openai','gemini')`

### 2.2 Voice surfaces

| Surface | Path | Protocol |
|---|---|---|
| Browser voice (authed) | `src/modules/assistant/core/hooks/useVoiceClient.ts` → `useOpenAIRealtime.ts` / `useGeminiLive.ts` | OpenAI Realtime via WebRTC + ephemeral token; Gemini Live via WebSocket |
| Session minting | `src/app/api/realtime/session/route.ts` → `src/modules/assistant/api/realtime.ts` (OpenAI); `api/realtime/gemini-session` (Gemini) | planGuard("voice") → REALTIME_SESSION_RATE → resolveAIConfig → mint |
| Public embed voice | `src/app/api/embed/session/*`, `voice-init`, `voice-connect`, `worklet` | Embed API key (`clr_...`) auth |
| Telephony | `src/modules/phone/core/call-handler.ts` (Twilio mulaw / Vonage L16) | Server-side bridge: phone WS ↔ OpenAI Realtime; RAG injected via `/api/embed/search`; transcript → `phone_call_logs` |
| Voice sandbox / preview | `src/components/admin/VoiceSandboxPreview.tsx`, `VoicePreviewModal.tsx` | Admin UI affordances |

### 2.3 Limits & usage (the contract ElevenLabs must honour)

| Mechanism | File | Behaviour |
|---|---|---|
| Plan feature gate | `src/lib/plan-guard.ts` | `planGuard(orgId, "voice")` → `voice_enabled` plan flag; expired/past_due → FREE fallback; 402 w/ machine-readable `code` |
| Daily request quota | plan-guard `requests` | Rolling 24 h over `query_events` (no midnight reset) |
| Realtime session rate | `src/lib/rate-limit.ts` | `REALTIME_SESSION_RATE = 10 / hour / org`; `CHAT_RATE = 60 / min / org` |
| Chat metering | `src/modules/knowledge-bases/core/analytics-db.ts` | `query_events` finalise w/ model/provider/prompt_tokens/completion_tokens/cost_usd_micros + tamper-evident hash chain (WS-1.4) |
| Non-chat metering | same | `usage_events` append-only table — **kind CHECK already includes `'TTS'` and `'TRANSCRIPTION'`** (migration `028_usage_metering.sql`) — the metering spine was designed anticipating this integration |
| Quota admission | `src/lib/quota-admission.ts` | TOCTOU-safe count+insert under advisory lock |

**The usage spine is pre-provisioned for ElevenLabs.** TTS and STT metering
require zero schema changes; only a `'CONVERSATION'` kind extension is needed
for Conversational AI minutes.

---

## 3. Critical Design Review — Why NOT to Make ElevenLabs an `AIProvider`

The naive approach — add `"elevenlabs"` to the `AIProvider` union and the
factory switch — is **rejected**. Reasons:

1. **ElevenLabs cannot serve the brain.** There is no RAG-grade chat
   completion API and no embedding API in the ElevenLabs surface we consume.
   `provider = "elevenlabs"` would make every `chat` / `rag-embedding`
   resolution fail. The existing code treats provider monolithically
   (`resolveAIConfig` resolves chatModel/embeddingModel/realtimeModel from
   ONE provider), so a voice-only provider breaks the contract of 6 call
   sites (`chat.ts`, `vector-store.ts`, `hybrid-search.ts`, both realtime
   routes, embed session).
2. **It contradicts the product requirement.** The owner explicitly wants
   hybrid: ElevenLabs for voice, platform LLMs for reasoning + retrieval.
   A voice-only vendor must not displace the brain axis.
3. **It would silently change DB semantics.** Three CHECK constraints
   (013 / 008 / 014) and the `allowedProviders` UI treat the list as
   brain-capable vendors. Widening it invites operators to select a vendor
   that cannot embed — reproducing the exact WS-0.4 class of defect
   (chat model in embedding field) the model-catalog was built to prevent.

### 3.1 Chosen design: a dedicated VOICE-provider axis

Introduce a **second, orthogonal resolution axis**:

```ts
// src/modules/ai-core/voice-types.ts (new)
export type VoiceProvider = "openai" | "gemini" | "elevenlabs";
//   "openai"   → OpenAI Realtime (WebRTC, existing path)
//   "gemini"   → Gemini Live (WebSocket, existing path)
//   "elevenlabs" → Hybrid pipeline / Conversational AI (new)
```

- Brain resolution (`resolveAIConfig`) is **untouched**. Chat and embedding
  remain OpenAI/Gemini, with all existing guards, catalogs, and metering.
- Voice resolution (`resolveVoiceConfig`, new) mirrors the established
  precedence chain and allowed-list enforcement for the
  `realtime` / `embed` surfaces only.
- Default is **inherit-current-provider** (`voice_provider = NULL` → follow
  the brain provider), so the feature is 100 % opt-in per org/agent and
  existing tenants see zero behavioural change on deploy.

### 3.2 The two ElevenLabs operating modes

**Mode A — Hybrid Pipeline (default, strict data boundary).**

```
Browser mic ──PCM──► POST /api/voice/elevenlabs/transcribe (Scribe STT)
                          │ text
                          ▼
                 Platform chat + RAG (existing pipeline: hybrid/agentic
                 retrieval over Qdrant + BM25, OpenAI/Gemini chatStream)
                          │ answer text (sentence-chunked)
                          ▼
                 POST /api/voice/elevenlabs/tts (streaming PCM)
                          │ audio
                          ▼
                    Browser speaker
```

- ElevenLabs sees: **user audio in** (STT) and **answer text out** (TTS).
  Nothing else. Documents, chunks, embeddings, retrieval prompts, KB
  metadata never cross the boundary.
- Every guard the platform already applies to voice applies unchanged
  (see §7 parity table). Chat turns are metered in `query_events` exactly
  as text chat; STT/TTS are metered in `usage_events`.

**Mode B — Conversational AI Agent (explicit opt-in, disclosed boundary).**

ElevenLabs Conversational AI agents give materially better turn-taking,
barge-in, and latency than Mode A on the browser WebRTC/WS stack, and are
the only low-latency option for native telephony agents. With server tools,
knowledge is fetched per-turn from the platform:

```
ElevenLabs agent (persona, turn-taking, voice)
   └─ server tool: rag_search → POST /api/internal/elevenlabs/tools/rag-search
        (HMAC-signed, org-scoped) → platform hybrid retrieval
        → returns ONLY retrieved snippets + citations
```

Data-boundary consequences of Mode B (must be shown in the admin UI before
enabling): the agent persona/system prompt and **per-turn retrieved
snippets** transit to ElevenLabs for answer synthesis. **Documents are still
never uploaded** — retrieval scope stays least-privilege per question.
Mode B is gated by an org-level acknowledgement flag plus
`ELEVENLABS_CONVERSATIONAL_AI_ENABLED`, defaults off.

### 3.3 Data boundary matrix (the compliance artefact)

| Data class | Mode A (pipeline, default) | Mode B (conversational, opt-in) |
|---|---|---|
| Documents / files | **never leaves** | **never leaves** |
| Embeddings / vectors | **never leaves** | **never leaves** |
| KB names / metadata | never leaves | agent tool description carries KB display name only (operator-visible) |
| Retrieval prompts (RAG query rewrites) | never leaves | never leaves |
| Retrieved snippets/chunks | never leaves | **per-turn snippets transit to ElevenLabs** (disclosed, audited) |
| User speech audio | transits (STT), not persisted by platform | processed by ElevenLabs agent |
| Final answer text | transits (TTS) | generated at ElevenLabs from snippets |
| Transcripts | platform DB (PII-redacted, hash-chained) | synced back via post-call webhook (PII-redacted on write) |

---

## 4. ElevenLabs Feature Inventory & Scope Decisions

| # | ElevenLabs capability | API | Decision | Rationale |
|---|---|---|---|---|
| 1 | Text-to-Speech (streaming) | `POST /v1/text-to-speech/{voice_id}` (+ WS `stream-input`) | **IN (V2)** | Core of Mode A; chat read-aloud; `pcm_16000`/`mp3_44100_128` output formats |
| 2 | Speech-to-Text (Scribe) | `POST /v1/speech-to-text` | **IN (V2)** | Core of Mode A; language hints; replaces browser SpeechRecognition |
| 3 | Voice catalog / workspace voices | `GET /v1/voices` | **IN (V2)** | Drives org voice pickers, server-proxied |
| 4 | Shared Voice Library | `GET /v1/shared-voices`, `POST /v1/shared-voices/add/...` | **IN (V2)** | 1 000 s of curated voices; admin search + add-to-org |
| 5 | Voice preview | TTS w/ short sample text | **IN (V2)** | Parity with existing `VoicePreviewModal` |
| 6 | Voice settings (stability, similarity, style, speed, speaker boost) | TTS body params | **IN (V2)** | Per-agent tuning stored in `agent_ai_settings` metadata |
| 7 | TTS models (flash / turbo / multilingual v2 / v3) | `GET /v1/models` | **IN (V2)** | Latency-vs-quality choice; priced in catalog |
| 8 | Instant Voice Cloning | `POST /v1/voices/add` | **IN (V5, flag-gated)** | Brand voices; requires consent attestation + audit |
| 9 | Voice Design (prompt → voice) | `POST /v1/text-to-voice/design` | **IN (V5, flag-gated)** | Differentiator for tenant branding |
| 10 | Conversational AI agents (web) | `/v1/convai/agents`, `get-signed-url` | **IN (V4, opt-in)** | Mode B; best latency/turn-taking |
| 11 | Conversational AI + Twilio | agent `twilio` config | **IN (V4, opt-in)** | Native telephony agent alternative to CallHandler bridge |
| 12 | Server tools (webhook callbacks) | agent config | **IN (V4)** | The Mode B knowledge bridge (platform RAG) |
| 13 | Post-call webhooks + transcripts | `/v1/convai/webhooks` | **IN (V4)** | Audit parity with `phone_call_logs` |
| 14 | Conversation history/analytics | `GET /v1/convai/conversations` | **IN (V5)** | Org dashboards |
| 15 | Subscription/credits introspection | `GET /v1/user/subscription` | **IN (V0)** | Operator "connection test" panel |
| 16 | Projects (long-form audio) | `/v1/projects` | OUT | Not a knowledge-assistant use case |
| 17 | Dubbing / STS translation | `/v1/dubbing` | OUT (future) | No product surface yet |
| 18 | Audio Isolation | `/v1/audio-isolation` | OUT (future) | Candidate for audio-document ingestion pre-processing later |
| 19 | Music generation | — | OUT | Out of product scope |

---

## 5. Target Architecture

### 5.1 New module: `src/modules/voice-core/` (as built — V0–V3)

> **As-built note:** the integration originally landed as a standalone
> `src/modules/voice-elevenlabs/` module, then was restructured into
> `src/modules/voice-core/` so the VOICE axis mirrors the BRAIN axis
> (`src/modules/ai-core/`) file-for-file. One concern = one module = one
> provider family behind a factory + interface. Adding any future voice
> vendor is one file in `providers/` + one case in `factory.ts`.

```
src/modules/voice-core/                 # VOICE axis — mirrors ai-core/
├── types.ts               # VoiceProvider union, VoiceProviderService interface
│                          #   (the "adapter" contract), VoiceServiceConfig,
│                          #   vendor payload DTOs — mirrors ai-core/types.ts
├── config-types.ts        # ResolveVoiceConfigInput, VoiceResolution,
│                          #   ElevenLabsSessionPayload — mirrors config-types.ts
├── model-catalog.ts       # TTS/STT catalogue + caps + env defaults + kill
│                          #   switches + voice-id shape — mirrors model-catalog.ts
├── pricing.ts             # chars/seconds → costUsdMicros (env overrides)
├── factory.ts             # VoiceProviderFactory (singleton cache, provider
│                          #   switch) — mirrors ai-core/factory.ts
├── resolve.ts             # resolveVoiceConfig(): kb → agent → org → env
│                          #   precedence — mirrors ai-core/resolve.ts
├── metering.ts            # usage_events writers (TTS / TRANSCRIPTION / CONVERSATION)
├── providers/
│   └── elevenlabs.ts      # ElevenLabsVoiceProvider implements
│                          #   VoiceProviderService — class style mirrors
│                          #   ai-core/providers/openai.ts
└── api/
    ├── provider.ts        # POST /api/voice/provider routing lookup
    └── elevenlabs/
        ├── session.ts     # Mode A pipeline bootstrap
        ├── transcribe.ts  # Scribe STT handler
        ├── tts.ts         # TTS handler (streams audio)
        ├── voices.ts      # Catalog list / sync / preview / clone / design
        ├── agents.ts      # Mode-B agent binding CRUD (V4, admin)
        ├── agent-session.ts # Mode B signed-URL handler (opt-in, V4)
        ├── webhooks.ts    # RAG server-tool callback + post-call webhook (V4/V5)
        └── conversations.ts # Mode-B history list + sync (V5)

# Client side (unchanged conventions):
src/modules/assistant/core/hooks/
    useVoiceClient.ts         # routes by resolved voiceProvider + elevenlabs mode
    useOpenAIRealtime.ts      # openai realtime (WebRTC)
    useGeminiLive.ts          # gemini live (WS)
    useElevenLabsVoice.ts     # elevenlabs hybrid pipeline (Mode A)
    useElevenLabsConvAI.ts    # elevenlabs Conversational AI (Mode B, V4)
src/modules/assistant/core/voice/
    sentence-split.ts         # streaming-TTS sentence chunker (shared + tested)
    realtime-audio-config.ts  # (existing shared voice utils)
```

**No ElevenLabs SDK dependency.** The integration uses plain `fetch` + `ws`
against a fixed `ELEVENLABS_API_BASE_URL` (default
`https://api.elevenlabs.io`): fewer supply-chain dependencies, explicit
timeout control (mirroring `openai.ts`'s `timeoutMs`/`maxRetries: 1`
discipline), and no silent auto-retry storms on streaming endpoints.

### 5.2 Resolution layer

`src/modules/voice-core/resolve.ts` (moved out of ai-core — voice-axis
resolution belongs in the voice module, mirroring how brain resolution
lives in ai-core):

```ts
export interface VoiceResolution {
  voiceProvider: VoiceProvider;              // openai | gemini | elevenlabs
  source: ResolutionSource;                  // kb_override | agent_settings | org | env
  // Brain config is resolved SEPARATELY via existing resolveAIConfig():
  brain: ResolvedAIConfig;                   // provider/chatModel/... (untouched)
  elevenlabs: {                              // Present iff voiceProvider === "elevenlabs"
    ttsModel: string;                        // eleven_flash_v2_5 | eleven_multilingual_v2 | ...
    sttModel: string;                        // scribe_v1
    voiceId: string;                         // validated against elevenlabs_voices catalog
    voiceSettings: { stability?: number; similarityBoost?: number; style?: number; speed?: number };
    language: string;                        // from agent language selection (existing chain)
  } | null;
}
```

Precedence (identical shape to the existing chain in `resolve.ts`):

```
kb_ai_overrides.voice_provider
  → agent_ai_settings.voice_provider
    → org_ai_settings.voice_provider
      → env ELEVENLABS_DEFAULT_ENABLED? "elevenlabs" : brain provider
```

Enforcement parity:

- `allowed_voice_providers` org allow-list (new column, mirrors
  `allowed_providers`), checked exactly like
  `resolveAIConfig`'s `allowedProviders` check — violation throws
  `AIConfigResolutionError`.
- ElevenLabs voice IDs are **not** a fixed set (unlike `OPENAI_REALTIME_VOICES`),
  so validation is against the org's synced catalog table
  (`elevenlabs_voices`) or the platform default voice env var.
- `assertSurfaceEnabled` continues to gate `voiceEnabled` / `realtimeEnabled`
  / `publicEmbedEnabled` flags before any ElevenLabs call.

### 5.3 Session payload (Mode A)

`POST /api/voice/elevenlabs/session` returns **capability descriptors, never
keys**:

```json
{
  "mode": "pipeline",
  "stt": { "endpoint": "/api/voice/elevenlabs/transcribe", "model": "scribe_v1",
           "language": "en", "sampleRate": 16000, "maxAudioSeconds": 120 },
  "tts": { "endpoint": "/api/voice/elevenlabs/tts", "model": "eleven_flash_v2_5",
           "voiceId": "JBFqnCBsd6RMkjVDRZzb", "outputFormat": "pcm_16000",
           "voiceSettings": { "stability": 0.5, "similarityBoost": 0.75, "speed": 1.0 } },
  "chat": { "endpoint": "/api/chat", "kbId": "...", "ragMode": "hybrid" },
  "provider": "elevenlabs",
  "kbId": "...", "ragMode": "hybrid"
}
```

The browser then owns the pipeline loop (see §8). All traffic flows through
platform endpoints — **CSP `connect-src` needs no ElevenLabs origin in
Mode A** (a hard security win). Mode B adds `wss://api.elevenlabs.io` to
`connect-src` (middleware CSP patch, gated by whether Mode B is enabled
platform-wide).

---

## 6. Platform Endpoint Plan

All handlers live under `src/app/api/...` re-exporting from
`src/modules/voice-core/api/elevenlabs/`. Guards column = minimum enforcement
(every handler additionally requires auth: platform JWT or embed API key,
mirroring `realtime.ts`).

| Endpoint | Method | Purpose | Guards | Metering |
|---|---|---|---|---|
| `/api/voice/elevenlabs/session` | POST | Mode A bootstrap | planGuard("voice"); REALTIME_SESSION_RATE; surface flags | — |
| `/api/voice/elevenlabs/transcribe` | POST (multipart) | Audio → text (Scribe) | session-bound; audio ≤ 120 s / 25 MB; ELEVENLABS_STT_RATE (30/min/org) | `usage_events` kind=TRANSCRIPTION, cost by audio-seconds |
| `/api/voice/elevenlabs/tts` | POST | Text → streamed audio (PCM/MP3) | session-bound; text ≤ 2 000 chars/request; ELEVENLABS_TTS_RATE (60/min/org) | `usage_events` kind=TTS, cost by characters |
| `/api/voice/elevenlabs/voices` | GET | Org catalog (synced) | auth | — |
| `/api/voice/elevenlabs/voices/preview` | POST | Voice preview | preview text ≤ 300 chars; 10/min/org | TTS metering (cheap, flagged `preview`) |
| `/api/voice/elevenlabs/voices/import` | POST | Add shared-library voice to org | admin role; ELEVENLABS_VOICE_LIBRARY flag | — |
| `/api/voice/elevenlabs/voices/design` | POST | Voice Design (V5) | admin; ELEVENLABS_VOICE_DESIGN flag | TTS metering |
| `/api/voice/elevenlabs/voices/clone` | POST | Instant cloning (V5) | admin; ELEVENLABS_VOICE_CLONING flag; consent attestation required | — |
| `/api/voice/elevenlabs/agent-session` | POST | Mode B signed URL | planGuard("voice"); REALTIME_SESSION_RATE; org Mode-B acknowledgement; ELEVENLABS_CONVERSATIONAL_AI_ENABLED | — |
| `/api/internal/elevenlabs/tools/rag-search` | POST | Server-tool callback (Mode B) | HMAC-SHA256 + timestamp + nonce replay guard | tool call logged; retrieval meters EMBEDDING as today; CONVERSATION event at call end |
| `/api/webhooks/elevenlabs/post-call` | POST | Post-call transcripts/analytics | ElevenLabs signature verification | conversation record + PII-redacted transcript |
| `/api/admin/elevenlabs/status` | GET | Key validity, tier, credits burn-down | platform admin | — |
| `/api/admin/elevenlabs/agents` (+ `[id]`) | GET/POST/PATCH/DELETE | Conversational AI agent CRUD (V4/V5) | platform admin; opt-in | — |

**Session binding:** `transcribe`/`tts` accept `{kbId, sessionId}` and
re-resolve the voice config server-side on every call (never trust the
client-supplied voiceId/model — same discipline as `realtime.ts`, which
re-validates voice against `isSupportedOpenAIRealtimeVoice`). Rate-limit
buckets key on `org:{orgId}` or `ip:{ip}` exactly like the existing
REALTIME gate.

---

## 7. Limits & Usage — Parity Contract

The owner requirement: *"limitation and usages should be working same like
my existing providers."* Parity matrix (this is the acceptance checklist):

| Existing provider behaviour | ElevenLabs parity |
|---|---|
| `planGuard(orgId,"voice")` before session mint → 402 `voice_not_enabled` | Identical call, first gate, in `session.ts` / `agentSession.ts` |
| REALTIME_SESSION_RATE 10/h/org on ephemeral-token mint | Same bucket reused for both session endpoints |
| CHAT_RATE 60/min/org on chat turns | Pipeline chat turns go through the **existing** chat route — unchanged |
| Rolling-24 h `max_req_day` over `query_events` | Unchanged — pipeline turns insert `query_events` rows like text chat |
| `usage_events` append-only metering w/ costUsdMicros | kind=TTS (chars), TRANSCRIPTION (audio-seconds), CONVERSATION (minutes) — schema pre-provisioned |
| Provider/model validation via catalog (`model-catalog.ts`) | `catalog.ts` + `pricing.ts` with same validate-on-write / self-heal-on-read philosophy |
| Allowed lists per org (`allowedProviders`, `allowedVoices`) | `allowed_voice_providers` + org `elevenlabs_voices` catalog |
| Precedence kb → agent → org → env with `sources` tracking | `resolveVoiceConfig` returns the same `sources` shape for audit UI |
| Expired subscription → FREE fallback (downgrade) | planGuard already handles; Free has `voice_enabled=false` → ElevenLabs blocked identically |
| Fail-open/close choice on guard errors (`PLAN_GUARD_FAIL_MODE`) | Inherited automatically (guard is shared code) |

**New plan columns** (migration 033, defaults −1 = unlimited so behaviour is
"same as existing" unless an operator opts into tighter budgets):

```sql
ALTER TABLE subscription_plans        ADD COLUMN max_tts_chars_day      INTEGER NOT NULL DEFAULT -1;
ALTER TABLE subscription_plans        ADD COLUMN max_stt_audio_sec_day  INTEGER NOT NULL DEFAULT -1;
ALTER TABLE subscription_plan_versions ADD COLUMN IF NOT EXISTS max_tts_chars_day     INTEGER NOT NULL DEFAULT -1;
ALTER TABLE subscription_plan_versions ADD COLUMN IF NOT EXISTS max_stt_audio_sec_day INTEGER NOT NULL DEFAULT -1;
```

`plan-guard.ts` gains `LimitKey` `"tts"` / `"stt"` checks (sum over
`usage_events` in rolling 24 h) — wired but dormant until operators set
values. Free plan seeded with `voice_enabled=false` (unchanged), so
defaults change nothing.

---

## 8. Client Implementation (Mode A pipeline)

### 8.1 `useElevenLabsVoice` hook

New `src/modules/assistant/core/hooks/useElevenLabsVoice.ts`, slotting into
`useVoiceClient.ts` as a third always-called hook (React rules of hooks —
mirrors the existing openai/gemini pair):

- **Capture:** reuse the `useGeminiLive` AudioWorklet pattern
  (PCM16 capture, resample to 16 kHz, `echoCancellation`/`noiseSuppression`
  constraints). Shared worklet module extracted to
  `src/modules/assistant/core/voice/audio-worklet.ts` so Gemini + ElevenLabs
  share one implementation.
- **VAD:** client-side energy threshold (same approach the Gemini path
  uses) → utterance segmentation → upload on speech-end.
- **STT:** `POST /transcribe` with the utterance blob (webm/opus or wav) →
  interim text into `history` as a pending `VoiceTurn`.
- **Brain:** call the existing chat stream endpoint (same one the text chat
  UI uses — same `query_events` metering, same RAG, same sources).
- **TTS with sentence chunking:** as answer tokens stream in, emit complete
  sentences to `POST /tts` (`output_format=pcm_16000`), queue
  `AudioBufferSourceNode`s on the shared playback graph → first audio
  typically < 1.5 s after answer start with `eleven_flash_v2_5`.
- **Barge-in / interrupt:** on user speech during playback, cancel the TTS
  queue + abort pending fetches (`AbortController` per sentence), mirroring
  `interrupt()` semantics of the other two hooks.
- **Turn shape:** identical `VoiceTurn` (question/answer/sources/status) so
  `VoiceChatModal`, the embed voice widget, and history UI work unmodified.

### 8.2 Read-aloud (text chat)

The chat surface gains an optional "read aloud" action: answer text →
`POST /tts` → play. Available only when the org's voice provider is
elevenlabs (or keep per-UI toggle). Metered as TTS usage events — visible
in dashboards.

### 8.3 Embed widget

`src/features/embed/screens/voice-screen.tsx` and the embed session route
gain the elevenlabs branch: `resolveVoiceConfig` with `surface:"embed"`
returns Mode A descriptors; embed API key auth path identical. Public
embeds get the strict pipeline only — Mode B is never exposed on public
embeds (attack-surface minimisation).

---

## 9. Phone Integration (Phase V4)

Two supported paths, selected per org:

1. **Pipeline bridge (default):** extend `CallHandler` with an
   ElevenLabs variant — Twilio mulaw → PCM16 → Scribe STT (utterance
   windowing server-side) → platform chat+RAG → sentence-chunked TTS →
   resample 24 k→8 k → mulaw back to Twilio. Transcript continues flowing
   to `phone_call_logs` (PII-redacted) — full audit parity.
2. **Native ElevenLabs Twilio agent (opt-in, Mode B):** platform creates
   the Conversational AI agent with `twilio` configuration; the
   server-tool webhook provides RAG. Lower latency, better barge-in;
   disclosed snippet transit applies.

Both paths honour: `planGuard("voice")`, max-call-duration enforcement
already in `CallHandler`, per-org call rate limits, and
`CONVERSATION`/`TTS`/`TRANSCRIPTION` metering.

---

## 10. Database Migration Plan (033_elevenlabs_voice.sql)

One migration, additive-only except two CHECK constraint widenings:

```sql
-- 1. Voice provider axis
ALTER TABLE org_ai_settings
  ADD COLUMN voice_provider TEXT CHECK (voice_provider IN ('openai','gemini','elevenlabs')),
  ADD COLUMN allowed_voice_providers TEXT[] NOT NULL DEFAULT ARRAY['openai','gemini','elevenlabs']
    CHECK (cardinality(allowed_voice_providers) > 0),
  ADD COLUMN elevenlabs_tts_model TEXT,
  ADD COLUMN elevenlabs_stt_model TEXT,
  ADD COLUMN default_elevenlabs_voice TEXT;

ALTER TABLE agent_ai_settings
  ADD COLUMN voice_provider TEXT CHECK (voice_provider IN ('openai','gemini','elevenlabs'));

ALTER TABLE kb_ai_overrides
  ADD COLUMN voice_provider TEXT CHECK (voice_provider IN ('openai','gemini','elevenlabs'));

-- 2. Widen voice catalog constraint (drop + re-add)
ALTER TABLE organisation_voices DROP CONSTRAINT organisation_voices_provider_check;
ALTER TABLE organisation_voices ADD CONSTRAINT organisation_voices_provider_check
  CHECK (provider IN ('openai','gemini','elevenlabs'));

-- 3. Org ElevenLabs voice catalog (synced from workspace + shared library imports)
CREATE TABLE elevenlabs_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  voice_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_text TEXT,
  cloned BOOLEAN NOT NULL DEFAULT FALSE,
  consent_atested_at TIMESTAMPTZ,             -- required for cloned voices
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, voice_id), UNIQUE (id, org_id)
);

-- 4. Mode B agent mapping
CREATE TABLE elevenlabs_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  elevenlabs_agent_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('conversational')),
  org_acknowledged_data_flow BOOLEAN NOT NULL DEFAULT FALSE,  -- Mode B disclosure
  config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, agent_id), UNIQUE (id, org_id)
);

-- 5. Extend usage_events kinds for conversational minutes
ALTER TABLE usage_events DROP CONSTRAINT usage_events_kind_check;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_kind_check
  CHECK (kind IN ('EMBEDDING','TTS','OCR','TRANSCRIPTION','CONVERSATION'));

-- 6. Plan budget columns (dormant defaults, see §7)
```

Idempotent (`IF NOT EXISTS` / `DO $$` guards for constraint swaps), matching
the house migration style. Auto-applied by `ensureMigrated()` on boot.

---

## 11. Security & Privacy Engineering

1. **Key handling.** `ELEVENLABS_API_KEY` is server-only. Never
   `NEXT_PUBLIC_*`, never returned by any API, never logged
   (`src/lib/redact.ts` extended with the key pattern for log scrubbing).
   `PlatformEnvPanel` shows masked validity status only. Connection test =
   server-side `GET /v1/user/subscription`.
2. **No client-facing vendor endpoints (Mode A).** All browser↔ElevenLabs
   traffic is proxied through platform routes with platform auth. CSP
   unchanged. Mode B adds `wss://api.elevenlabs.io` to `connect-src` only
   when platform-enabled; signed URLs are minted server-side with short TTL
   after guards pass.
3. **Webhook authenticity.** Post-call webhooks verify ElevenLabs' signature
   scheme; internal tool callback requires HMAC-SHA256 over body +
   timestamp window (±5 min) + nonce cache replay guard. Shared secrets in
   env (`ELEVENLABS_WEBHOOK_SECRET`, `ELEVENLABS_TOOL_HMAC_SECRET`).
4. **SSRF discipline.** Base URL fixed by env; no request field ever
   becomes a URL. Voice IDs are opaque strings validated against the DB
   catalog before use.
5. **Data minimisation & retention.** Audio buffers are transient (in-memory
   chunked, dropped after STT response); the platform persists **no raw
   audio**. Transcripts written to `query_events` / `phone_call_logs` pass
   through the existing PII redaction. TTS request text is capped and
   logged only as character counts.
6. **Tenant isolation.** `elevenlabs_voices` / `elevenlabs_agents` are
   org-scoped with composite keys (`UNIQUE (id, org_id)` — house pattern
   from 008). Signed URLs minted only after `resolveVoiceConfig` confirms
   org ownership of the agent mapping.
7. **Consent & cloning.** Instant cloning requires an explicit consent
   attestation (timestamped row field + UI checkbox + audit entry), is
   flag-gated off by default, and is blocked entirely when the account tier
   forbids it.
8. **Abuse caps.** Per-request caps (STT ≤ 120 s / 25 MB; TTS ≤ 2 000
   chars; preview ≤ 300 chars), org/min rate buckets (§6), rolling-24 h
   plan budgets (§7, dormant), ElevenLabs credit-burn monitoring with
   alerting threshold.
9. **Kill switches.** `ELEVENLABS_ENABLED=false` → `resolveVoiceConfig`
   treats elevenlabs as not-allowed and falls back to the brain provider's
   voice path; per-feature flags for Conversational AI / cloning / voice
   design. Clear operator-facing error when the key is missing (mirrors the
   `envName is not configured on the server` embed-session message).
10. **Audit.** Mode B tool calls log query text + snippet count (never
    snippet bodies) into the query audit trail; Mode B enablement is itself
    an audited admin action.

---

## 12. Usage Metering & Pricing

`src/modules/voice-core/pricing.ts` — cost model with env overrides
(ElevenLabs bills in credits; publish USD equivalents, verify at impl):

| Kind | Unit | Default (env-overridable) |
|---|---|---|
| TTS | 1 000 characters | `ELEVENLABS_TTS_USD_PER_1K_CHARS` (flash ≈ 0.06, v2 ≈ 0.15, v3 ≈ 0.15 — verify) |
| TRANSCRIPTION | audio-minute | `ELEVENLABS_STT_USD_PER_MIN` (scribe ≈ 0.40 — verify) |
| CONVERSATION | conversation-minute | `ELEVENLABS_CONV_USD_PER_MIN` (≈ 0.10 — verify) |

`metering.ts` writes append-only `usage_events` rows (org_id, kb_id,
model, provider='elevenlabs', `cost_usd_micros`, latency_ms, metadata:
`{characters}` / `{audioSeconds}` / `{durationSeconds, agentId}`). Chat
turns in the pipeline are metered once via the normal `query_events`
finalise — no double counting: STT/TTS are distinct billable invocations,
exactly like embeddings are today.

Dashboards: usage screens gain "Voice" cards — TTS chars, STT minutes,
conversation minutes, estimated spend — from the same
`usage_events` queries the analytics module already runs (`getOrgUsageMetering`
combining query_events + usage_events — the voice cards extend this function's
existing usage_events aggregation).

---

## 13. Admin UI Plan

| Component | Change |
|---|---|
| `OrgAISettingsEditor.tsx` | New "Voice provider" section: segmented control (OpenAI Realtime / Gemini Live / ElevenLabs Hybrid), allowed voice providers checkboxes, ElevenLabs defaults (TTS model, STT model, default voice from catalog), TTS voice settings sliders |
| New `ElevenLabsVoiceCatalogDialog` | Search shared library (server proxy w/ filters), inline preview playback, add-to-org; cloned/custom voice management behind flags w/ consent flow |
| `VoiceSandboxPreview.tsx` / `VoicePreviewModal.tsx` | ElevenLabs branch (preview via platform endpoint) |
| `PlatformEnvPanel.tsx` | ELEVENLABS_API_KEY masked status, tier + credits burn-down, kill-switch states |
| `KBAIOverridesEditor.tsx` / agent config screen | Voice-provider override dropdown (mirrors provider override UX) |
| Usage dashboards | Voice metering cards (§12) |
| Mode B disclosure | First-enable modal showing §3.3 matrix; acknowledgement persisted on `elevenlabs_agents.org_acknowledged_data_flow` |

---

## 14. Implementation Phases

Each phase lands green: `vitest` + `tsc --noEmit` + eslint + production
build + an `scripts/e2e-elevenlabs*.js` run (house e2e pattern, mock mode
included so CI never burns credits).

### Phase V0 — Foundation & guardrails (~3 days)
- `src/modules/voice-core/{types,config-types,model-catalog,pricing,factory,resolve,metering}.ts`
  and `src/modules/voice-core/providers/elevenlabs.ts`
- Env parsing in `src/lib/env.ts`; redact pattern; kill switches
- `/api/admin/elevenlabs/status` connection test; PlatformEnvPanel status
- Catalog types + model list bootstrap
- **Accept:** status endpoint 200/`{tier, credits}` with key; 503 w/ clear
  operator error without key; zero behavioural change elsewhere.

### Phase V1 — Config layer (~4 days)
- Migration `033`; `voice-resolve.ts`; `config-types.ts` extensions;
  `ai-settings-db` / `agent-ai-settings-db` / kb overrides read+write paths
- plan-guard `"tts"`/`"stt"` limit keys (dormant)
- OrgAISettingsEditor voice-provider section; KBAIOverridesEditor override
- **Accept:** unit tests for precedence/allow-list/sources parity with
  `resolveAIConfig`; defaults leave every existing tenant unchanged (seed
  snapshot diff = 0 rows).

### Phase V2 — Voice I/O + catalog (~5 days)
- `transcribe`/`tts`/`voices`(+preview/import) handlers; metering; rate
  buckets; request caps
- `elevenlabs_voices` catalog sync job (on-demand admin sync)
- Voice catalog dialog + previews
- e2e: session → transcribe (fixture wav) → tts (assert audio/PCM + usage
  rows) → guards (free plan 402, rate 429, disabled KB 409)
- **Accept:** parity checklist §7 rows 1–8 pass; metering rows visible in
  analytics queries.

### Phase V3 — Browser hybrid pipeline (~5 days)
- Shared audio worklet extraction; `useElevenLabsVoice`; `useVoiceClient`
  routing branch; VoiceChatModal + embed voice widget integration
- Sentence-chunked streaming TTS + barge-in; read-aloud action on chat
- **Accept:** voice conversation on a KB completes with sources; interrupt
  works; p95 first-audio < 1.5 s on flash model; text-chat regression suite
  green.

### Phase V4 — Conversational AI agents, opt-in (~5 days)
- Agent CRUD APIs + `elevenlabs_agents` sync; `agentSession` signed-URL
  route; internal rag-search tool webhook (HMAC); post-call webhook;
  CSP addition when enabled; phone native Twilio path
- **Accept:** Mode B conversation answers grounded by platform RAG; tool
  webhook rejects unsigned/stale/replayed requests; post-call transcripts
  land PII-redacted; Mode B blocked for public embeds and non-acknowledged
  orgs.

### Phase V5 — Voice cloning, design, history (~4 days)
- Clone w/ consent flow; voice design; conversation history + analytics
  sync; dashboards
- **Accept:** consent gate blocks unattested clones; history visible
  org-scoped only.

### Phase V6 — Hardening, docs, ops (~3 days)
- Credit-burn alerting; latency dashboards; `Doc/ELEVENLABS_INTEGRATION.md`
  (operator runbook: env vars, flags, pricing overrides, Mode B disclosure
  text); `SETUP.md`/`API.md` additions; load test at 50 concurrent TTS
  streams
- **Accept:** runbook review sign-off; alert fires on burn threshold;
  load test passes without stream stalls.

**Total: ~29 engineering days (6 weeks).** V0–V3 = shippable hybrid voice
GA at ~17 days.

---

## 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Pipeline latency > native realtime | UX | flash models + sentence chunking + streaming WS TTS; measured p95 gate in V3; Mode B exists for latency-critical orgs |
| ElevenLabs credit exhaustion mid-month | outage | credit-burn monitoring + alerts (V6); org budgets (§7); graceful error UX |
| Vendor rate limits per tier | 429s | org-rate buckets + retry-after handling + backoff, same as existing provider handling |
| Mode B snippet transit misread as "docs leaving" | compliance | default-off, explicit disclosure modal, audit; Mode A always available |
| Voice cloning ToS/consent exposure | legal | flag off by default, attestation + audit, tier check |
| Cost surprise from read-aloud feature | billing | per-request caps + plan budgets + dashboard visibility |
| Browser autoplay policies block TTS playback | UX | user-gesture connect flow (same as existing voice modals) |
| Vendor API drift (new models/deprecations) | breakage | thin client + catalog sync + model validation with self-heal fallback (WS-0.4 pattern) |

---

## 16. Out of Scope / Future Enhancements

- Projects, Dubbing/STS, Music, Audio Isolation (§4 rows 16–19).
- Professional (studio-grade) voice cloning — requires ElevenLabs-managed
  verification flow; revisit after V5 adoption data.
- STT streaming (partial transcripts) — Scribe is batch-per-utterance
  today; re-evaluate when ElevenLabs ships streaming STT.
- ElevenLabs Agent Evaluation / analytics v2 surfaces.
- Multi-region data residency routing (ElevenLabs processing region
  pinning) — track vendor roadmap; note in DPA review.

---

## 17. Appendix A — Environment Variables (new)

| Var | Default | Purpose |
|---|---|---|
| `ELEVENLABS_ENABLED` | `false` | Master kill switch |
| `ELEVENLABS_API_KEY` | — | Server-only key |
| `ELEVENLABS_API_BASE_URL` | `https://api.elevenlabs.io` | Fixed base (SSRF guard) |
| `ELEVENLABS_DEFAULT_TTS_MODEL` | `eleven_flash_v2_5` | Latency-first default |
| `ELEVENLABS_DEFAULT_STT_MODEL` | `scribe_v1` | |
| `ELEVENLABS_DEFAULT_VOICE_ID` | — | Platform fallback voice |
| `ELEVENLABS_TIMEOUT_MS` | `30000` | STT can be slow on long audio |
| `ELEVENLABS_TTS_USD_PER_1K_CHARS` | model-catalog value | Cost override |
| `ELEVENLABS_STT_USD_PER_MIN` | catalog value | Cost override |
| `ELEVENLABS_CONV_USD_PER_MIN` | catalog value | Cost override |
| `ELEVENLABS_CONVERSATIONAL_AI_ENABLED` | `false` | Mode B platform flag |
| `ELEVENLABS_VOICE_CLONING_ENABLED` | `false` | Cloning flag |
| `ELEVENLABS_VOICE_DESIGN_ENABLED` | `false` | Design flag |
| `ELEVENLABS_TOOL_HMAC_SECRET` | — | Server-tool callback auth |
| `ELEVENLABS_WEBHOOK_SECRET` | — | Post-call webhook auth |

## 18. Appendix B — File Touch Map (summary)

**New:** `src/modules/voice-core/**` (§5.1), migration `033`,
`src/modules/ai-core/voice-{types,resolve}.ts`,
`useElevenLabsVoice.ts`, shared `audio-worklet.ts`,
`ElevenLabsVoiceCatalogDialog.tsx`, `scripts/e2e-elevenlabs.js`,
`Doc/ELEVENLABS_INTEGRATION.md`.

**Modified:** `src/modules/ai-core/{config-types,resolve}.ts`,
`src/modules/organisations/core/{ai-settings-db,agent-ai-settings-db}.ts`,
kb overrides db, `src/lib/{plan-guard,rate-limit,env,redact}.ts`,
`src/modules/assistant/core/hooks/useVoiceClient.ts`,
`src/modules/knowledge-bases/core/analytics-db.ts` (voice usage queries),
`src/modules/phone/core/call-handler.ts` (V4), admin components (§13),
`src/middleware.ts` (conditional CSP), embed session routes, seeds +
`validate:model-config` script extension for voice fields.
