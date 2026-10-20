# 24 — Quotas, Limits, Security & Observability

> Clara AI Platform feature documentation · Domain: `lib/{quota,rate-limit,redact,net-trace}` + `security/*` + CSP · Base: `feature/ai-core-from-doable-source @ 031279b4` (net-trace wiring is UNCOMMITTED local work)

## 1. Definition & Purpose

The cross-cutting guardrails: plan-driven quotas and per-key rate limits that meter every meterable surface; the security layer (CSP with report collection, blocked-domain egress control, PII redaction, secret hygiene, virus scanning); and the NET_TRACE observability system that prints Network-tab-equivalent request/vendor traces into docker/Vercel logs while org users only ever see curated errors. Its purpose is the platform's operating covenant: capacity is enforced, secrets and PII never leak, and every failure is captured with evidence for the platform admin — invisibly to end users.

## 2. Business Logic

- **Quotas** — `src/lib/quota.ts` (+ `/api/orgs/[orgId]/usage-limits`, `/api/meters`, `029_mode_b_quota_audit.sql`): per-plan usage admission before chat/search/embed/voice/MCP; soft warning at 80% (`quota_warning` event, WS-1.2); plan changes re-derive limits (Feature 17).
- **Rate limiting** — `src/lib/rate-limit.ts`: fixed-window limiter `hit:64` (bucket, limit, window), `resetRateLimits:86` (tests), `clear:95`, HTTP shaping `rateLimitResponse:119` (Retry-After + curated message).
- **CSP & egress** — `src/security/csp.ts` builds the Content-Security-Policy (vendor allowlists for Razorpay/Vercel/WebSocket origins — visible in production headers); violations report to `/api/csp-report`; `src/security/blocked-domains.ts` + `scripts/scan-blocked-domains.ts` control outbound scraping egress.
- **Redaction & secrets** — `src/lib/redact.ts`: `RedactionType:42` (email/phone/payment), `redactText:55` (counts via `redactionEntries:81`) applied across logs/analytics; `src/lib/secrets.ts` (`ENCRYPTION_KEY:20`) encrypts integration credentials; net-trace adds secret scrubbing (authorization/api-key/token keys; sk-/AIza/JWT/hex patterns) with PII redaction reuse.
- **NET_TRACE observability (uncommitted)** — `src/lib/net-trace.ts`: `netTraceLevel:61` (off/on/verbose from env, lazy read), `netTraceRequest:225` (always-constructible handle; `end()` level-gated summary, `fail()` ALWAYS captures), `netTraceError:303`, `netTraceUpstream:338` (vendor rows; HTTP status auto-extraction from SDK errors), `netTraceChain:131` (cause-chain flattening). Wired: chat.ts, embed/chat, embed/search, Gemini/OpenAI providers (per-vendor-call rows). Correlation: reuses the browser's `x-request-id` (echoed on responses) so docker/Vercel log rows match devtools Network rows 1:1; trace/req id fields are exempt from PII masking (correlation-preservation rule).
- **Virus scan** — `src/modules/ingest/virus-scan.ts` (Feature 06) gates uploads.
- **Login lockout** — Feature 01 (031 migration) — brute-force control.

## 3. Business Rules

- Failure capture is ALWAYS-ON (independent of NET_TRACE level); success rows require `on`/`verbose`; body previews only at `verbose` with redaction + truncation markers.
- Org-facing surfaces return only curated/generic messages + x-request-id — raw internals (regions, keys, upstream detail) stay in server logs (the leak-closed chat catch, `PublicChatValidationError`).
- Quota admission precedes any billable vendor call; 80% soft warning before hard block.
- Rate-limit responses are shaped (Retry-After), never 500s.
- PII (email/phone/payment) is redacted by default everywhere; raw values only via audited reveal (Feature 20).
- Egress to non-allowlisted domains is blocked for crawlers; CSP violations are collected and reviewed.

## 4. Data Model

- `029_mode_b_quota_audit.sql`, quota/usage spine tables (Feature 20); no tables for CSP/redaction/net-trace (pure runtime).

## 5. API Surface

| Route | Purpose |
|---|---|
| `src/app/api/orgs/[orgId]/usage-limits/route.ts` | plan limits read |
| `src/app/api/meters/route.ts` | current meter readings |
| `src/app/api/csp-report/route.ts` | CSP violation collector |
| (all traced routes) `/api/chat`, `/api/embed/chat`, `/api/embed/search` | NET_TRACE-wired (uncommitted) |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/lib/rate-limit.ts` | `hit:64`, `rateLimitResponse:119`, `resetRateLimits:86` |
| `src/lib/redact.ts` | `redactText:55`, `RedactionType:42` |
| `src/lib/net-trace.ts` | `netTraceLevel:61`, `netTraceRequest:225`, `netTraceError:303`, `netTraceUpstream:338`, `netTraceChain:131` |
| `src/security/csp.ts` | CSP builder (+ `csp.test.ts`) |
| `src/security/blocked-domains.ts` | egress allowlist (+ `blocked-domains.test.ts`) |
| `src/lib/quota.ts` | plan quota admission |

## 7. UI Reference

- Quota UX: dashboard usage bars (`(admin)/dashboard/page.tsx`), quota warning banners in chat (`OrganizationStatusBanner.tsx` lineage).
- No UI for net-trace (log-plane only by design); runtime flags visible in `(admin)/settings/environment/page.tsx`.

## 8. Environment Variables

- `NET_TRACE` (off|on|verbose), `NET_TRACE_BODY_CHARS` (1200, clamp 200-20000), `NET_TRACE_SLOW_MS` (1500) — documented in `.env.example` "Debug observability" section; rate-limit tuning vars; CSP report URI.

## 9. Tests

- `src/lib/__tests__/net-trace.test.ts` (34 tests — level gating, always-on capture, correlation-id non-masking, scrubbing, truncation, circular refs, upstream gating), `src/modules/ai-core/providers/openai.net-trace.test.ts` (4), `gemini.relay.integration.test.ts` (10), `src/security/__tests__/{csp,blocked-domains}.test.ts`, redact/quota/rate-limit suites (29 tests).

## 10. Cross-links

- Quota consumers — **08/09/13/23**; metering writers — **20**; incident pairing — **21**; provider egress visibility — **10**; virus scan — **06**.
