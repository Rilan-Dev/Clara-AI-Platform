# Clara AI Platform — Feature Documentation

> Complete feature definition set: every feature's purpose, business logic, business rules, data model, API surface, core module files (with line anchors), UI references, environment variables, tests, and cross-links.
>
> **Base:** `feature/ai-core-from-doable-source @ 1adb80bf` (+ uncommitted local NET_TRACE observability work, marked per-doc).
> **Generated:** 2026-10-20. Line anchors are exact at this commit; re-run `scripts/gather-feature-inventory.sh` after major changes to refresh them.

## Feature Matrix

| # | Feature | Module domains | Migrations (key) | Doc |
|---|---|---|---|---|
| 01 | Authentication & Sessions | `auth` | 001, 002, 026, 031, 048 | [01-authentication-sessions.md](./01-authentication-sessions.md) |
| 02 | Identity, RBAC & Policies | `auth`, `admin/api` | 002, 027, 030 | [02-identity-rbac-policies.md](./02-identity-rbac-policies.md) |
| 03 | Organisations & Membership | `organisations` | 001, 002, 050 | [03-organisations-membership.md](./03-organisations-membership.md) |
| 04 | Agent Lifecycle & Versioning | `agent-versioning` | 040, 044, 047 | [04-agent-lifecycle-versioning.md](./04-agent-lifecycle-versioning.md) |
| 05 | Knowledge Bases | `knowledge-bases`, `admin` | 003, 005, 014, 017 | [05-knowledge-bases.md](./05-knowledge-bases.md) |
| 06 | Document Ingestion Pipeline | `ingest`, `admin/core` | 003 | [06-document-ingestion.md](./06-document-ingestion.md) |
| 07 | Web Scraping & Crawling | `ingest/crawlers`, `queue` | 007 | [07-web-scraping-crawling.md](./07-web-scraping-crawling.md) |
| 08 | RAG Chat & Grounding | `assistant`, `rag` | 016, 027, 028 | [08-rag-chat-grounding.md](./08-rag-chat-grounding.md) |
| 09 | Search & Hybrid Retrieval | `admin/core`, `rag`, `graph` | — (Qdrant) | [09-search-retrieval-hybrid.md](./09-search-retrieval-hybrid.md) |
| 10 | AI Provider Core | `ai-core` | 074 | [10-ai-provider-core.md](./10-ai-provider-core.md) |
| 11 | AI Catalog & Governance | `ai-governance` | 043, 041, 055 | [11-ai-catalog-governance.md](./11-ai-catalog-governance.md) |
| 12 | AI Settings & Model Defaults | `organisations` | 008, 013-015, 042, 044, 053, 056, 059, 075 | [12-ai-settings-defaults.md](./12-ai-settings-defaults.md) |
| 13 | Embeddable Widget & Demo | `embed` | 005, 017, 029 | [13-embeddable-widget.md](./13-embeddable-widget.md) |
| 14 | Voice — ElevenLabs | `voice-core` | 033, 034, 037, 046, 057, 058 | [14-voice-elevenlabs.md](./14-voice-elevenlabs.md) |
| 15 | Voice — Sarvam Realtime | `voice-core` | 036, 041, 045, 064 | [15-voice-sarvam.md](./15-voice-sarvam.md) |
| 16 | Voice — Realtime & Telephony | `voice-core/realtime`, `phone` | 011, 037, 038 | [16-voice-realtime-telephony.md](./16-voice-realtime-telephony.md) |
| 17 | Payments & Subscriptions | `billing` | 006, 010, 035, 051, 055, 063 | [17-payments-subscriptions.md](./17-payments-subscriptions.md) |
| 18 | Platform Email System | `lib/email*` | 018, 032, 049 | [18-platform-email-system.md](./18-platform-email-system.md) |
| 19 | Language & Multilingual AI | `language-core`, `rag` | 059 | [19-language-multilingual.md](./19-language-multilingual.md) |
| 20 | Analytics, Audit & Metering | `/api/analytics`, `events` | 004, 009, 027-030 | [20-analytics-audit.md](./20-analytics-audit.md) |
| 21 | Platform Health & Incidents | `platform-health` | 054, 068 | [21-platform-health-ops.md](./21-platform-health-ops.md) |
| 22 | Platform Administration | `/api/platform` | 012, 015, 039, 052, 053 | [22-platform-administration.md](./22-platform-administration.md) |
| 23 | Integrations, MCP & WhatsApp | `integrations`, `mcp` | 060-073 | [23-integrations-mcp-whatsapp.md](./23-integrations-mcp-whatsapp.md) |
| 24 | Quotas, Limits, Security & Observability | `lib/*`, `security` | 029 | [24-quotas-limits-security.md](./24-quotas-limits-security.md) |
| 25 | Background Jobs & Messaging | `queue`, `cloud-jobs`, `events` | 025 | [25-background-jobs-messaging.md](./25-background-jobs-messaging.md) |
| 26 | Deployment & Environments | compose, nginx, `lib/env-scope` | 001-075 (runner) | [26-deployment-environments.md](./26-deployment-environments.md) |

## Platform at a Glance

- **Scale:** 244 API route files · 26 module domains (318 non-test module files) · 75 SQL migrations · 250 test files · 67 UI pages · 106 feature-UI components.
- **Request lifecycle:** Auth (01) → RBAC/org guard (02/03) → agent config resolution from the ACTIVE deployment (04) → quota admission (24) → grounding retrieval over KB collections (05-09) → provider call through the abstraction (10) → streamed NDJSON answer with citations (08) → usage event + audit row (20) → incident capture on failure (21).
- **Voice path:** same spine with realtime engines (14-16) and per-second metering.
- **Async path:** upload → BullMQ/cloud queue → worker pipeline (25) → Qdrant (06).
- **Money path:** plan catalog → checkout/webhook → entitlements + quotas (17 → 11 → 24).

## Governing Policies (cross-feature)

1. **Issue visibility** — problems are captured + platform-admin notified; organisation end users never see raw internals (curated messages + x-request-id only). Docs 08, 21, 24.
2. **Fail-closed** — catalog reconciliation, MCP tool admission, ingestion honesty, deletion integrity all refuse partial success. Docs 05, 06, 11, 23.
3. **Deployment pinning** — only published agent deployments serve traffic; KB collections snapshotted per deployment. Doc 04.
4. **Metered everything** — chat tokens, embeddings, voice seconds, language chars, MCP calls all flow into one usage-event spine that drives quotas and billing. Docs 14-20, 23, 24.
5. **Environment isolation** — CLARA_ENV scopes schema/collections/queues structurally. Docs 25, 26.

## Known In-Flight / Open Items (2026-10-20)

- **NET_TRACE observability** — fully implemented + tested locally (38 tests), uncommitted per owner directive; live-try bundle in sandbox `download/net-trace-local-bundle/`. Doc 24.
- **Edge streaming** — production OpenResty edge buffers `/api/chat` NDJSON (Task C benchmark evidence: sources==firstToken==total); fix = apply the repo nginx `proxy_buffering off; gzip off` pattern to the edge's `/api/chat` location. Doc 26.
- **Retry queue (owner-side)** — PoliciesEn001 + SDAIA NDMO document retries; email-KB (ab69cf61) chat grounding re-verification; 429 RetryInfo-aware backoff go/no-go. Docs 06, 10.
- **Free-tier RPM ceiling** — 3/4 concurrent chat capacity measured (4th gracefully degraded) — billing upgrade on the Gemini key is the root fix. Docs 10, 17.

## How to Keep These Docs Alive

1. After significant commits, re-run `bash scripts/gather-feature-inventory.sh` (sandbox) — regenerates route/module/UI/test/anchor inventories.
2. Update the affected feature doc's line anchors (each doc cites its anchors inline).
3. New feature → copy the doc template (10 sections) and add a matrix row here.
