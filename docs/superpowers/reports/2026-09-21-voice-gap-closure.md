# Clara Voice Gap-Closure Report — 2026-09-21

**Branch:** `Vite-Converted` · **Baseline HEAD:** `84d27f0` (+ plan doc `9e4781c`) · **Gap-closure HEAD:** `57acd8b` → **live-verification HEAD:** `fb48470` (2026-09-21 second session: Gemini telemetry wiring, five live-run telemetry correctness fixes, standalone worklet asset fix, first REAL measured benchmark numbers — see the live-evidence section)
**Plan:** `docs/superpowers/plans/2026-09-21-clara-voice-gap-closure.md` — the plan
file was published to `origin/Vite-Converted` mid-session (`9e4781c`); the
implementation phases had already been derived from the identical task
specification, and this branch was rebased onto the plan commit so the
repository carries both. No new architecture plan was created, per the
plan's own non-negotiable instruction.

**Method:** every claim below was verified against the current code first
("trust the current code over old plans/reports"). Most of Phases B/C/E/F was
already shipped by the prior voice-plan work (`b1c722b` and earlier); the
verified remaining gaps were closed with focused commits, and the
already-implemented areas are certified below with their existing evidence.

---

## Commits delivered in this gap-closure

| SHA | Scope |
|---|---|
| `cdc0866` | `fix(gemini): add server-side Live relay + HMAC session tokens` — relay script, start.mjs mount, token module + 8 tests |
| `c8f8d5d` | `fix(gemini): keep long-lived credentials server-side in session routes` — both session routes, hook rewire, pure URL builder + 6 security tests |
| `24ee1c1` | `fix(sarvam): make capture fallback observable + duplicate-session guard` |
| `71af6c4` | `feat(voice): wire latency telemetry into the OpenAI baseline` (+ provider-switching tests updated to the new auth contract) |
| `93ffd7b` | `docs(voice): close realtime production gaps — gap-closure report` |

**Live-verification session (2026-09-21, second):**

| SHA | Scope |
|---|---|
| `033cd80` | `feat(gemini): wire Live latency telemetry` — pure `GeminiTurnTelemetry` module (utterance boundary + retroactive stt.final for the vendor-native VAD lifecycle) + 8 focused tests |
| `c9f178a` | `fix(voice): make TTFA measurable` — STT carry across turn commits, multi-turn utterance boundary, standalone worklet asset sync, harness arg/wait fixes (5 defects found by the FIRST live run) |
| `d301dc4` | `fix(voice): bind turn-scoped telemetry marks to per-turn handles` — in-flight chat marks can no longer bleed onto a barge-in's interim record |
| `21cfcdc` | `fix(voice): Sarvam/ElevenLabs telemetry boot record + playback-settled emit` — interim marks were silent no-ops; short-answer emit no longer races the first audio |
| `fb48470` | `fix(voice): rag.start anchor + defer telemetry emit while synthesis audio in flight` — first complete live TTFA (949 ms) |
| `a2c2675` / `57acd8b` | test hygiene: lint + typed payloads in the new security tests |

---

## Final status table

| Area | Status | Evidence |
| --- | ------ | -------- |
| Sarvam AudioWorklet | **Closed** (verified + hardened) | `connectWorkletPcm16Capture` is the primary path in `useSarvamVoice.ts` (shared worklet `/worklets/audio-recorder-worklet.js`, 16 kHz capture ctx, mono PCM16); ScriptProcessor is a narrowly scoped fallback that now LOGS when used (`24ee1c1`); `startRealtimeCapture` tears down previous timer/capture/buffer/socket before rewiring (duplicate-capture prevention, `24ee1c1`); `pcm-capture.test.ts` — 11 tests (init, PCM16 frames, cleanup, fallback propagation, embed module URL) |
| Generation correctness | **Closed** (verified, pre-existing) | `identity.ts` (sessionId/generationId/turnId, 8 tests), `generation-coordinator.ts` (exactly-one-generation, idempotent turn commits, 19 tests), `generation-playback.ts` (enqueue+play-time generation gating); wired in `useSarvamVoice` + `useElevenLabsClaraStream`; duplicate-final guard (`lastFinalRef`), greeting = system generation; scenario tests: `sarvam-realtime-generation.test.ts` (6) + `elevenlabs-overlap.test.ts` (7) covering duplicate final / final after interruption / stale final / partial-then-final / delayed old completion / old-generation-late-audio |
| Gemini credential security | **Closed (P0 fixed this session)** | Long-lived `GEMINI_API_KEY` removed from BOTH browser-facing responses (`geminiSession.ts:114` and `embed/session` route previously embedded `?key=<key>`); browser now receives `{ realtime: { endpoint, token } }` and builds `wss://<self>/api/voice/gemini/realtime?token=<hmac>` (`buildSameOriginRelayWsUrl`); `scripts/gemini-relay.mjs` holds the key server-side and pipes BidiGenerateContent verbatim (mounted in `start.mjs`); session route now requires platform auth (401 anonymous), shares the realtime rate bucket, runs plan guard before credential use; security regression tests: `realtime-auth.test.ts` (8: round-trip, expiry, tamper incl. tenant-swap, malformed, key-never-in-token, secret-binding) + `gemini-session.test.ts` (6: no key in response, no key in built URL, 401 unauthenticated, 402 plan-before-credential, 429 shared bucket, 409 non-gemini KB) |
| ElevenLabs Clara realtime | **Closed** (verified, pre-existing) | `useElevenLabsClaraStream.ts`: Scribe realtime STT → committed transcript → coordinator → `/api/chat` (Clara RAG) → streaming LLM tokens → ONE warm TTS WS (`sendRealtimeTts` streams deltas + per-turn flush) → generation-aware playback — **no sentence-by-sentence REST TTS on the realtime path** (the `speakSentence` REST branch exists only for the utterance fallback when no realtime descriptor); `elevenlabs-realtime-wire.test.ts` (14) + `elevenlabs-overlap.test.ts` (7) |
| Sarvam realtime | **Closed + LIVE-VERIFIED (33 measured turns)** | `vad_speech_start` → early barge-in (`useSarvamVoice.ts` handleRealtimeEvent); partial → live captions ONLY; final → exactly one turn (duplicate + 2 s same-text guard); `session_end.audio_duration_s` surfaced + relay-side metering (`tts-relay-meter.test.ts`, 6); generationId rides TTS frames end-to-end; interrupt closes TTS WS; reconnect cannot stack duplicate TTS/capture (`24ee1c1`); `sarvam-realtime-generation.test.ts` (6) + `realtime-wire.test.ts` (10). **Live 2026-09-21** (headless Chromium + file-mixed fake mic + live Saaras/105B/Bulbul): TTFA p50/p95 845/1186 (short), 877/1244 (KB), 842/1203 (long) ms; Tamil 3/3 + mixed 1/1 turns; two-question barge-in WAV → cleanly separated generations with fresh per-turn marks |
| OpenAI baseline | **Preserved + instrumented** | Realtime flow untouched (WebRTC + FIX V3 single `response.create` contract still locked by `realtime.test.ts`); additive-only `LatencyTracker` wiring so Test A of the benchmark captures TTFA (`71af6c4`) — stage names identical to the other providers; 605/605 tests green after the change |
| Interruption matrix | **Covered by tests** | STT barge-in → old generation invalidated (`elevenlabs-overlap` "fast repeated user speech"); RAG/LLM barge-in → coordinator aborts registered chat controller, late tokens rejected ("interruption during LLM", "a late chat token from the replaced generation is rejected"); TTS barge-in → queued audio dropped + generation dies ("interruption during TTS"); Playback → queue cleared (`generation-playback.interrupt()` + "delayed old audio … never heard"); Reconnect → "upstream failure → invalidate → close → clear → error → clean reconnect", "errors terminate the ACTIVE generation only"; Rapid turn → "duplicate final transcript never creates a second generation" + "at most ONE assistant generation can be speaking at any instant". Providers: Sarvam + ElevenLabs Clara (unit-level); OpenAI relies on the same coordinator-less `response.cancel` contract as before (baseline unchanged by design); Gemini: no coordinator (vendor-native turn lifecycle, unchanged) |
| Provider switching | **Covered by tests** | `provider-switching.test.ts` (5): cyclic OpenAI→Gemini→Sarvam→ElevenLabs→OpenAI — same kbId→same tenant/KB/plan-guard for every switch, transport-only change, guard failure rejects before ANY vendor artifact (incl. Gemini relay token), capability mismatch 409; embed auth path validated per key (kb + origin binding, `embed-auth.test.ts`, 6) |
| Failure recovery | **Closed** (verified, pre-existing) | `reconnect-policy.ts` bounded backoff (no infinite loops, budget reset on success, no zombie retries); deterministic recovery sequence (invalidate → close → clear → error → reconnect) in `failure-recovery.test.ts` (5); hooks: Sarvam fatal-error path tears down coordinator/generation/sockets/playback and reconnects clean; no duplicate TTS sockets (connecting guard + `closeRealtimeTts`) |
| Telemetry | **Closed for all 4 providers + live-verified** | `latency-tracker.ts` (19 tests: stage arithmetic, idempotent marks, p50/p95 aggregation, STT carry across turn commits, utterance boundaries, turn-handle binding) emits `clara:voice:latency` events carrying ONLY sessionId/generationId/turnId/provider/model/timings — no transcripts, no secrets; wired in OpenAI (`71af6c4`), Sarvam, ElevenLabs Clara, and now Gemini Live (`033cd80`, pure `GeminiTurnTelemetry` module with vendor-VAD utterance-boundary + retroactive stt.final semantics). **Live-verified 2026-09-21:** the first real benchmark run exposed and fixed five measurement-destroying wiring bugs (carry/boundary/handle/boot-record/emit-timing — commits `c9f178a`, `d301dc4`, `21cfcdc`, `fb48470`); the Sarvam pipeline now yields complete stage chains on 33 measured turns |
| Security | **Audited this session** | Sweep of all browser-facing voice/session code: no `OPENAI_API_KEY`/`GEMINI_API_KEY`/`ELEVENLABS_API_KEY`/`SARVAM_API_KEY`/HMAC/webhook secrets in any client bundle, URL or JSON response (remaining matches are server-side relays, docs, or migration SQL); OpenAI browser path uses ephemeral client secrets (by design); ElevenLabs ConvAI uses vendor-signed ephemeral `signedUrl` (Mode B vendor mechanism, not a long-lived platform credential); `webhook-auth.test.ts` (16) locks the internal-tool HMAC + vendor webhook signatures |
| Tenant isolation | **Covered** | Realtime session tokens are HMAC-signed over `kbId+orgId+exp` with `AUTH_SECRET` (tamper/expiry/malformed rejected — 8 Gemini + 6 Sarvam + 11L wire tests); embed keys validated per request (key↔kbId match + allowed-origin check, 6 tests); every session route resolves org server-side from kbId (provider-switching tests). **Known bound (pre-existing, documented):** a stolen valid token is a bearer capability for its own kb/org until its 60-minute expiry — identical discipline to the Sarvam/ElevenLabs relays |
| Mode B | **Verified intact, intentionally dark** | `elevenlabs-modes.test.ts` (9): Mode B selected only with realtime+conversational flags AND an existing agent binding (deployed orgs unchanged); embed keys NEVER get Mode B; Mode C requires its own flag; rollback is configuration-only. Webhook HMAC + org/agent/kb header binding verified by `webhook-auth.test.ts` + `embed-auth.test.ts`. No Clara-owned-architecture changes were made to Mode B |
| Rollout | **Pre-existing, verified present** | `d7687c6` staged rollout gates + `2026-09-20-voice-rollout-runbook.md` (flags default dark; provider-by-provider enablement; rollback paths). Gap-closure changes preserve the flag story: the Gemini relay is live only where Gemini is already the resolved provider |

---

## Per-gap detail (original gap → change → tests → evidence → limitation)

### 1. Gemini credential exposure (Phase D — P0)

- **Original gap:** `POST /api/gemini/session` returned
  `wsUrl = wss://generativelanguage.googleapis.com/…?key=<GEMINI_API_KEY>` —
  a reusable, long-lived vendor secret in a query parameter visible in the
  HTTPS response body, devtools, and any proxy log. The route was also
  UNAUTHENTICATED (`/api/gemini` sat in the middleware's PUBLIC_PREFIXES with
  no route-level check) and had no rate limit. The embed session route had the
  identical leak in its Gemini branch.
- **Change:** server-side relay + capability tokens, exactly the discipline the
  Sarvam V5 and ElevenLabs Mode C relays already use. Browser gets
  `{ realtime: { endpoint, token } }`; the WS URL is built client-side from the
  descriptor (only query param: the 60-minute HMAC token); `scripts/gemini-relay.mjs`
  verifies the token in-process and holds the vendor key. Route order is now
  auth (401) → rate limit (shared 10/h/org bucket) → plan guard (402) →
  provider resolution (409) → token mint. Passthrough design means the
  BidiGenerateContent protocol, WebAudio scheduler and RAG tool round-trips are
  unchanged — no behavior change beyond the transport.
- **Tests:** 8 (token module) + 6 (route security) + 5 (provider-switching,
  updated to the authenticated contract) — all listed in the table above.
- **Real-device evidence:** NOT executed — no browser with microphone, no live
  Gemini credentials in this environment. The relay logic is unit-verified at
  the token layer; the passthrough wiring is code-reviewed against the sibling
  relays it mirrors.
- **Remaining limitation:** first live validation against Google must happen
  on deployment (the relay mounts via `scripts/start.mjs` like the other
  relays); token replay within TTL is bounded by the shared bearer-capability
  discipline documented above.

### 2. OpenAI baseline telemetry (benchmark blocker)

- **Original gap:** `useOpenAIRealtime` had no `LatencyTracker`, so
  `scripts/voice-benchmark/run.mjs` — which consumes `clara:voice:latency`
  window events — could not record Test A (OpenAI baseline) TTFA at all.
- **Change:** additive wiring only (`71af6c4`): per-session tracker,
  turn-scoped records, marks at stt.first_partial/stt.final (transcription
  events), rag.start/rag.end (RAG fetch), llm.start/tts.start (the single
  `response.create` — native audio makes them the same instant),
  llm.first_token (first transcript delta), tts.first_audio +
  browser.first_audio (first `response.audio.delta`, mirrored by the WebRTC
  track), turn.complete + interrupt. Greeting tracked as a system generation.
  No realtime-flow behavior changed; `realtime.test.ts` still locks the
  session contract.
- **Tests:** full suite green (605/605); the tracker itself is locked by 11
  unit tests including the exact TTFA arithmetic.
- **Measured result:** none claimed — numbers only come from the device run.

### 3. Sarvam capture hardening (Phase B leftovers)

- **Original gap (minor):** the ScriptProcessor fallback was silent, and
  `startRealtimeCapture` could stack a second flush timer / capture graph on a
  reconnect.
- **Change:** `24ee1c1` — fallback logs a warning; duplicate-session guard
  tears down timer/capture/buffer/socket before rewiring.
- **Tests:** `pcm-capture.test.ts` (11) already locks the worklet wiring,
  PCM16 conversion, cleanup and fallback propagation; the guard is covered by
  the idempotent-stop tests.
- **Limitation:** none identified.

### 4. Verified already-closed phases (no change needed)

Phases B (primary mechanism), C, E, F were already implemented by the prior
voice-plan commits on this branch; this session verified them against the
current code (not the old reports) and certified them with the evidence in
the status table. The OpenAI path was NOT refactored to look like the others
(baseline preserved); Mode B was NOT converted to the Clara-owned
architecture.

---

## Real-device evidence

**Executed (first gap-closure session):**
- Full unit/integration verification: 605/605 vitest tests (62 files) —
  591 baseline + 14 new.
- `tsc --noEmit` — 0 errors.
- `eslint` on every changed file — 0 errors.
- Security audit sweep of browser-facing voice/session code.

**Executed (2026-09-21 live-verification session — real browser, real vendors, real numbers):**
- Environment assembled from scratch: embedded PostgreSQL (39 migrations) +
  standalone Qdrant 1.12.4 + seeded org/agent/KB (20-chunk insurance FAQ
  corpus, embeddings via an explicitly-labelled local MiniLM OpenAI-compatible
  stand-in because BOTH production embedding backbones are region-blocked).
- **Sarvam realtime Phase 11 benchmark, executed for real**: headless Chromium
  141 + `--use-file-for-fake-audio-capture` with genuine Bulbul-synthesised
  spoken-question WAVs (34 files, `scripts/bench-gen-wavs.mjs`) → 33 measured
  turns with complete stage chains: TTFA p50/p95 **845/1186 ms (short, 9
  turns), 877/1244 ms (KB, 10), 842/1203 ms (long, 10)**; Tamil 3/3 (p50
  906 ms), EN/Tamil mixed 1/1 (908 ms). Raw JSON:
  `tool-results/voice-bench/sarvam-*-matrix.json`.
- **The first live run ever executed against the telemetry found five real
  measurement bugs** (all fixed + regression-locked, commits `c9f178a`,
  `d301dc4`, `21cfcdc`, `fb48470`) plus one **standalone deployment bug**
  (`/worklets/audio-recorder-worklet.js` 404 → silent ScriptProcessorNode
  fallback on every `npm start` deployment — Phase B's primary capture path
  was broken in standalone builds; `start.mjs` asset sync fixed).
- **Live barge-in / rapid-turn check**: two-question WAV (Q2 lands during
  Q1's answer) → two cleanly separated generations, fresh per-turn STT marks
  (utterance-boundary verified live), both answers spoke, no mark bleed.
- **Gemini relay live round-trip: partially executed.** The relay accepted a
  freshly minted HMAC session token, connected upstream to Google with the
  server-held key (`status=connected`), and propagated the vendor close
  deterministically — but Google rejects the `setup` frame with WS close 1007
  "User location is not supported for the API use" (the same regional block
  as the REST API; verified directly against the vendor WS to isolate the
  relay). Token/auth/relay wiring live-verified; the audio round-trip must be
  completed on the first deployment in a supported region.
- Full suite after all fixes: **621/621 vitest** (65 files), `tsc` 0 errors,
  `eslint` 0 problems.

**Not executed (blocked by vendor region restrictions from this container):**
- OpenAI Realtime baseline numbers (Test A): `api.openai.com` answers every
  endpoint with 403 `unsupported_country_region_territory`. The baseline
  table stays `_to record_` — no numbers invented.
- Gemini Live full audio round-trip (1007 at setup, above).
- ElevenLabs Clara realtime live validation (Test C): no `ELEVENLABS_API_KEY`
  exists in this environment. Unit evidence stands
  (`elevenlabs-realtime-wire.test.ts` 14 + `elevenlabs-overlap.test.ts` 7).

**Required manual run before production sign-off:**
1. Deploy via `scripts/start.mjs` (relay mounts with the process) in a
   vendor-supported region.
2. Run the benchmark harness for Tests A/C per the commands in the TTFA
   baseline report (`scripts/bench-run-matrix.mjs` automates the class
   matrices); record OpenAI + ElevenLabs aggregates into its table.
3. One manual Gemini voice session on a real device (connect → speak →
   barge-in → reconnect) to complete the passthrough relay audio round-trip.

## Remaining gaps (genuine)

1. OpenAI Realtime + ElevenLabs benchmark measurements — blocked by vendor
   region restrictions / missing ElevenLabs credential; the Sarvam matrix is
   measured and recorded; the same harness (`scripts/bench-run-matrix.mjs`)
   produces the missing providers on a supported-region deployment.
2. Gemini Live full audio round-trip against Google — relay token/upstream
   wiring live-verified; the vendor rejects the session from this region
   (1007). Complete on first supported-region deployment.
3. RAG-stage latency in the measured numbers runs on a local MiniLM embedding
   stand-in (both production embedding backbones region-blocked) — the RAG
   p50/p95 values are local-only and NOT production-representative; every
   other stage is genuine live-vendor measurement.

**Closed since the first gap-closure report:** Gemini Live latency telemetry
(now wired, `033cd80`); the plan file is on the branch (`9e4781c`); the
benchmark itself ran live for Sarvam with real p50/p95 numbers.
