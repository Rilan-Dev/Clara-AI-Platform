
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
