# ElevenLabs Real-Time Streaming Plan

**Date:** 18-09-2026
**Status:** Quick wins IMPLEMENTED (this revision); V7 streaming relay PLANNED
**Evidence base:** Production HAR capture from `clara.ai.amazetechclans.com` (2026-09-18, 7 interactions / 32 entries) + official ElevenLabs documentation (fetched 2026-09-18)
**Companion docs:** `Doc/18-07-2026/ELEVENLABS_INTEGRATION_PLAN.md` (V0–V6, delivered), `Doc/SARVAM_AI_INTEGRATION_PLAN.md`

---

## 1. Executive Summary

User-visible problem, quoted from production feedback:

> "while using ElevenLabs, the user needs to take a gap in every conversation — it's not good interaction… many API calls take more time to complete the response."

The HAR confirms it numerically: **time-to-first-audio after the user stops speaking is 3–14 seconds**, per-sentence TTS calls average **5.2 s** (worst 10.6 s), and 5 of 19 TTS calls in one session **failed outright** (502 `fetch failed`), silently dropping half of a Tamil answer. This is not an ElevenLabs capability gap — the vendor documents **100–200 ms TTFB** for exactly this workload. It is an architecture + configuration gap on our side, and it is fixable in two stages:

| Stage | What | Status |
|---|---|---|
| **Quick wins (this revision)** | Flash model switch, connect-failure retry, TTS text sanitisation, resolution cache, noise-turn filter, VAD tuning | ✅ Implemented, tested, deployed to DB |
| **V7 streaming relay** | Server-relayed TTS WebSocket + Scribe Realtime STT → 150–500 ms turn latency | 📋 Planned (§7) |

Nothing in either stage moves the RAG brain, breaks the data boundary, or changes the provider abstraction — the same evolution path Sarvam (Saaras v3-realtime / Bulbul) will plug into later.

---

## 2. Evidence Base — HAR Diagnosis

### 2.1 Latency profile (clara.ai.amazetechclans.com, 2026-09-18)

| Endpoint | Calls | Avg | Min | Max | Failures |
|---|---:|---:|---:|---:|---|
| `POST /api/voice/elevenlabs/transcribe` | 7 | 4,739 ms | 1,017 ms | 10,392 ms | 502 ×1 |
| `POST /api/chat` | 6 | 4,740 ms | 2,472 ms | 7,108 ms | — |
| `POST /api/voice/elevenlabs/tts` | 19 | 5,161 ms | 53 ms | 10,596 ms | 502 ×4, abort ×1 |

The turn pipeline is fully sequential:

```
user stops speaking
  → 700–800 ms client VAD silence window          (dead air)
  → STT: upload whole webm blob + transcribe      (1–6 s)
  → /api/chat: RAG retrieve + LLM first sentence   (1–3 s to first token)
  → TTS: per-sentence HTTP POST                    (0.4–8.5 s)
  ═ FIRST AUDIO ═                                   ≈ 3–14 s after silence
```

### 2.2 Failure analysis — the 502 bursts

Four consecutive TTS calls + one STT call failed with:

```json
{"error":"ElevenLabs request failed on /v1/text-to-speech/EXAVITQu4vr4xnSDxMaL?output_format=pcm_16000: fetch failed"}
```

Duration before failure: **10.2–10.6 s** — matching Node/undici's **default 10 s connect timeout**. `fetch failed` is a *network-level* TypeError (DNS / TCP / TLS connect), not a vendor HTTP error. The burst-then-recover pattern (Interaction 4 calls 6–10 all fail; Interaction 6–7 all succeed) is characteristic of transient egress problems from the production server: DNS resolver flakiness, IPv6/happy-eyeballs races, or regional routing hiccups — not rate limiting (which returns JSON 429 with an explicit message).

Consequences before this fix: `elevenLabsFetch` had **no retry**, the route mapped the failure to 502, and the client silently skipped the sentence — so the user heard a mutilated answer with 5 of 10 sentences missing.

### 2.3 Wasted-call analysis

The HAR also shows pure waste that this revision eliminates:

- **`[S2]` was dispatched as its own TTS call** (Interaction 7, call 7) — the trailing citation fragment after the last real sentence. Citation tags `[S1]`/`[S2]` and markdown bullets (`- GST-யின் கீழ்…`) were being *spoken aloud* and *billed as characters*.
- **Noise turns:** Scribe annotated background audio as `[heartbeat]`, `[wind blowing]`, `[outro jingle]` — each of those then burned a **full chat + TTS cycle** (2.5–5 s of vendor calls) to produce responses like "I hear wind in the background."
- **Model misconfiguration:** the live org resolved `eleven_turbo_v2_5` (HAR shows it on every call) while the platform default is `eleven_flash_v2_5` — the model ElevenLabs officially recommends for exactly this real-time workload.
- **Resolution overhead per call:** every one of the 19 TTS calls re-ran the full `resolveVoiceConfig` walk — kb → agent → org settings → AI overrides → voice catalogue ≈ **8 remote-DB round trips** — before even opening a socket to the vendor.

---

## 3. Official ElevenLabs Guidance (researched 2026-09-18)

Primary sources (all fetched and archived under `/home/z/my-project/tool-results/el-docs/`):

- Latency optimization guide — `elevenlabs.io/docs/eleven-api/guides/how-to/best-practices/latency-optimization`
- Real-time TTS WebSocket guide — `elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tts`
- TTS stream-input API reference — `elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input`
- Realtime STT (Scribe v2) server-side guide + commit strategies + event reference
- Conversational AI (Agents Platform) — `elevenlabs.io/docs/eleven-agents/...`

### 3.1 The four official latency principles

1. **Use Flash models** — `eleven_flash_v2_5` delivers **~75 ms inference**, designed for real-time. (Our org was on turbo.)
2. **Leverage streaming** — three endpoint tiers:
   - *Regular* (whole file in one response) — what Mode A uses today;
   - *Streaming HTTP* (SSE chunks as generated) — for known-up-front text;
   - **WebSocket bidirectional** (`/v1/text-to-speech/{voice_id}/stream-input`) — "perfect for applications with real-time text input (e.g. LLM outputs)", with `auto_mode` to remove chunk-strategy management and `flush: true` to force generation at turn end.
3. **Geographic proximity** — Flash + WebSocket TTFB by region: NA/EU/SEA **100–150 ms**, **South Asia 150–200 ms** (our hosting region). The `x-region` response header reveals the serving region; `api.us.elevenlabs.io` can pin US routing if the global router misbehaves from our egress.
4. **Choose fast voices** — premade/synthetic/IVC fastest, PVC slowest. `EXAVITQu4vr4xnSDxMaL` (premade) is already optimal.

**Gap:** our measured 4.5–8.5 s TTS latencies are ~30× the documented ceiling for this workload — the cost sits in per-sentence HTTP round trips, per-call resolution overhead, model choice, and a stacked sequential pipeline, not in the vendor.

### 3.2 TTS WebSocket protocol (the target transport)

```
wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input
     ?model_id=eleven_flash_v2_5&output_format=pcm_16000
```

- **BOS frame:** `{ "text": " ", "voice_settings": {…}, "generation_config": { "chunk_length_schedule": [120,160,250,290] } }` (vendor recommends defaults; `auto_mode` handles triggers automatically).
- **Streaming frames:** `{ "text": "<LLM tokens as they arrive>" }` — generation starts while the rest of the answer is still being written.
- **Turn end:** `{ "text": "<tail>", "flush": true }` — forces immediate generation of any buffered text (official best practice for conversational agents).
- **Close:** `{ "text": "" }`; **keep-alive:** a single `" "` space before 20 s idle.
- **Audio out:** base64 PCM chunks in `{ "audio": … }` frames; `isFinal: true` terminates the turn; optional word-level `alignment` timestamps.

### 3.3 Scribe Realtime v2 STT (the target speech-in)

- WebSocket, model `scribe_v2_realtime`, PCM16 (16 kHz recommended), chunks of **0.1–1 s**.
- **Partial transcripts while the user speaks** + **committed transcripts when the segment completes** — the engine's own VAD (`commit_strategy: VAD`, tunable `vad_silence_threshold_secs`, `min_speech_duration_ms`, `min_silence_duration_ms`) replaces our hand-rolled client RMS VAD.
- `previous_text` context (<50 chars) improves accuracy on reconnects.
- 90+ languages with auto-detection — materially better for our Tamil/Hindi/English-mixed users than forcing `language_code=en`.

### 3.4 Conversational AI (Mode B) positioning

ElevenLabs' turnkey answer to "proper real-time streaming conversations" is the Agents Platform WebSocket (already integrated as Mode B, V4/V5): vendor-side VAD, turn-taking, barge-in, and sub-second end-to-end latency, with our RAG reachable through the signed `clara_rag_search` server tool. Mode B is currently restricted to platform sessions (`useVoiceClient` refuses `conversational` for embed keys). Mode B trades away our own chat pipeline (brain = vendor LLM + our tool) — which is precisely why the Sarvam plan keeps Mode A as the pipeline home. **The strategic recommendation is therefore: upgrade Mode A to true streaming (V7) rather than migrating surfaces to Mode B** — Mode B remains the managed low-ops alternative for phone/telephony.

---

## 4. Root Causes → Fixes (implemented this revision)

| # | Root cause (HAR evidence) | Fix | File(s) |
|---|---|---|---|
| 1 | Org resolved `eleven_turbo_v2_5` | DB switch to `eleven_flash_v2_5` (both orgs) via `scripts/update-orgs-tts-flash.mjs`; effective immediately, revert per-org in Settings → AI | live DB |
| 2 | Connect-level `fetch failed` (undici 10 s connect timeout bursts) dropped whole sentences, no retry | Single bounded retry (250 ms backoff) on connect-level failures only — DNS/TCP codes + happy-eyeballs `AggregateError`; never retried: vendor HTTP errors, our own timeouts, mid-stream socket loss (no double-billing window) | `providers/elevenlabs.ts` |
| 3 | `[S1]`/`[S2]` citations + markdown spoken and billed; `[S2]` as standalone TTS call | `sanitizeTtsText()` strips citations/markdown/links/code before caps-check, metering and vendor call (server) AND before dispatch (client) | `voice-core/tts-text.ts`, `api/elevenlabs/tts.ts`, `useElevenLabsVoice.ts` |
| 4 | Noise transcripts (`[wind blowing]`, `[heartbeat]`) burned full chat+TTS cycles | `isNonSpeechTranscript()` gate before `runAssistantTurn` | `voice-core/tts-text.ts`, `useElevenLabsVoice.ts` |
| 5 | ~8 remote-DB round trips of `resolveVoiceConfig` per sentence TTS / per utterance STT | `resolveVoiceConfigCached()` — 5 s TTL memo, errors never cached, session bootstrap stays uncached | `voice-core/resolve.ts`, `tts.ts`, `transcribe.ts` |
| 6 | Dead-air budget: 800 ms VAD silence + over-sensitive 0.015 RMS threshold | `VAD_SILENCE_MS` 800→700, `VAD_THRESHOLD` 0.015→0.02 (fewer noise triggers, faster turn close, same anti-cut-off margin class) | `useElevenLabsVoice.ts` |
| 7 | TTS metering counted citation/markdown characters | Metering now uses the sanitised length (what was actually spoken) | `api/elevenlabs/tts.ts` |

**Verification:** `tsc --noEmit` 0 errors · vitest **281/281** (was 262; +14 sanitizer, +5 retry) · eslint 0 errors on all touched files.

**Expected effect on the same session as the HAR:** 5 failed sentences → recovered by retry (or 1 retry + fast-fail), `[S2]`/noise calls eliminated (≈4 fewer vendor calls), every sentence TTS ~300–800 ms cheaper (resolution cache), generation ~2× faster (flash), turn close 100 ms earlier (VAD). Estimated time-to-first-audio: **from 3–14 s → 2.5–8 s**, sentence dropout → near zero. This is a halving, not the end state — the end state is V7.

---

## 5. Ops Notes for the Production Server

1. **Model switch is already live in the DB** (both orgs → flash). The running prod process re-resolves per request, so no restart is required. Code fixes deploy with the next release cycle.
2. **Egress health:** the 502 bursts were network-level. If they recur after the retry lands, check on the server: `curl -w '%{time_connect} %{time_appconnect}\n' -o /dev/null -s https://api.elevenlabs.io/v1/user` repeated ~20×; look for >1 s connect times or DNS stalls. If global routing misbehaves, `ELEVENLABS_BASE_URL=https://api.us.elevenlabs.io` pins the US region (supported escape hatch per the latency guide).
3. **Proxy timeouts:** confirm openresty/NPM does not buffer or cap long-lived SSE/streaming responses for `/api/voice/*` (`proxy_buffering off` for streamed audio; websocket upgrade already needed for `/api/embed/voice`).
4. **`x-region` header:** spot-check which vendor region serves us — South Asia should give 150–200 ms TTFB on flash; a far region means routing worth investigating.
5. **STT language hint:** transcribe currently forces `language_code=en` while real users speak Tamil/English mixes (HAR evidence). Scribe auto-detects when omitted — folding this into the Sarvam language-core axis (`customerLanguages`) is the correct holistic fix; a tactical "omit when generic `en`" change is deliberately deferred to avoid regressing pure-English accuracy before the language axis exists.

---

## 6. What We Deliberately Did NOT Do

- **No browser-direct vendor WebSockets.** The Mode A data boundary (browser speaks only to platform endpoints; the ElevenLabs key never leaves the server) is a security invariant of the integration plan. All V7 streaming goes through a server-side relay.
- **No client-side Scribe token usage.** Single-use browser tokens exist for Scribe realtime, but routing STT through our relay keeps transcript redaction/metering in one place.
- **No retry storms.** Exactly one retry, connect-level only; vendor HTTP errors and mid-stream failures surface immediately (the "no silent retry storms" discipline from the provider header comment).
- **No org-wide Mode B migration.** Mode B is the right tool for telephony (already wired); Mode A+V7 preserves the platform brain for web/embed surfaces and matches the Sarvam parity contract.

---

## 7. V7 Roadmap — True Real-Time Mode A (server-relayed streaming)

Goal: **turn latency ≈ STT-commit + LLM first-token + 150–250 ms** — i.e. sub-second perceived response on strong connections, with zero sentence dropouts (one continuous audio stream instead of N HTTP calls).

### V7-R1 — TTS WebSocket relay ("speak while thinking")

Architecture (extends the existing `scripts/voice-relay.mjs` pattern used for OpenAI Realtime / Gemini Live):

```
Browser ──WS──► /api/voice/elevenlabs/tts-stream (Next.js) ──WS──► wss://api.elevenlabs.io
   ▲                                                               /v1/text-to-speech/{voice}/stream-input
   │  {type:"bos"}   → relay opens upstream, voice_settings + generation_config
   │  {type:"text", text} (per LLM token batch)  → upstream {text}
   │  {type:"flush"} → upstream {text:"", flush:true}
   │  {type:"interrupt"} → upstream close + audio queue clear
   ◄── binary PCM16 frames ← upstream {audio} base64 frames
   ◄── {type:"final"} on isFinal
```

Key protocol decisions per the official guide:
- `model_id=eleven_flash_v2_5`, `output_format=pcm_16000` (matches the existing playback chain exactly — no resample).
- Default `chunk_length_schedule`; `auto_mode` when generally available; `flush:true` at end-of-turn (official conversational best practice).
- Keep-alive `" "` every 15 s while a turn is open; hard 20 s idle cap (vendor closes anyway).
- Guards preserved: session bootstrap (`/api/voice/elevenlabs/session`) still runs planGuard + rate + resolution once; the relay re-verifies the org embed/session token on WS upgrade; metering counts streamed characters at `final`.
- Client change is additive: `useElevenLabsVoice` swaps per-sentence `speakSentence` fetches for a single persistent WS per assistant turn; the playback queue discipline is unchanged (it already plays sequential `AudioBufferSourceNode`s).

Acceptance: first audio ≤ 600 ms after first flushed sentence on the same-geo probe; zero per-sentence HTTP calls; interrupt cancels upstream within one RTT; unit tests for the relay frame mapping.

### V7-R2 — Scribe Realtime STT relay ("listen while speaking")

- Same relay pattern: browser streams PCM16 16 kHz in 100 ms binary frames → upstream `scribe_v2_realtime` with `commit_strategy: VAD` (start ~1.0 s silence, tune 0.7–1.2), `previous_text` = last assistant answer (<50 chars) for context.
- Partial transcripts → client shows live interim text; committed transcript replaces the client VAD entirely (deletes the 700 ms dead-air window and the RMS threshold heuristics).
- Barge-in: on speech-detected partial while assistant is speaking, client interrupts playback as today.
- Metering: audio seconds measured from streamed frames (more accurate than today's 24 kbps byte-size estimate — HAR showed 17 s claimed for a 46.6 KB clip).
- STT rate bucket moves from per-utterance to per-session (30/min/org → conversations, not utterances).

### V7-R3 — Decision point: embed Mode B parity

With V7-R1/R2, Mode A reaches Mode-B-class latency while keeping the platform brain and the Sarvam parity contract. Re-evaluate whether embed surfaces ever need Mode B (likely answer: no for web embeds; keep Mode B for Twilio/phone where the vendor bridges the call).

### Suggested sequencing vs Sarvam

V7-R1/R2 land **before** Sarvam V1–V3 implementation so the Saaras v3-realtime / Bulbul adapters are written against the finished relay interface (one protocol, four providers: OpenAI Realtime / Gemini Live / ElevenLabs streaming / Sarvam realtime) instead of being retrofitted.

---

## 8. Appendix — Research Artefacts

| Artefact | Path |
|---|---|
| HAR analysis (source of §2) | user-provided `clara.ai.amazetechclans.com.har` summaries |
| Latency optimization guide | `tool-results/el-docs/latency-optimization.md` |
| Real-time TTS WebSocket guide | `tool-results/el-docs/realtime-tts.md` |
| TTS stream-input API reference | `tool-results/el-docs/tts-stream-input.md` |
| Scribe Realtime API reference | `tool-results/el-docs/stt-realtime.md` |
| Server-side streaming STT guide | `tool-results/el-docs/stt-server-streaming.md` |
| Commit strategies | `tool-results/el-docs/stt-commit.md` |
| Event reference | `tool-results/el-docs/stt-events.md` |
| Docs index | `tool-results/el-llms.txt` |

(Repo-external paths refer to the build sandbox; the vendor URLs above are canonical.)

---

# 9. Addendum (2026-09-18, later session) — ElevenLabs Agents Mode-B Revival + Phone Agents

## 9.1 Why Mode B never activated (root cause: vendor API drift)

The V4–V6 Mode-B stack was complete in Clara, but a fresh read of the CURRENT
ElevenLabs Agents documentation (docs reorganised under
`/docs/eleven-agents/`, `.md` versions fetched 2026-09-18) showed the vendor
API had moved underneath us. Every session mint silently failed and
`useVoiceClient` fell back to Mode A — exactly the "gap between turns" the
user reported:

| Clara code (V4, stale) | Current vendor API (verified) | Impact |
|---|---|---|
| `GET /v1/convai/agents/{id}/get-signed-url?expiry_seconds=60` | `GET /v1/convai/conversation/get-signed-url?agent_id=` (fixed 15-min TTL) | **404 on every Mode-B session mint** → silent Mode-A fallback |
| agent create: `prompt.system_prompt`, `prompt.first_message.text`, top-level `language` | `agent.prompt.prompt`, `agent.first_message` (string), `agent.language` | prompts/first message silently dropped |
| inline `tools[]` with `type_name:"webhook"` + `config` passthrough | tools created separately via `POST /v1/convai/tools` (`tool_config.api_schema`) and attached through `agent.prompt.tool_ids` | **RAG tool never existed** — agents answered ungrounded |
| client WS frames `agent_audio_chunk` / `agent_response_chunk` / `user_message_chunk` / `keep_alive` | `audio.audio_base_64` / `agent_chat_response_part` / `user_message.text` / ping→pong with `event_id` | browser session deaf-mute even when connected |
| HMAC per-request tool-callback headers (`x-clara-signature`+timestamp+nonce) | webhook tools can only send CONSTANT headers (static token + tenant ids) | every RAG tool call rejected 401 |
| post-call signature = plain HMAC over body | Stripe-style `elevenlabs-signature: t=…,v1=…` (HMAC over `{t}.{body}`) | post-call webhooks rejected 401 |
| — (no phone path) | `POST /v1/convai/twilio/register-call` returns TwiML; `POST /v1/convai/phone-numbers` imports Twilio numbers; `POST /v1/convai/twilio/outbound-call` places calls | phone calls could not use Agents at all |

## 9.2 What changed in this revision (all verified: tsc 0 errors, 288/288 tests)

**voice-core provider** (`providers/elevenlabs.ts`)
- Signed URLs from the current conversation endpoint (15-min TTL).
- Agent create: RAG tool created FIRST via `POST /v1/convai/tools` — static
  token (`x-clara-tool-token`) + tenant ids as constant request headers,
  `request_body_schema {query}` for the LLM — then referenced via
  `agent.prompt.tool_ids`. `platform_settings.auth.enable_auth=true`.
  `conversation.client_events` pins the event set the browser consumes
  (incl. `agent_chat_response_part` for streaming text).
  Optional `telephony: true` → agent configured `ulaw_8000` both directions.
- New methods: `registerTwilioCall` (per-call μ-law override + dynamic
  variables), `importTwilioPhoneNumber`, `startTwilioOutboundCall`,
  `createWorkspaceWebhook`.
- `normalizeAgent` reads both current and legacy response shapes.

**webhook-auth** — tool callback = constant-time static-token compare
(`x-clara-tool-token`); post-call = Stripe-style `t=/v1=` parse with 10-min
tolerance + multi-v1 rotation support + legacy plain-HMAC fallback.

**RAG tool route** — tenant ids from constant headers first (body fallback for
legacy tool configs); binding re-validation unchanged (the tenant boundary).

**Browser client** (`useElevenLabsConvAI.ts`) — rewritten for the current
protocol: `audio`/`user_transcript`/`agent_response`/`agent_chat_response_part`
(streaming text)/`interruption`/`agent_response_correction`; `{user_audio_chunk}`
bare frames; `user_message`; ping→pong with `event_id`; **format-adaptive
audio** — reads `conversation_initiation_metadata` and decodes/encodes μ-law
8 kHz when the agent is phone-configured, PCM 16 kHz otherwise.

**Phone calls via ElevenLabs Agents (the new part)**
- Migration `037_phone_elevenlabs_engine.sql`: `phone_call_configs.voice_engine`
  (`openai` default | `elevenlabs`) — applied to the live DB (ledgered,
  idempotent, zero existing configs affected).
- `/api/phone/twilio/incoming`: engine branch — `elevenlabs` resolves the
  KB's Mode-B binding (all gates re-applied), calls `register-call`, returns
  the VENDOR TwiML verbatim. Audio then flows Twilio ⇄ ElevenLabs directly —
  Clara is never in the audio path. The OpenAI relay path is untouched.
- `phone/core/elevenlabs-call.ts` — binding resolution + call logging
  (`phone_call_logs` row opened at ring; transcript arrives via the post-call
  webhook, same as web sessions).
- PhoneCallPanel UI: realtime-engine selector (Twilio only) + engine badge.
- Same agent serves web + phone: register-call pins μ-law per call leg;
  browser sessions keep PCM 16 kHz (and survive even a `telephony: true`
  agent thanks to the format-adaptive client).

**Admin surfaces**
- `POST /api/admin/elevenlabs/webhooks` — provisions the vendor workspace
  post-call webhook and persists the vendor-GENERATED signing secret into
  `platform_env_settings` (live, no restart), audited.
- Agent-create panel: "Phone-ready audio (μ-law 8 kHz)" toggle → `telephony`.
- `.env.example`: full ElevenLabs section (Mode A + Mode B keys, documented).

## 9.3 Production activation checklist (operator runbook)

1. `ELEVENLABS_ENABLED=true` (already on) and set
   `ELEVENLABS_CONVERSATIONAL_AI_ENABLED=true` (Settings → Platform → Env;
   requires app restart — CSP snapshots the Mode-B websocket origin).
2. Set `ELEVENLABS_TOOL_HMAC_SECRET` to a fresh static token
   (`openssl rand -hex 32`) — same page.
3. Super-admin: `POST /api/admin/elevenlabs/webhooks` once → the vendor
   webhook is created and `ELEVENLABS_WEBHOOK_SECRET` is auto-persisted.
4. Settings → AI Providers & Models → Conversational AI: create the agent
   binding (voice + KB + first message; tick "Phone-ready audio" if phone
   calls will use this agent), then accept the data-flow disclosure.
5. Deploy the release (picks up migration 037 via ledger skip on prod DBs
   where it was not pre-applied).
6. Chat window → voice: sessions now resolve Mode B (sub-second turns; Mode A
   remains the automatic fallback if any gate refuses).
7. Phone: Settings → Phone Calls → configure the Twilio number with realtime
   engine = ElevenLabs Agents → point the Twilio number's voice webhook at
   `https://clara.ai.amazetechclans.com/api/phone/twilio/incoming` (unchanged
   URL) → call the number.

## 9.4 Relationship to V7 (§7)

V7 (server-relayed TTS stream-input + Scribe Realtime for Mode A) remains the
latency plan for the REST pipeline that public EMBEDS must keep using. Mode B
(Agents) now delivers the sub-second experience for platform surfaces — web
and phone — without any relay of our own to build. R1/R2 stay queued for the
embed surface; R3 (embed Mode B decision) stays unchanged.
