# API — Clara AI Platform (REST Reference)

Every endpoint of the single Clara application. Conventions first, then the
routes grouped by surface. Base URL is your deployment root (e.g.
`https://app.example.com`); all paths below are relative to it.

> **Auth docs for operators** — `DEPLOYMENT.md`. **Embedding guide for
> customers** — `EMBED-GUIDE.md`.

---

## 1. Conventions

### Authentication
Two caller classes exist:

- **Console / workspace users** — authenticate with the session token
  returned by `POST /api/auth/login`. Send it either as
  `Authorization: Bearer <token>` or via the `clara_platform_token` httpOnly
  cookie (set automatically on login). Sessions are opaque, DB-backed, and
  revocable server-side (7-day expiry).
- **Public embed visitors** — authenticate with a per-KB **embed API key**
  (`clr_…`) issued in the workspace. Keys are validated on every request
  and are additionally bound to an origin allow-list.

### Error contract (Phase 6.3)
Every error response is JSON of the shape:

```json
{ "error": "Human-readable message", "code": "MACHINE_CODE", "status": 400 }
```

Common codes: `INVALID_INPUT`, `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`,
`MALWARE_DETECTED`, `VIRUS_SCAN_UNAVAILABLE`, `RATE_LIMITED`,
`ACCOUNT_LOCKED`, `PLAN_LIMIT_EXCEEDED` (HTTP 402, with
`upgrade_url`), `INTERNAL_ERROR`. Raw provider or stack errors are **never**
returned — they are logged server-side and replaced with a friendly 502/500.

### Rate limits (Phase 6.4)
429 responses carry `Retry-After` and `code:"RATE_LIMITED"`:

| Endpoint | Limit | Scope |
|----------|-------|-------|
| `POST /api/auth/login` | 5 failures / 15 min | IP (resets on success) |
| `POST /api/chat` | 60 / min | org |
| `POST /api/kbs/:id/documents` | 10 / min | org |
| `POST /api/realtime/session` | 10 / hour | org |
| `POST /api/embed/*` | per-key `rate_limit_per_hour` + daily plan quota | API key |

---

## 2. Auth — `/api/auth/*`

| Method & path | Auth | Purpose |
|---------------|------|---------|
| `POST /api/auth/register` | — | Sign up (`{email,password,fullName}` + optional `{orgName,planId}` org-mode). Creates user/org/subscription + session. |
| `POST /api/auth/login` | — | `{email,password}` → `{user,token}` + Set-Cookie. 401 bad creds, 403 `ACCOUNT_LOCKED` after 10 failures, 429 after 5 failures/15 min/IP. |
| `POST /api/auth/logout` | session | Revoke current session. |
| `DELETE /api/auth/sessions` | session | Revoke **all** sessions of the user. |
| `GET /api/auth/me` | session | Current user + session expiry. |
| `PATCH /api/auth/me` | session | Update own `fullName` / `avatarUrl`. |
| `POST /api/auth/change-password` | session | `{currentPassword,newPassword}`. |
| `POST /api/auth/forgot-password` | — | Email a reset token. |
| `POST /api/auth/reset-password` | reset token | Set a new password. |

## 3. Platform admin — `/api/platform/*` (super-admin)

| Method & path | Purpose |
|---------------|---------|
| `GET /api/platform/stats` | Org count, users, MRR, usage KPIs for `/admin`. |
| `GET /api/platform/revenue` | MRR / ARR / by-plan breakdown. |
| `GET /api/platform/orgs` | Paginated org list with plan + live usage. |
| `GET /api/platform/orgs/:id/impersonate` | Members eligible for impersonation. |
| `POST /api/platform/orgs/:id/impersonate` | Mint a real tenant session for a member (5–480 min, audited, no super-admin escalation). |
| `POST /api/platform/users/:id/unlock` | Clear login lockout (Phase 6.1; audited `auth.account_unlocked`). |
| `GET /api/platform/subscription-plans` | Plan catalogue (published versions). |
| `GET /api/platform/workspaces` | Tenant workspace inventory. |
| `GET /api/platform/services-status` | Per-service health for the ops screen. |
| `GET/PUT /api/platform/assistant-defaults` | Platform-wide assistant defaults. |
| `GET/PUT /api/platform/demo-config` | Landing-demo configuration. |
| `GET /api/platform/env` | Sanitized env report (never secrets). |
| `GET/PUT /api/platform/email-templates` | Email template management. `PUT` saves **draft** content (`subject`/`bodyHtml` — never live) and applies `isActive` immediately. |
| `GET /api/platform/email-templates/:key/audit` | Recent live changes (publish/reset/toggle) for the history panel. |
| `POST /api/platform/email-templates/:key/publish` | Copy the saved draft into the live template (audited `publish`) — the only path edits reach recipients. |
| `POST /api/platform/email-templates/:key/discard` | Delete the draft; live content untouched. |
| `POST /api/platform/email-templates/:key/reset` | Restore the factory default (live + draft cleared, audited `reset`). |
| `GET/POST /api/platform/email-variables`, `PUT/DELETE /api/platform/email-variables/:name` | Managed variable catalogue: system rows read-only (name = send-time contract), custom rows carry a static value injected into every render. DELETE is blocked while a template still uses the variable unless `?force=true`. |
| `POST /api/platform/email/test` | Send a real test email (any template, sample data). |

## 4. Org & membership — `/api/orgs/*` (session, org-scoped)

| Method & path | Purpose |
|---------------|---------|
| `GET /api/orgs` | Organisations the caller belongs to. |
| `GET/PATCH /api/orgs/:orgId` | Org profile. |
| `GET /api/orgs/:orgId/agents` | Agents owned by the org. |
| `GET/PATCH /api/orgs/:orgId/ai-settings` | Per-org AI overrides. |
| `GET/POST /api/orgs/:orgId/members`, `PATCH/DELETE …/members/:userId` | Member management (invite by email creates the account + mails a set-password link). |
| `GET /api/orgs/:orgId/subscription` | Current subscription snapshot. |
| `GET /api/orgs/billing-history` | Invoice/charge history. |

## 5. Knowledge bases & documents — `/api/kbs/*` (session, KB-permission)

| Method & path | Purpose |
|---------------|---------|
| `GET /api/kbs/all` | Every KB the caller can read. |
| `POST /api/kbs` / `GET/PATCH/DELETE /api/kbs/:kbId` | KB CRUD (plan `max_kbs` enforced → 402). |
| `GET/PUT /api/kbs/:kbId/ai-overrides` | Per-KB AI config overrides. |
| `GET /api/kbs/:kbId/analytics` | Per-KB query analytics (403 on cross-org access). |
| `POST /api/kbs/:kbId/documents` | **Upload** (multipart `files`/`file`). MIME allowlist PDF/DOCX/XLSX/XLS/TXT/MD/CSV/HTML → 400 `INVALID_FILE_TYPE`; 50 MB cap → `FILE_TOO_LARGE`; optional virus-scan hook; 10/min/org. Returns 202 with `queued` + per-file `errors`. |
| `GET /api/kbs/:kbId/documents` | Document list with ingest status. |
| `GET/DELETE /api/kbs/:kbId/documents/:docId` | Document detail / delete (purges chunks). |
| `GET /api/kbs/:kbId/documents/:docId/chunks[/chunkId]` | Extracted chunks. |
| `POST …/documents/:docId/reprocess`, `POST …/documents/reprocess-all` | Re-ingest. |
| `GET/POST/DELETE /api/kbs/:kbId/api-keys[/:keyId]` | Embed API keys (`clr_…`, allowed origins, hourly limit). |
| `GET /api/kbs/:kbId/api-keys/:keyId/usage` | Key usage stats. |
| `POST /api/kbs/:kbId/scrape/*` | Website-scraping ingestion sessions (discover/start/progress/stream/cancel). |
| `GET/POST /api/kbs/:kbId/phone` | Phone-number binding for the KB agent. |

## 6. Chat & retrieval — `/api/chat*`, `/api/rag/*` (session or anonymous)

| Method & path | Purpose |
|---------------|---------|
| `POST /api/chat` | RAG chat. Body `{kbId, messages[{role,content}], sessionId?}` (Mode A) or `{documentId, messages…}` (legacy Mode B). Response is **NDJSON stream** events: answer chunks, sources, quota warnings, and typed `error` events. Subject to 60/min/org and the org's daily quota (402 `PLAN_LIMIT_EXCEEDED`). |
| `GET/POST/DELETE /api/chat/sessions[/:sessionId][/messages]` | Conversation history. |
| `POST /api/rag/search` | Direct hybrid retrieval for console users. |
| `GET /api/documents`, `GET /api/documents/:id/overview` | Legacy document catalog (pre-KB era). |

## 7. Voice — `/api/realtime/*`, `/api/gemini/*`, `/api/voice/*`

| Method & path | Purpose |
|---------------|---------|
| `POST /api/realtime/session` | Mint an ephemeral OpenAI Realtime session (`{kbId}` → grounded config; plan `voice` gate → 402). 10/hour/org. |
| `POST /api/gemini/session` | Gemini LiveKit equivalent. |
| `GET /api/voice/provider` | Resolved provider for the caller's config. |
| WebSocket `/api/embed/voice` | Voice media relay (attach via the embed widget; see `EMBED-GUIDE.md`). |

## 8. Public embed surface — `/api/embed/*` (API key, CORS-restricted)

| Method & path | Purpose |
|---------------|---------|
| `GET /api/embed/config` | Widget bootstrap config (persona, colors, suggested prompts). |
| `GET /api/embed/demo-config` | Fallback demo key for the marketing landing demo. |
| `POST /api/embed/chat` | Streaming chat for website visitors (NDJSON; per-key hourly limit + org daily quota). |
| `POST /api/embed/search` | Retrieval-only endpoint (same limits; friendly 502 on provider failure). |
| `POST /api/embed/rag` | Grounded chat used by the voice pipeline. |
| `POST /api/embed/session` / `voice-init` / `voice-connect` / `worklet` | Voice session bootstrap + SDP exchange + audio worklet. |

CORS: each key's `allowed_origins` is enforced (`buildCorsHeaders`);
wildcard only when the list is empty (public demo keys).

## 9. Billing — `/api/subscriptions/*`, `/api/webhooks/*`

| Method & path | Purpose |
|---------------|---------|
| `GET /api/subscriptions/plans` | **Public** plan catalogue (Free $0 · Starter $49 · Pro $149 · Enterprise custom). |
| `POST /api/subscriptions/checkout` | Stripe checkout session. |
| `GET /api/subscriptions/portal` | Stripe billing-portal link. |
| `POST /api/subscriptions/razorpay/order` / `verify` | Razorpay flow. |
| `POST /api/subscriptions/expiry-sweep` | Manual sweep trigger (also runs every 6 h automatically). |
| `POST /api/webhooks/stripe` / `razorpay` | Provider webhooks (signature-verified). |

## 10. Platform internals & workers

| Method & path | Purpose |
|---------------|---------|
| `GET /api/health` | Public health: db/qdrant checks, version, uptime, memory. 503 when degraded. |
| `POST /api/internal/init` | Bridge handshake (shared `WORKER_SECRET`). |
| `GET /api/internal/outbox[/…/published|failed]` | Transactional-outbox relay endpoints for the RabbitMQ bridge. |
| `POST /api/worker/ingest` / `worker/scrape` | Worker triggers (shared secret; the in-process poller makes these optional). |
| `POST /api/admin/notifications[/retry]` | Admin notification queue. |
| `POST /api/csp-report` | CSP violation collector. |
| `/api/phone/*` (twilio/vonage) | Telephony webhooks + WebSocket streams. |

---

## 11. Quick curl walkthrough

```bash
# login (tenant admin)
TOKEN=$(curl -s -X POST https://app.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"omen-admin@omeninsurance.com","password":"•••"}' | jq -r .token)

# list KBs
curl -s https://app.example.com/api/kbs/all -H "Authorization: Bearer $TOKEN" | jq '.[].name'

# upload a PDF (202 + queued)
curl -s -X POST https://app.example.com/api/kbs/<kbId>/documents \
  -H "Authorization: Bearer $TOKEN" -F files=@policy.pdf | jq .

# chat (NDJSON stream)
curl -sN -X POST https://app.example.com/api/chat \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"kbId":"<kbId>","messages":[{"role":"user","content":"What is the theft excess?"}]}'
```
