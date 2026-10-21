# 21 — Platform Health, Incidents & Operations

> Clara AI Platform feature documentation · Domain: `platform-health` + services-status + notifications + cron · Base: `feature/ai-core-from-doable-source @ 031279b4`

## 1. Definition & Purpose

The platform-health system is the owner's "capture issues, notify the platform admin, never show them to org users" policy made concrete: runtime incident recording (embedding/brain failures, provider outages), the services-status board, health-alert banners for super-admins, incident-triggered emails, notification retry, runtime flags, and the cron sweeps (ai-health, whatsapp health/briefings, onboarding reminders). Its purpose is that every production problem is captured with evidence, escalates to the right admin surface, and NEVER surfaces raw to organisation end users.

## 2. Business Logic

- **Incident recording** — `src/modules/platform-health/core/incidents.ts`: `syncPlatformHealthIncidents:157` (DB ↔ banner state sync), `recordRuntimeIncident:267` (generic), `recordEmbeddingRuntimeFailure:358` + `noteEmbeddingRequestSucceeded:294` (embedding watchdog with success-streak reset), `recordBrainRuntimeFailure:470` + `noteBrainRequestSucceeded:538` (LLM watchdog). Incidents write DB rows, drive the super-admin banner, and email (rate-limited 10 min per key).
- **Services status** — `/api/platform/services-status` aggregates provider/gateway/infra checks (AI providers, payment gateways via `billing/core/health.ts`, Qdrant, phone env) for `system-status` screens; hotfix lineage `hotfix/services-status-checkresult` preserves AI check result shape on fallback.
- **Health alerts** — `/api/platform/health-alerts` + migration `054_platform_health_alerting.sql` — alert banner for super-admin shell (org-platform-admin gating lineage).
- **Notifications console** — `/api/admin/notifications` (+ `/retry`) — queued notification driver with retry (Feature 18 queue).
- **Runtime flags** — `/api/platform/runtime-flags` + `src/lib/runtime-flags.ts`: `RuntimeFlag:12`, `RuntimeFlagGroup:24`, `describeRuntimeFlags:43` — operator-visible feature switches (env-derived, grouped).
- **Cron sweeps** — `/api/cron/ai-health` (route line 114) provider availability; `/api/cron/whatsapp-connection-health` (line 42) WhatsApp session health (`068_whatsapp_connection_health.sql`); `/api/cron/whatsapp-daily-briefings`; `/api/cron/onboarding-reminders` (lifecycle mails).
- **Knowledge embedding incidents** — failed re-index requests already call `recordEmbeddingRuntimeFailure`; failed document ingest now calls it for quota/provider errors after internal failure recording. That pathway uses the platform-admin incident/notification layer, not organisation portal JSON. Gemini quota/billing restoration and delivery verification belong to OPS-01 [issue #300](https://github.com/Rilan-Dev/Clara-AI-Platform/issues/300).\n- **Health endpoint** — `/api/health` (route line 25) — liveness for edge/monitors.

## 3. Business Rules

- Runtime incidents are recorded independently of any proposed NET_TRACE logging feature (Feature 24); vendor health requires the platform incident reporter.
- Incidents are rate-limited per key (no alert storms) and always DB-persisted even when email fails.
- Org-facing surfaces must not render incident internals; provider errors are converted to fixed, actionable messages at the KB API response boundaries (Features 05/06/24). Platform-admin incident logging and attempted notifications remain separate from tenant-visible status.
- Watchdogs reset on success streaks (a single failure after long health is recorded but doesn't keep an incident open falsely).
- Services-status is honest about "not configured" vs "down" — never fabricates green.

## 4. Data Model

- `054_platform_health_alerting.sql`, `068_whatsapp_connection_health.sql`, notification queue tables (Feature 18), incident tables in platform-health module.

## 5. API Surface

| Route | Handler anchor |
|---|---|
| `src/app/api/platform/services-status/route.ts` | status board |
| `src/app/api/platform/health-alerts/route.ts` | alert banner |
| `src/app/api/cron/ai-health/route.ts:114` | AI provider sweep |
| `src/app/api/cron/whatsapp-connection-health/route.ts:42` | WhatsApp health |
| `src/app/api/cron/{whatsapp-daily-briefings,onboarding-reminders}` | lifecycle crons |
| `src/app/api/admin/notifications{,/retry}` | notification console |
| `src/app/api/health/route.ts:25` | liveness |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/platform-health/core/incidents.ts` | `syncPlatformHealthIncidents:157`, `recordRuntimeIncident:267`, `recordEmbeddingRuntimeFailure:358`, `recordBrainRuntimeFailure:470`, `noteEmbeddingRequestSucceeded:294`, `noteBrainRequestSucceeded:538` |
| `src/lib/runtime-flags.ts` | `RuntimeFlag:12`, `describeRuntimeFlags:43` |
| `src/modules/billing/core/health.ts` | gateway checks (Feature 17) |

## 7. UI Reference

- `src/app/(admin)/system-status/page.tsx` + `src/features/admin/screens/system-status-screen.tsx` — services board.
- `src/components/admin/PlatformHealthAlertBanner.tsx` — super-admin alert banner (admin-gated load).
- `src/app/(admin)/settings/environment/page.tsx` — runtime flags view.

## 8. Environment Variables

- Cron auth secrets (`set_cron_secret.py` lineage), incident email recipient vars. NET_TRACE verbose evidence is not available on the current committed branch.

## 9. Tests

- platform-health module suites, services-status shape tests, notification retry tests, and the authored `src/modules/knowledge-bases/worker/ingest-worker.incident.test.ts` provider-failure regression source. Test execution and live notification delivery remain unverified.

## 10. Cross-links

- Incident sources — **10 Provider Core** failures, **06 Ingestion** embedding errors, **17 gateway health**; notifications via **18 Email**; cron scheduling — **25**; observability detail — **24**.
