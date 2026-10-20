# 20 — Analytics, Audit & Usage Metering

> Clara AI Platform feature documentation · Domain: `/api/analytics/*` + audit + events (usage spine) · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

This feature is the platform's memory of what happened: organisation analytics (dashboard metrics, query patterns, usage meters), platform analytics (admin overview, revenue, documents overview), the tamper-evident audit trail (query audit with verify/reveal/export), and the usage-event spine that meters every meterable surface (chat tokens, embeddings, voice seconds, language characters, MCP calls). Its purpose is twofold — business intelligence for tenants/platform, and compliance-grade evidence for privileged actions.

## 2. Business Logic

- **Org analytics** — `/api/analytics/org` (+ `/api/orgs/[orgId]/dashboard`): usage trends, query counts, KB freshness for the tenant dashboard.
- **Platform analytics** — `/api/platform/stats` (route line 7), `/api/platform/revenue` (+ `/api/analytics/revenue`), `/api/analytics/admin`, `/api/analytics/documents` (+ `/api/documents/overview`): cross-tenant KPIs for the super-admin console.
- **Query analytics** — `/api/analytics/queries` — per-question audit of RAG turns (latency, sources, grounding outcome) persisted per query-audit migration.
- **Usage metering** — `/api/analytics/usage` + `/api/meters` read the usage-event spine; writers: chat `finalizeQueryEvent` (tokens + latency, Feature 08), voice meters (Feature 16), language events (Feature 19), MCP metering (Feature 23: `checkMcpQuotaAdmission:69`, `recordMcpUsage:119`, `getMcpUsageSummary:156`).
- **Audit trail** — `/api/analytics/audit` (list), `/verify` (tamper check), `/reveal` (privileged plaintext reveal), `/export` (compliance export) — backed by `027_query_audit.sql` + `030_audit_hardening.sql` chain-hashing; reveals are themselves audited.
- **Meters route** — `/api/meters` exposes current-period meter readings per org/plan for quota UI (Feature 24).

## 3. Business Rules

- Audit rows are append-only and hash-chained; verification detects tampering; reveals require elevated privilege and are logged.
- PII (email/phone/payment) is redacted in analytics surfaces (`lib/redact.ts` `redactText:55`, types `:42`) — raw values only via audited reveal.
- Usage events are the single source of truth for quota checks and billing-relevant metering — no surface bills from ad-hoc counts.
- Analytics never expose cross-tenant data to organisation roles (tenant isolation enforced at query level).
- Revenue analytics reconcile against subscription audit rows (Feature 17), not raw webhook payloads.

## 4. Data Model

- `004_analytics_events.sql`, `009_usage_analytics.sql`, `027_query_audit.sql`, `028_usage_metering.sql`, `029_mode_b_quota_audit.sql`, `030_audit_hardening.sql`, `010_subscription_audit.sql`.

## 5. API Surface

| Route | Handler anchor |
|---|---|
| `src/app/api/platform/stats/route.ts:7` | platform KPIs |
| `src/app/api/analytics/{org,admin,queries,revenue,usage,documents}` | analytics reads |
| `src/app/api/analytics/audit{,/verify,/reveal,/export}` | audit trail ops |
| `src/app/api/meters/route.ts` | meter readings |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/lib/redact.ts` | `RedactionType:42`, `redactText:55`, `redactionEntries:81` |
| `src/modules/events/outbox-db.ts` | `insertOutboxEvent:14`, `claimOutboxEvents:46`, `markOutboxPublished:85`, `markOutboxFailed:96` (event outbox — Feature 25 transport) |
| usage event writers | chat.ts `finalizeQueryEvent`; voice `metering.ts`; language `pricing.ts:95-143`; MCP `mcp/metering.ts:69-217` |

## 7. UI Reference

- `src/app/(admin)/dashboard/page.tsx` — org dashboard; `src/app/(admin)/analytics/page.tsx` + `src/features/admin/screens/analytics-screen.tsx` — analytics console.
- `src/app/(admin)/orgs/[id]/billing/page.tsx` — usage vs plan.
- Super-admin: `src/app/(admin)/ai-platform/page.tsx` (platform stats/revenue panels).

## 8. Environment Variables

- None dedicated (spine is DB-backed; outbox transport vars — Feature 25).

## 9. Tests

- redact tests, audit verify/reveal tests, metering suites across voice/language/MCP modules (see `scripts/feature-doc/tests.txt`).

## 10. Cross-links

- Event writers — **08/14/15/16/19/23**; quota admission consumes meters — **24**; revenue reconciles with **17**; outbox transport — **25**.
