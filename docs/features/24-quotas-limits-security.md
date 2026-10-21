# 24 — Quotas, Limits, Security & Observability

> Clara AI Platform feature documentation · Domain: `lib/{quota,rate-limit,redact}` + `security/*` + CSP · Base: `feature/ai-core-from-doable-source @ 031279b4` (historical source anchors; NET_TRACE is not committed)

## 1. Definition & Purpose

The cross-cutting guardrails: plan-driven quotas and per-key rate limits that meter every meterable surface; the security layer (CSP with report collection, blocked-domain egress control, PII redaction, secret hygiene, virus scanning); and platform incident reporting for vendor/service failures, with tenant-safe response messages (Feature 21). The previously proposed NET_TRACE network-style tracing is **not committed** on this branch. Its purpose is the platform's operating covenant: capacity is enforced, secrets and PII never leak, and every failure is captured with evidence for the platform admin — invisibly to end users.

## 2. Business Logic

- **Quotas** — `src/lib/quota.ts` (+ `/api/orgs/[orgId]/usage-limits`, `/api/meters`, `029_mode_b_quota_audit.sql`): per-plan usage admission before chat/search/embed/voice/MCP; soft warning at 80% (`quota_warning` event, WS-1.2); plan changes re-derive limits (Feature 17).
- **Rate limiting** — `src/lib/rate-limit.ts`: fixed-window limiter `hit:64` (bucket, limit, window), `resetRateLimits:86` (tests), `clear:95`, HTTP shaping `rateLimitResponse:119` (Retry-After + curated message).
- **CSP & egress** — `src/security/csp.ts` builds the Content-Security-Policy (vendor allowlists for Razorpay/Vercel/WebSocket origins — visible in production headers); violations report to `/api/csp-report`; `src/security/blocked-domains.ts` + `scripts/scan-blocked-domains.ts` control outbound scraping egress.
- **Redaction & secrets** — `src/lib/redact.ts`: `RedactionType:42` (email/phone/payment), `redactText:55` (counts via `redactionEntries:81`) applied across logs/analytics; `src/lib/secrets.ts` (`ENCRYPTION_KEY:20`) encrypts integration credentials; do not rely on uncommitted NET_TRACE scrubbing.
- **NET_TRACE proposal — not implemented in this branch:** earlier local work described network-style request/vendor tracing, but `src/lib/net-trace.ts` and its corresponding test files are absent. No always-on trace or per-vendor-call visibility guarantee should be inferred from this document. Current operational incidents use `src/modules/platform-health/core/incidents.ts` (Feature 21).
- **Virus scan** — `src/modules/ingest/virus-scan.ts` (Feature 06) gates uploads.
- **Login lockout** — Feature 01 (031 migration) — brute-force control.

## 3. Business Rules

- Existing platform incident reporting does not depend on a NET_TRACE flag (Feature 21). NET_TRACE success rows and verbose body-preview behavior are **not implemented on this branch**.
- Org-facing surfaces return only curated/generic messages + x-request-id — raw internals (regions, keys, upstream detail) stay in server logs (the leak-closed chat catch, `PublicChatValidationError`).
- Quota admission precedes any billable vendor call; 80% soft warning before hard block.
- Rate-limit responses are shaped (Retry-After), never 500s.
- PII (email/phone/payment) is redacted by default everywhere; raw values only via audited reveal (Feature 20).
- Egress to non-allowlisted domains is blocked for crawlers; CSP violations are collected and reviewed.

## 4. Data Model

- `029_mode_b_quota_audit.sql`, quota/usage spine tables (Feature 20); no tables for CSP/redaction. NET_TRACE is not current source.

## 5. API Surface

| Route | Purpose |
|---|---|
| `src/app/api/orgs/[orgId]/usage-limits/route.ts` | plan limits read |
| `src/app/api/meters/route.ts` | current meter readings |
| `src/app/api/csp-report/route.ts` | CSP violation collector |
| `/api/kbs/[kbId]/documents`, `/api/kbs/[kbId]/embedding-index` | Tenant-safe processing failure responses (Features 05/06/21) |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/lib/rate-limit.ts` | `hit:64`, `rateLimitResponse:119`, `resetRateLimits:86` |
| `src/lib/redact.ts` | `redactText:55`, `RedactionType:42` |
| `src/modules/knowledge-bases/core/public-processing-error.ts` | Tenant-safe document/re-index provider error presentation (API-layer use) |
| `src/security/csp.ts` | CSP builder (+ `csp.test.ts`) |
| `src/security/blocked-domains.ts` | egress allowlist (+ `blocked-domains.test.ts`) |
| `src/lib/quota.ts` | plan quota admission |

## 7. UI Reference

- Quota UX: dashboard usage bars (`(admin)/dashboard/page.tsx`), quota warning banners in chat (`OrganizationStatusBanner.tsx` lineage).
- No committed NET_TRACE UI or log plane. Runtime flags are available in the administration environment view; provider incidents surface through Feature 21.

## 8. Environment Variables

- Rate-limit tuning variables and CSP reporting configuration. The NET_TRACE environment switches described in the older sandbox draft are not a current source feature; do not assume deployment support.

## 9. Tests

- Committed security, quota, rate-limit, Gemini relay, and `src/modules/knowledge-bases/core/public-processing-error.test.ts` regression suites. The older NET_TRACE unit/adapter test files are absent and must not be counted as executable tests.

## 10. Cross-links

- Quota consumers — **08/09/13/23**; metering writers — **20**; incident pairing — **21**; provider egress visibility — **10**; virus scan — **06**.
