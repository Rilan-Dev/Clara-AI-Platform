# 13 — Embeddable Widget & Public Demo

> Clara AI Platform feature documentation · Domain: `embed` + `/api/embed/*` + `public/embed/clara.js` · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

The embeddable widget takes a published agent to the tenant's own website: a `<script>` snippet (clara.js) mounts a chat bubble with grounding search, optional voice, theming (design API), and a demo mode for the marketing site that needs no tenant at all. Its purpose is distribution — Clara's value accessible outside the platform console, with the same grounding core but a hardened, API-key-authenticated, quota-guarded surface that never exposes platform internals to visitors.

## 2. Business Logic

- **Script + mount** — `src/app/embed/clara.js/route.ts` serves the loader; `public/embed/clara.js` is the static artefact; the widget page `src/app/embed/widget/page.tsx` renders inside the iframe; `widget-preview` and `preview` variants support admin previewing.
- **Session bootstrap** — `POST /api/embed/session` exchanges a KB API key for a short-lived embed session; `GET /api/embed/config` returns the agent's published config (theming, voice availability, greeting) resolved from the ACTIVE deployment (Feature 04 public config route `/api/public/agents/[agentId]/config`).
- **Chat & search** — `POST /api/embed/chat` (route line 54) and `POST /api/embed/search` (route line 70) run the SAME grounding core as platform chat (Features 08/09) with embed quota accounting; failures degrade silently on the public surface while netTraceError captures details server-side (uncommitted NET_TRACE wiring).
- **Demo mode** — `GET /api/embed/demo-config` returns the server-side Demo configuration (demo org/KB/voice) used by the landing page and `embed/landing-demo` page with a special `Bearer DEMO_MODE` token (visitor tests harness).
- **Voice** — `/api/embed/voice-init`, `/api/embed/voice-connect` bootstrap realtime voice inside the widget (Features 14-16); `/api/embed/worklet` serves the audio-recorder worklet (`public/worklets/audio-recorder-worklet.js`).
- **Design** — `/api/embed/design` returns brand theming (colors, position, launcher icon) configured per agent/KB.
- **Subscription guard** — `src/modules/embed/core/subscription-guard.ts` blocks embed sessions for expired/downgraded tenants (curated message, never a stack trace).
- **Key management** — embed API key resolution `admin/core/embed-api-key-db.ts` (`getEmbedApiKey:6`, `resolveLandingEmbedKey:31`); validation `src/modules/embed/core/validate-embed.ts`; NDJSON stream codec `src/modules/embed/core/ndjson.ts` (+ tests).

## 3. Business Rules

- Widget surfaces authenticate ONLY via KB API keys / demo token — never platform sessions.
- Quota exhaustion returns curated limit messages (subscription-guard + quota events), not raw errors.
- Widget failures degrade silently for visitors; the always-on failure capture (incidents + net-trace) informs the platform admin — org/end users never see internals (the standing issue-visibility policy).
- Demo mode is read-only and rate-limited; it exercises server-selected configuration only.
- Voice in the widget follows the same entitlement and provider availability gating as the platform (Feature 16).

## 4. Data Model

- Embed API key — `017_embed_api_key.sql`; KB API keys — `005_api_keys.sql`; embed quota/audit — `029_mode_b_quota_audit.sql`.

## 5. API Surface

| Route | Purpose |
|---|---|
| `src/app/api/embed/{session,config,chat:54,search:70,rag,demo-config,design,voice-init,voice-connect,worklet,translate}.ts` | widget backend |
| `src/app/api/public/agents/[agentId]/config/route.ts` | published agent config |
| `src/app/embed/clara.js/route.ts` | loader script |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/embed/core/subscription-guard.ts` | tenant-state gating for embeds |
| `src/modules/embed/core/validate-embed.ts` | key/session validation |
| `src/modules/embed/core/ndjson.ts` | stream codec (+ `ndjson.test.ts`) |
| `src/modules/embed/core/api-keys-db.ts` | embed key persistence |
| `src/modules/embed/core/search.ts` | widget search core |

## 7. UI Reference

- `src/app/embed/widget/page.tsx` — the widget UI; `embed/voice/page.tsx` — voice embed; `embed/widget-preview`, `embed/preview` — admin previews; `embed/landing-demo/page.tsx` — landing demo.
- `src/app/(admin)/settings/embed/page.tsx` — embed snippet + key management screen.
- Landing integration: `src/features/platform/components/DemoAssistantFAB.tsx` (+ test) and `DemoVoiceSection.tsx` (+ test).

## 8. Environment Variables

- `EMBED_*` / demo config vars (see `.env.example` embed section); `NEXT_PUBLIC_*` base URL for the loader.

## 9. Tests

- `src/modules/embed/core/ndjson.test.ts`, `DemoAssistantFAB.test.ts`, `DemoVoiceSection.test.tsx`, visitor-test harness `scripts/visitor-tests/01-08` (edge, demo-config, rag-search, chat-rag, realtime-session, voice-connect-contract, performance, all).

## 10. Cross-links

- Grounding core — **08/09**; voice — **14-16**; keys/quota — **05/24**; deployment pinning — **04**; security/error presentation — **24** (committed controls only; proposed NET_TRACE route instrumentation is absent).
