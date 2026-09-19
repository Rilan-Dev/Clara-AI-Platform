# ElevenLabs Voice Integration — Operator Runbook

> Status: **GA (V0–V6 complete)**. Architecture and the full design record live in
> [`Doc/18-07-2026/ELEVENLABS_INTEGRATION_PLAN.md`](./18-07-2026/ELEVENLABS_INTEGRATION_PLAN.md).
> This file is the hands-on runbook: what to set, what to expect, what to do when it breaks.

ElevenLabs is a **voice-only** provider wired into the platform as a second axis
(`voice-core`), separate from the brain axis (`ai-core`). It never serves chat or
embeddings, and it never receives documents. Two operating modes exist:

| Mode | What it is | Data that crosses to ElevenLabs | Where it runs |
|---|---|---|---|
| **A — Hybrid pipeline** (default) | Scribe STT + platform chat/RAG + streaming TTS | User audio (STT) and answer text (TTS), proxied through platform routes | Browser → platform endpoints only |
| **B — Conversational AI** (opt-in) | Realtime vendor agent with turn-taking + barge-in | Per-turn question + short answer snippets via the signed RAG tool; conversations are spoken vendor-side | Browser ↔ `wss://api.elevenlabs.io` with a server-minted signed URL |

Documents and knowledge bases **never leave the platform in either mode.**

---

## 1. Environment variables

Set in `.env` or — preferred — in **Admin → Settings → AI Configuration** (values
persist in `platform_env_settings` and load at boot; the page is the source of truth).

| Variable | Default | Purpose |
|---|---|---|
| `ELEVENLABS_ENABLED` | `false` | Master kill switch. `false` (or no API key) → every tenant falls back to the brain provider's voice path. |
| `ELEVENLABS_API_KEY` | — | Server-only. Never `NEXT_PUBLIC_*`, never returned by any API, scrubbed from logs. |
| `ELEVENLABS_DEFAULT_TTS_MODEL` | `eleven_flash_v2_5` | Platform default TTS model. |
| `ELEVENLABS_DEFAULT_STT_MODEL` | `scribe_v1` | Platform default STT model. |
| `ELEVENLABS_DEFAULT_VOICE_ID` | — | Platform fallback voice id. |
| `ELEVENLABS_CONVERSATIONAL_AI_ENABLED` | `false` | Mode B master opt-in. **Requires a restart** — the CSP snapshots the vendor websocket origin per process. |
| `ELEVENLABS_VOICE_CLONING_ENABLED` | `false` | Instant cloning gate (consent still required per voice). |
| `ELEVENLABS_VOICE_DESIGN_ENABLED` | `false` | Voice Design gate. |
| `ELEVENLABS_TOOL_HMAC_SECRET` | — | HMAC secret for the Mode-B RAG tool callback. Required before any Mode-B agent can be created. |
| `ELEVENLABS_WEBHOOK_SECRET` | — | Signing secret for ElevenLabs post-call webhooks. |
| `ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT` | `80` | V6 credit-burn alert threshold (percent of monthly characters). |
| `ELEVENLABS_API_BASE_URL` | `https://api.elevenlabs.io` | Fixed base URL (SSRF guard — never derived from requests). |
| `ELEVENLABS_TIMEOUT_MS` | `30000` | Fetch timeout for vendor calls. |

### Pricing overrides (per-unit cost model)

| Variable | Default | Unit |
|---|---|---|
| `ELEVENLABS_TTS_USD_PER_1K_CHARS` | flash 0.06 / turbo 0.08 / v2 0.15 | 1,000 characters |
| `ELEVENLABS_STT_USD_PER_MIN` | 0.40 | audio-minute |
| `ELEVENLABS_CONV_USD_PER_MIN` | 0.10 | conversation-minute (Mode B) |

Verify against your actual ElevenLabs plan; the values only feed `usage_events`
cost estimates, never billing.

---

## 2. Going live — Mode A (hybrid pipeline)

1. **Settings → AI Configuration → ElevenLabs connection** — set
   `ELEVENLABS_API_KEY`, flip `ELEVENLABS_ENABLED` on, press *Test connection*.
   The card shows tier, credit burn-down, and the flag row.
2. **Per organisation (Org → Settings → AI Providers & Models)** — select
   *ElevenLabs (hybrid)* as the voice provider, pick the TTS/STT models, press
   **Sync voices** and choose a default voice.
3. Done. Voice sessions on that org's KBs now run the hybrid pipeline:
   `POST /api/voice/elevenlabs/session` → `/transcribe` → `/api/chat` → `/tts`.

**Failure modes:** key rejected (card shows `connected: false`), no voice
configured (session returns a 400 with instructions), plan without voice
(402 `voice_not_enabled` — same planGuard as the other providers).

## 3. Going live — Mode B (Conversational AI, opt-in)

Mode B is an explicit, disclosed opt-in per organisation. Order matters:

1. Set `ELEVENLABS_CONVERSATIONAL_AI_ENABLED=true` **and restart** (CSP).
2. Generate and set `ELEVENLABS_TOOL_HMAC_SECRET` (32+ random chars).
3. Generate and set `ELEVENLABS_WEBHOOK_SECRET`, then register the webhook in the
   ElevenLabs Conversational AI dashboard:
   `https://<your-domain>/api/webhooks/elevenlabs/post-call` (post-call event).
4. **Org → Settings → Conversational AI (Mode B)**:
   - *Bind an agent* — pick the Clara agent, the knowledge base (RAG source),
     the voice, optionally a system prompt / first message / Twilio numbers.
     The platform creates the vendor agent with the signed RAG server tool.
   - Open **Disclosure** and accept the data-flow acknowledgement (stored on the
     binding, audited in `subscription_audit_log`). Sessions are refused with
     `403 mode_b_acknowledgement_required` until accepted.
5. Sessions: the voice widget now resolves `mode: "conversational"` and connects
   with a 60-second signed URL minted by
   `POST /api/voice/elevenlabs/agent-session`. If Mode B refuses (flag off, no
   binding, no acknowledgement), the client **falls back to Mode A automatically**.

**Never exposed on public embeds** — embed API keys always get the pipeline.

**Mode-B disclosure text** (shown in the acknowledgement modal, keep in sync with
the platform's data processing terms):

> ElevenLabs runs the realtime conversation: its agent hears the user and speaks
> the replies. To answer questions, the agent calls Clara's own knowledge search
> per turn — only the question and short answer snippets cross to ElevenLabs
> during the call. Documents, files and knowledge bases never leave this
> platform. Post-call transcripts are stored PII-redacted. The hybrid pipeline
> remains available at any time.

## 4. Voice studio (V5)

- **Clone a voice** — enable `ELEVENLABS_VOICE_CLONING_ENABLED`, ensure the
  account tier allows instant cloning (status card shows `canUseInstantCloning`).
  Every clone requires a recorded consent attestation: consenting person's name,
  your relationship, and an explicit checkbox. The attestation is timestamped
  (`elevenlabs_voices.consent_attested_at`) and audited. Unattested requests
  are rejected before any vendor call.
- **Design a voice** — enable `ELEVENLABS_VOICE_DESIGN_ENABLED`; describe the
  voice in plain language. Metered as TTS usage.
- **Conversation history** — *Sync history* pulls vendor records into
  `elevenlabs_conversations` (org-scoped, PII-redacted transcripts); post-call
  webhooks populate the same table continuously.

## 5. Monitoring & alerting (V6)

- **Status probe** — `GET /api/admin/elevenlabs/status` (super admin): tier,
  character burn-down, flag states, `creditAlert`.
- **Credit-burn alerting** — every status probe evaluates
  `ELEVENLABS_CREDIT_ALERT_THRESHOLD_PCT`. Crossing it records an alert (one per
  threshold/limit pair) and queues emails to active super admins through the
  existing notification worker. Check **Admin → Notifications**.
- **Usage dashboards** — org overview shows the Voice line: spoken characters,
  transcribed minutes, conversation minutes, estimated spend, p95 latency
  (aggregated from `usage_events`, same spine as chat/embedding metering).
- **Plan budgets** — `max_tts_chars_day` / `max_stt_audio_sec_day` on
  `subscription_plans` (default `-1` = unlimited). Set per plan to enforce
  rolling-24h voice budgets with the same planGuard semantics as every other limit.

## 6. Kill switches & rollback

| To turn off… | Do this | Tenant effect |
|---|---|---|
| All ElevenLabs voice | `ELEVENLABS_ENABLED=false` | `resolveVoiceConfig` falls back to the brain provider's voice path; zero errors surfaced beyond the status card. |
| Mode B only | `ELEVENLABS_CONVERSATIONAL_AI_ENABLED=false` + restart | Clients fall back to Mode A; bindings and history are preserved. |
| One org's Mode B | Toggle the binding off (or revoke the disclosure) in the org's Mode B panel. | `403` → automatic Mode A fallback for that agent. |
| Cloning / design | Flip the respective flag. | Studio sections hide; API returns 404. |

## 7. Security invariants (do not weaken)

1. The API key and both secrets are server-only; masked status, never logged.
2. `/api/internal/elevenlabs/tools/rag-search` verifies HMAC-SHA256 over
   `timestamp.body` with a ±5 min window and a single-use nonce ledger
   (`elevenlabs_webhook_nonces`), and re-validates the org/agent binding — a
   compromised vendor workspace cannot redirect the tool at another tenant.
3. `/api/webhooks/elevenlabs/post-call` verifies the vendor signature and
   PII-redacts transcripts before insert.
4. Voice ids are opaque strings validated against the org catalog before use;
   no request field ever becomes a URL.
5. Per-request caps: STT ≤ 120 s / 25 MB, TTS ≤ 2,000 chars, preview ≤ 300
   chars, tool query ≤ 500 chars, topK ≤ 5.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Status card: `ELEVENLABS_ENABLED is off or the API key is not configured` | Kill switch or missing key | Set both in Settings → AI Configuration |
| Session 400: "No ElevenLabs voice is configured" | No org/platform default voice | Sync voices, pick a default |
| Mode B falls back to pipeline silently | Flag off / no binding / no acknowledgement / CSP | Check the readiness banner on the org's Mode B panel |
| Browser console: CSP violation on `wss://api.elevenlabs.io` | Flag enabled after boot without restart | Restart the server (CSP snapshots per process) |
| Tool webhook 401 `bad_signature` | Secret mismatch between platform and agent config | Re-create the binding after rotating `ELEVENLABS_TOOL_HMAC_SECRET` |
| Tool webhook 401 `replayed_nonce` | Same nonce reused | Expected replay protection — check the calling integration |
| Voice stopped mid-month | Character budget exhausted | Status card burn-down + alert emails; top up at ElevenLabs |

## 9. Load testing

`node scripts/loadtest-elevenlabs-tts.js` — 50 concurrent TTS streams against a
running server (guard-mode without a key; mocked vendor in CI). Acceptance: no
stream stalls, zero 5xx, latency reported per stream.
