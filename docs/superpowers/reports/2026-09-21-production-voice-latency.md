# Production Voice Latency & OpenAI Realtime Incident Report — 2026-09-21

**Portal:** https://clara.ai.amazetechclans.com/ · **Server:** 180.188.231.138 · **KB under test:** `197fbb70-8565-4216-a5ed-a78489dcc9d4` ("FAQ", org `03f3b6b9-ed43-4447-80d5-cc63ddc82c7b`)

Two deliverables in one session: **(1)** root-cause + fix of the reported 503
"OpenAI realtime voice is not configured for this tenant.", and **(2)** the
5-questions-per-provider reply-latency measurement on the live production
portal the user requested.

---

## 1. The 503 incident — root cause, reproduction, fix

### Symptom (user report)

`POST /api/embed/session` with `{"kbId":"197fbb70-…"}` → **503**
`{"error":"OpenAI realtime voice is not configured for this tenant."}` right
after switching the realtime voice agent to OpenAI in the organization portal.

### Root cause (confirmed against live production data)

The native realtime branches of `/api/embed/session` selected the transport by
the **brain provider** and sourced voice/model/credential from the **brain
resolution**. The affected tenant runs:

- **Brain = Sarvam**, pinned by the active published agent version
  (`agent_versions` #8, `configuration.ai.provider = "sarvam"`), org default
  `sarvam`.
- **Realtime voice axis = OpenAI** (`agent_ai_settings.realtime_voice_provider
  = "openai"` — what the org portal switch writes; the portal nulls all
  realtime sub-models on switch).

With a Sarvam brain, `resolveAIConfig` structurally returns `voiceId = null`
(`nativeRealtimeBrain = false`) → the OpenAI branch's `if (!voiceId)` fires →
503. Worse: had the voice check passed, `getProviderApiKey(provider)` would
have sent the **Sarvam API key to OpenAI**. The same disease 409'd the portal
route (`/api/realtime/session`) for every non-OpenAI brain.

### Live reproduction (2026-09-21, before the fix was deployed)

```
UPDATE agent_ai_settings SET realtime_voice_provider='openai' …
POST /api/embed/session  →  503 {"error":"OpenAI realtime voice is not configured for this tenant."}
```

Exact match with the user's report — reproduced on the live server with the
tenant's real configuration.

### Fix (commit `a8ebe2c`, on `origin/Vite-Converted` @ `5b6da2b`)

- `resolveVoiceConfig` now resolves an **OpenAI realtime block**
  (voice/model/transcription) validated against the OpenAI Realtime contract,
  fully independent of the brain provider — same pattern as the
  ElevenLabs/Sarvam arms. Cross-provider leftovers (Bulbul speaker ids,
  Gemini voice names) are filtered, never sent to the vendor.
- `/api/embed/session`: native transports (OpenAI Realtime / Gemini Live) are
  selected by the **voice axis** (`realtimeProvider`); the OpenAI branch mints
  with `getProviderApiKey("openai")`.
- `/api/realtime/session` (portal): gate moved to the voice axis (the locked
  OpenAI baseline contract is regression-locked and intact).
- `/api/phone/session`: voice/model from the resolver block.
- **636/636 tests** (15 new), `tsc` 0 errors, `eslint` 0 errors.

**⏳ Deployment required:** production still runs the pre-fix build. Deploy
`Vite-Converted @ 5b6da2b` (Jenkins pipeline or VPS git pull + rebuild +
restart) — after that, the exact org setting that produced the 503
(Sarvam brain + OpenAI realtime) mints a valid OpenAI Realtime session.

---

## 2. Reply-latency benchmark — 5 questions per provider, live production

### Protocol

- Real headless Chromium (`--use-file-for-fake-audio-capture`) against
  **https://clara.ai.amazetechclans.com/embed/voice** on the tenant's own KB,
  through a temporary embed key (deleted after the run; row `b696114a`).
- Five spoken questions (Bulbul-synthesised, targeting the KB's real content:
  services, AI-course price, program duration, interview/portfolio, internship
  path) concatenated into ONE session WAV with 25 s answer gaps — one voice
  session, five committed turns, within the realtime session rate budget.
- Providers switched per run via the same DB field the org portal writes
  (`agent_ai_settings.realtime_voice_provider`), restored to the user's last
  choice (`elevenlabs`) after the run.
- **TTFA definition (speech end → first audio heard):** for realtime
  transports measured from the STT relay's final-transcript WS frame to the
  first TTS WS audio frame (>1 KB payload). The deployed build predates the
  telemetry TTFA fixes (`c9f178a`…`fb48470`), so hook telemetry emits null
  TTFA on this build — the WS-level measurement is used instead and works
  regardless of deployed telemetry version.

### Results

| Provider (realtime axis) | Turns | TTFA p50 | TTFA p95 | Notes |
|---|---|---|---|---|
| **Sarvam realtime** (Saaras relay → Clara RAG → sarvam-105b-conversations → Bulbul WS) | 5 | **6,342 ms** | **10,103 ms** | per-turn: 355 / 6,848 / 6,342 / 4,318 / 10,103 ms |
| **ElevenLabs Mode A pipeline** (Scribe batch STT → Clara chat → sentence TTS) | 5 | ≈**7,506 ms** (best complete chain) | — | per-turn chains partially aborted by pipeline timing; STT alone 1.2–6.5 s |
| **OpenAI Realtime** | 0 | **blocked** | — | 503 incident (fix `a8ebe2c` not yet deployed); additionally the benchmark container's egress is region-blocked from OpenAI (REST 403, `rtc.openai.com` unreachable) — must be measured from a browser in a supported region, e.g. the user's |
| **Gemini Live** | 0 | **not enabled for this org** | — | The org's Gemini realtime selection **degrades to Sarvam** (governance gate `validateAgentAISelection` rejects Gemini for this org); enable Gemini in the platform AI registry for the org first |

### Where the time goes (Sarvam realtime, production)

| Stage | Observed |
|---|---|
| STT final → chat request | ~0 ms (immediate turn commit) |
| **Chat request → response headers (RAG embedding + LLM pre-stream)** | **899 / 2,132 / 1,027 / 3,500 / 5,348 ms** |
| Chat full stream (first → last token) | 1.7–10.0 s |
| First TTS audio after chat stream yields a sentence | remainder of TTFA |

**The bottleneck is the chat stage — the RAG embedding round-trip plus the
Sarvam LLM's time to produce its first speakable sentence — not STT and not
TTS.** For comparison, the in-container benchmark of the identical Sarvam
pipeline (local embedding, same vendor LLM) measured TTFA p50 **845 ms** —
the production chat stage is what separates the two.

### The "reply within 1 second" target — engineering assessment

1. **Sub-second TTFA is structurally available today on exactly one
   production path: OpenAI Realtime** (vendor-native brain + audio in one
   socket, no Clara chat round-trip). Deploying `5b6da2b` unblocks it; it is
   the provider that motivated the user's switch.
2. **Sarvam realtime cannot meet 1 s end-to-end** while the chat stage takes
   1–5 s before the first sentence. Options: faster brain for the realtime
   surface (voice axis is already transport-only), lower the
   sentence-gating threshold for the first TTS flush, or stream TTS from the
   first tokens.
3. **ElevenLabs Mode A is batch by design** (record → upload → STT → chat →
   sentence TTS): multi-second TTFA is inherent. The ElevenLabs **Speech
   Engine** path (already implemented on the branch, pending deployment +
   `ELEVENLABS_SPEECH_ENGINE_*` configuration) is the sub-second-capable
   ElevenLabs route.
4. After deploying `5b6da2b`, the fixed per-stage telemetry
   (`clara:voice:latency`) will pinpoint the production chat-stage breakdown
   (embedding vs LLM first token) — re-run this harness to record it.

### Re-running after deployment

```bash
# 1. deploy Vite-Converted @ 5b6da2b (Jenkins pipeline or VPS rebuild)
# 2. synthesise the question set (one-time)
SARVAM_API_KEY=… node scripts/bench-prod-wavs.mjs
# 3. per provider (set the org's realtime provider in the portal first)
node scripts/bench-prod-run.mjs --provider=openai \
  --url="https://clara.ai.amazetechclans.com/embed/voice?key=clr_<an embed key of the KB>" \
  --run-ms=185000
```

From a browser in an OpenAI-supported region the same page
(`/embed/voice?key=…`) works as a manual test surface with visible reply
timing in the browser console (`clara:voice:latency` events).

---

## 3. Known limitations of this measurement

- Production runs the pre-`5b6da2b` build: hook telemetry TTFA is null on
  that build (the five telemetry fixes are not deployed); WS/network-level
  timing was used instead and is labelled as such in the raw JSON.
- Mode A per-turn chains are partially truncated by client-side aborts; the
  best complete chain (7,506 ms) and the STT-only samples are reported.
- Two runs of the Sarvam matrix were executed (before/after instrumentation
  upgrade): TTFA p50 5,942 → 6,342 ms, p95 9,413 → 10,103 ms — consistent
  within run-to-run variance.
- The benchmark browser runs in this container; Sarvam/ElevenLabs traffic
  flows browser → production relays → vendor (production egress), so vendor
  latency IS production-representative; the browser-side capture/playback
  overhead is headless-Chromium-specific and identical across providers.

**Raw data:** `tool-results/voice-bench/prod/{sarvam,elevenlabs}.json`
(per-turn event chains + telemetry events), `questions-manifest.json`.

---

## 4. Post-report addendum — production API outage found & fixed (2026-09-21 ~07:30 UTC)

While verifying the OpenAI fix on the freshly deployed build, EVERY API route
(login, chat, embed session) started returning 500 `Internal error`. Root
cause: the deploy contained **two migrations numbered 044**
(`044_agent_ai_capability_slots.sql` + the new
`044_elevenlabs_realtime_speech_engine.sql`), and the migration runner's
duplicate-number guard correctly refuses the whole set — so `ensureMigrated()`
threw on every request. A second duplicate (`043_agent_deployment_kb_snapshots`)
arrived in a follow-up push, plus three CI-blocking code defects (a literal
`\n` embedded mid-line in the explore-link route, a missing `previewUrl` DTO
field, a `kbOverrides` null-deref, and qdrant scroll→upsert point typing).

All fixed and pushed (through `4b22366`):

| Commit | Fix |
|---|---|
| `a4a7dd8`/`c7c69f4` | renumber duplicate migrations → `046_`/`047_` (never applied anywhere — safe rename) |
| `f5259db` | explore-link literal `\n`, `previewUrl` DTO field, `kbOverrides` null-safety |
| `4b22366` | qdrant KB-snapshot clone typing |

**GitHub Actions cannot deploy these fixes: every workflow run fails with
"recent account payments have failed or your spending limit needs to be
increased"** (billing). The 500-outage deploy itself was manual/Jenkins.
**Action required: redeploy `Vite-Converted @ 4b22366` via the Jenkins
pipeline (or a manual VPS rebuild) to restore production**, then re-verify:

```bash
curl -s -X POST https://clara.ai.amazetechclans.com/api/embed/session \
  -H "Authorization: Bearer <clr_ key>" -H "Content-Type: application/json" \
  -d '{"kbId":"197fbb70-8565-4216-a5ed-a78489dcc9d4"}'
# with realtime provider = openai: expect 200 + client_secret (the incident fix)
```
