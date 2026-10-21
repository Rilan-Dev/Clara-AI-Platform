# Clara AI Platform — Feature Documentation

> Feature-domain reference covering purpose, business rules, data model, API surfaces, implementation paths, UI, environment variables, tests, and related features. This catalogue is not proof that every path or feature is deployed or verified.
>
> **Original documentation baseline (historical):** `feature/ai-core-from-doable-source @ 031279b4`. The active branch has changed since this snapshot; the original line-number anchors and counts require source-level revalidation.
> **Index audit:** 2026-10-22 — all 30 indexed feature files are present and retain the common ten-section structure. The former inventory generator `scripts/gather-feature-inventory.sh` and `scripts/feature-doc/*` snapshot files are **not part of this branch**. Run `node scripts/check-feature-docs.mjs` to verify index completeness, sequence, structure and relative links; verify code anchors against current source separately.

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
| 27 | Agent Conversation Experience | `features/agent-conversation`, `app/agents`, `app/preview` | — (consumes 04/08/13) | [27-agent-conversation-experience.md](./27-agent-conversation-experience.md) |
| 28 | Public Website & Growth | `features/platform`, `(platform)` pages | 048, 049, 050 | [28-public-website-growth.md](./28-public-website-growth.md) |
| 29 | AI Platform Runtime & Console | `ai-platform-core`, `components/admin/ai-platform` | 069-073 (MCP) | [29-ai-platform-runtime.md](./29-ai-platform-runtime.md) |
| 30 | Workspace & Onboarding | `features/workspace`, `organisations/core/workspace.ts` | 048-050, 052 | [30-workspace-onboarding.md](./30-workspace-onboarding.md) |

## Platform at a Glance

- **Historical scale snapshot (2026-10-20, not recomputed for current HEAD):** 244 API route files · 26 module domains · 75 SQL migrations · 250 test files · 67 UI pages · 106 feature-UI components. These figures must not be used as current build/deployment evidence.
- **Request lifecycle:** Auth (01) → RBAC/org guard (02/03) → agent config resolution from the ACTIVE deployment (04) → quota admission (24) → grounding retrieval over KB collections (05-09) → provider call through the abstraction (10) → streamed NDJSON answer with citations (08) → rendered by the end-user conversation layer (27) → usage event + audit row (20) → incident capture on failure (21).
- **Acquisition path:** visitor → landing/demos (28) → signup + email verification (28/01) → pricing + checkout (28/17) → onboarding gate + reminders (30) → daily workspace chat (30/27).
- **AI capability path:** tenant context (29 execution context) → adapter registry (29) → unified tool runtime (29) → rag_search / MCP / integration tools (29/23) → bounded agentic loop (29), flag-gated per environment.
- **Voice path:** same spine with realtime engines (14-16) and per-second metering.
- **Async path:** upload → BullMQ/cloud queue → worker pipeline (25) → Qdrant (06).
- **Money path:** plan catalog → checkout/webhook → entitlements + quotas (17 → 11 → 24).

## Governing Policies (cross-feature)

1. **Issue visibility** — problems are captured + platform-admin notified; organisation end users never see raw internals (curated messages + x-request-id only). Docs 08, 21, 24.
2. **Fail-closed** — catalog reconciliation, MCP tool admission, ingestion honesty, deletion integrity all refuse partial success. Docs 05, 06, 11, 23.
3. **Deployment pinning** — only published agent deployments serve traffic; KB collections snapshotted per deployment. Doc 04.
4. **Metered everything** — chat tokens, embeddings, voice seconds, language chars, MCP calls all flow into one usage-event spine that drives quotas and billing. Docs 14-20, 23, 24.
5. **Environment isolation** — CLARA_ENV scopes schema/collections/queues structurally. Docs 25, 26.

## Known Open Items and Historical Context (reviewed 2026-10-22)

- **NET_TRACE observability — NOT PRESENT IN THIS BRANCH:** the original inventory described local-only source and 38 tests. `src/lib/net-trace.ts` and the related NET_TRACE test files are not committed; this must not be treated as a deployed or indexed feature. See [Feature 24](./24-quotas-limits-security.md) for the implemented controls.
- **Edge streaming** — production OpenResty edge buffers `/api/chat` NDJSON (Task C benchmark evidence: sources==firstToken==total); fix = apply the repo nginx `proxy_buffering off; gzip off` pattern to the edge's `/api/chat` location. Doc 26.
- **Embedding provider quota — OPS-01 [issue #300](https://github.com/Rilan-Dev/Clara-AI-Platform/issues/300):** Gemini 429s blocked knowledge re-index and document ingestion. The KB API error-presentation and admin-incident source corrections are committed; provider quota/billing recovery and deployment verification remain operational work. See [Features 05](./05-knowledge-bases.md), [06](./06-document-ingestion.md), and [21](./21-platform-health-ops.md).
- **Free-tier RPM ceiling** — 3/4 concurrent chat capacity measured (4th gracefully degraded) — billing upgrade on the Gemini key is the root fix. Docs 10, 17.

## How to Keep These Docs Alive

1. Run `node scripts/check-feature-docs.mjs` and `node --test scripts/check-feature-docs.test.mjs` after index edits to detect missing, orphaned, duplicate or malformed feature docs and broken relative document links.
2. Verify each implementation reference and any legacy `:line` anchor against **current** code before updating it. The old `031279b4` anchors are historical, not automatically refreshed by this checker.
3. For a newly implemented feature domain, use the same ten-section template, add one sequential matrix row here, and link related feature documents. Do not index local-only or uncommitted work as implemented.
