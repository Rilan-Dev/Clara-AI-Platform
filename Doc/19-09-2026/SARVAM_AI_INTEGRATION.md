# Sarvam AI Integration — Operator Runbook

**Clara AI Platform** · Sarvam AI as the fourth first-class provider (Indic-first brain, voice
and language stack) · architecture: `Doc/SARVAM_AI_INTEGRATION_PLAN.md`

Sarvam AI is India's sovereign full-stack AI platform (`api.sarvam.ai`). One API key covers:

| Capability | Model | Coverage |
|---|---|---|
| Chat (brain) | `sarvam-105b` (128K), `sarvam-105b-conversations` (32K) + beta `gemma4` / `deepseekv4-flash` / `glm5.3` | 10 most-spoken Indian languages + English; native script, romanized and code-mixed |
| Speech-to-text | `saaras:v3` / `saaras:v4` REST, `saaras:v3-realtime` WS | 22 Indian languages + English, 8 kHz telephony tuning |
| Text-to-speech | `bulbul:v3` | 11 languages, 37 static speakers, 8–48 kHz |
| Translation | `sarvam-translate:v1` (22 langs) / `mayura:v1` | En↔Indic + inter-Indic |
| Transliteration + language ID | `/transliterate`, `/identify-language` | 22 Indian languages |

Sarvam publishes **no embeddings API** — embeddings always run on the platform backbone
(`SARVAM_EMBEDDING_FALLBACK_PROVIDER`), so switching a brain to Sarvam **never re-embeds a
knowledge base** (Qdrant collections stay byte-identical).

---

## 1. Going live checklist

Everything defaults **OFF** — the provider is dark on deploy. Turn it on in this order:

1. **Get the key**: <https://dashboard.sarvam.ai/settings/api-keys> → copy the API
   subscription key (sent as the `api-subscription-key` header — not Bearer).
2. **Platform Admin → Settings → AI → "Voice & language provider (Sarvam AI)"**:
   - Paste the key into **Sarvam API key** (secret — masked, never echoed).
   - Flip **Enable Sarvam**.
   - Optionally flip **Language services (cross-lingual RAG)** and **Realtime STT relay**
     (see §4 and §5).
   - Press Save. Values persist in `platform_env_settings` — no restart needed for the
     key/flags themselves.
3. **Verify**: the same settings section's status pills (or `GET /api/admin/sarvam/status`
   as super-admin) report `connected: true`. Sarvam publishes no credits REST endpoint, so
   the probe is a 1-token chat completion: `200 ⇒ connected`, `401/403 ⇒ bad key`,
   `429 ⇒ reachable but throttled`. Spend visibility comes from your own usage dashboards.
4. **Realtime STT relay only**: restart the app once (`npm run start` / Docker) so
   `scripts/start.mjs` attaches the `/api/voice/sarvam/realtime` WebSocket upgrade path.

### Organisation enablement

Per-org, in **Org Settings → AI Configuration**:

- **Thinking provider** → *Sarvam AI* (brain: `sarvam-105b` chat; embeddings stay on the
  backbone), or
- **Voice provider** → *Sarvam AI (Indic)* (voice: Saaras STT + Bulbul TTS pipeline — works
  with ANY brain provider), and
- **Cross-lingual answers** → off / *Translate questions* / *Translate questions + answers*
  (needs the platform language-services flag).

---

## 2. Environment variables

All optional; managed via the admin settings page (source of truth) or process env.

| Var | Default | Purpose |
|---|---|---|
| `SARVAM_ENABLED` | `false` | Master kill switch (brain + voice + language) |
| `SARVAM_API_KEY` | — | API subscription key (secret) |
| `SARVAM_BASE_URL` | `https://api.sarvam.ai` | Vendor base (override for self-hosted endpoints) |
| `SARVAM_TIMEOUT_MS` | `30000` | Default vendor timeout (STT uses 90 s headroom) |
| `SARVAM_CHAT_MODEL` | `sarvam-105b` | Platform default chat model |
| `SARVAM_BETA_MODELS_ENABLED` | `false` | Expose `/v2` beta models in pickers |
| `SARVAM_TTS_MODEL` | `bulbul:v3` | Platform default TTS model |
| `SARVAM_STT_MODEL` | `saaras:v3` | Platform default STT model |
| `SARVAM_REALTIME_STT_MODEL` | `saaras:v3-realtime` | Exact realtime WebSocket STT model |
| `SARVAM_REALTIME_LLM_MODEL` | `sarvam-105b-conversations` | Realtime phone voice-agent dialogue model |
| `SARVAM_REALTIME_TTS_ENABLED` | `true` | Enable streaming Bulbul WebSocket TTS |
| `SARVAM_DEFAULT_SPEAKER` | `shubh` | Platform default Bulbul speaker |
| `SARVAM_EMBEDDING_FALLBACK_PROVIDER` | `openai` | Embedding backbone when brain = sarvam (openai \| gemini) |
| `SARVAM_TRANSLATION_ENABLED` | `false` | Language-services kill switch |
| `SARVAM_TRANSLATE_MODEL` | `sarvam-translate:v1` | Default translation model |
| `SARVAM_INR_TO_USD` | `0.012` | FX rate for cost dashboards |
| `SARVAM_REALTIME_STT_ENABLED` | `false` | V5 realtime STT relay (needs custom server + restart) |
| `SARVAM_CHAT_TIMEOUT_MS` | max(TIMEOUT, 60 s) | Chat timeout override |
| `SARVAM_TTS_USD_PER_1K_CHARS` | catalogue | TTS cost override |
| `SARVAM_STT_USD_PER_MIN` | catalogue | STT cost override |
| `SARVAM_TRANSLATE_USD_PER_10K_CHARS` | catalogue | Translation cost override |

Rate buckets (code constants, matching ElevenLabs parity): STT 30/min/org ·
TTS 60/min/org · preview 10/min/org · translation 30/min/org · sessions share the
provider-agnostic 10/hour/org realtime bucket.

---

## 3. Voice pipeline (Mode A) — how it runs

```
mic → webm/opus utterances (or PCM frames via the realtime relay)
    → POST /api/voice/sarvam/transcribe        (Saaras STT)
    → /api/chat                                (brain: any provider incl. sarvam-105b)
    → sentence-split                           (shared splitSentences)
    → queued POST /api/voice/sarvam/tts         (Bulbul, PCM 16 kHz — WAV stripped server-side)
    → playback queue with barge-in
```

- Bulbul returns WAV; the platform strips the RIFF container server-side with a
  chunk-length-aware parser (never assumes a 44-byte header). On a non-canonical
  container the WAV passes through verbatim (`audio/wav`) and the client decodes it.
- **No Mode B**: Sarvam's Samvaad "Voice Agents" is a hosted no-code platform, not an
  embeddable signed-agent runtime. Voice is pipeline-only. (No webhook machinery either —
  the ElevenLabs HMAC/webhook module is deliberately not replicated.)
- Bulbul covers 10 Indian languages + Indian English. Assistants in unsupported languages
  (Sinhala, Arabic, …) speak `en-IN` voice while the brain still answers in text in the
  assistant's language.

## 4. Cross-lingual RAG (language services)

Org setting `translation_mode` (off / query / query+answer) + platform flag
`SARVAM_TRANSLATION_ENABLED`:

```
User query (any language, incl. romanized Hinglish)
  ├─ identify-language        (one cheap call — ₹3.5/10K chars)
  ├─ transliterate            (romanized → native script; only when needed)
  ├─ translate → KB language  (query or query+answer mode)
  ├─ RAG retrieval + chat     (unchanged)
  └─ translate → user language (query+answer mode — streamed sentence-wise)
```

Failures degrade gracefully to the untranslated path; `mode=off` or kill switch off means
**zero** vendor calls (unit-asserted). Metering writes `TRANSLATION` usage rows
(char-counted) against the provider-agnostic `max_translation_chars_day` plan budget
(default −1 = dormant).

REST surface (org-scoped via optional `kbId`, rate-bucketed, plan-guarded):
`POST /api/language/translate` · `POST /api/language/transliterate` · `POST /api/language/identify`.

## 5. Realtime STT relay (V5)

`SARVAM_REALTIME_STT_ENABLED=true` + the custom server (`npm run start`, Docker
`scripts/start.mjs`) gives:

- **Live captions**: Saaras partial transcripts stream to the browser (`transcript_partial`
  events) — the user sees their words form as they speak.
- **Early barge-in**: the first recognizable partial during playback stops TTS immediately —
  faster than any RMS heuristic.
- Security: the browser connects to **our origin** (`wss://<host>/api/voice/sarvam/realtime`)
  with a session-minted HMAC token; the relay holds the Sarvam key server-side and
  re-resolves config per connection. Hard caps: 60-minute connection lifetime, 120-second
  idle timeout. `transcript.final` events meter STT seconds per turn.
- With the flag off (default), the hook falls back to utterance mode — identical UX to the
  ElevenLabs Mode A pipeline.

## 6. Metering & budgets (parity contract)

- TTS/STT usage rows in `usage_events` with `provider='sarvam'`; amounts = characters /
  audio-seconds. **Shared pools** with ElevenLabs (`max_tts_chars_day`,
  `max_stt_audio_sec_day`) — switching providers never multiplies budgets.
- Chat turns meter through the normal `query_events` spine (tokens, model,
  `cost_usd_micros` from the catalogue's INR→USD conversion).
- Plan gates: `planGuard(orgId, "voice" | "tts" | "stt" | "translation")` → 402 with
  machine-readable codes before any vendor call.
- Costs are estimates (INR list × `SARVAM_INR_TO_USD`, operator-tunable) — dashboards
  label them as such.

## 7. Data-flow disclosure (India residency)

| Data | Leaves the platform? | Destination |
|---|---|---|
| Documents, chunks, embeddings, KB metadata | **Never** | — (RAG runs inside Clara) |
| User spoken audio (STT) | Yes, per utterance / per relay session | Saaras STT endpoint |
| Final answer text (TTS) | Yes, per sentence chunk | Bulbul TTS endpoint |
| Query / answer text (translation) | Yes, when the org enables cross-lingual RAG | Translate endpoint |
| Prompts, system prompts, retrieved chunks | No — translation is query/answer text only | — |

Sarvam's stack is self-hosted in India (their own models and infrastructure) — data
residency aligns with DPDP Act expectations for Indian enterprise tenants.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Settings show "Sarvam key missing" | `SARVAM_API_KEY` unset | Paste the key in Settings → AI |
| `400 Sarvam is not available on this platform` | `SARVAM_ENABLED=false` or key missing | Flip **Enable Sarvam** + set the key |
| `502 Sarvam rejected the API subscription key` | Wrong/expired key | Re-copy from dashboard.sarvam.ai |
| `502 Sarvam rate limit reached` | Vendor throttle (60 req/min on Starter) | Back off; consider Pro/Business tier |
| Voice works but English voice on a Tamil assistant | Bulbul doesn't cover the assistant language | Pick a covered language, or accept `en-IN` voice |
| Hindi question over an English KB returns English | Org `translation_mode` is `off`/`query` | Org Settings → AI → Cross-lingual answers → *questions + answers*; platform language-services flag on |
| `409 Voice provider is not Sarvam` | Config raced (provider switched mid-flight) | Client re-resolves automatically; check org settings |
| Live captions missing | Relay flag off, or plain `next start` | `SARVAM_REALTIME_STT_ENABLED=true` + custom server + restart |
| WS relay closes with 1008 Invalid token | Session older than 60 min | Reconnect — the client mints a fresh session token |

## 9. Kill switches (all default OFF)

`SARVAM_ENABLED` (whole provider) · `SARVAM_TRANSLATION_ENABLED` (language services) ·
`SARVAM_BETA_MODELS_ENABLED` (beta `/v2` models) · `SARVAM_REALTIME_STT_ENABLED` (relay) —
flipping any of them off degrades 404-free: voice falls back to utterance mode, chat
degrades to untranslated, pickers hide beta models.

## 10. File map

```
src/modules/ai-core/
  providers/sarvam.ts (+test)     SarvamProvider — chatStream, EMBEDDING_UNSUPPORTED guardrail
  resolve.ts                      embedding capability split (embeddingProvider)
  factory.ts                      case "sarvam"
src/modules/voice-core/
  providers/sarvam.ts (+test)     Saaras STT + Bulbul TTS (WAV→PCM RIFF strip)
  api/sarvam/                     status · session · transcribe · tts · voices(+preview)
                                 realtime.ts (init+meter) · realtime-auth.ts (+test)
  resolve.ts                      sarvam arm + speaker chain + kill switch
  pricing.ts / metering.ts        Sarvam costs, provider='sarvam' usage rows
src/modules/language-core/        V4: translate / transliterate / identify + pipeline
scripts/sarvam-relay.mjs          V5 realtime STT relay (start.mjs upgrade path)
src/modules/assistant/core/hooks/
  useSarvamVoice.ts               Mode A pipeline + realtime mode (live captions, barge-in)
src/lib/plan-guard.ts             "translation" budget key
src/lib/db/migrations/036_sarvam_provider.sql
scripts/e2e-sarvam.js             guarded-or-success acceptance suite
```
