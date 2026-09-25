# AI Configuration Synchronization Layer — Architecture & Implementation Plan

**Date:** 25-09-2026
**Status:** Proposed — awaiting owner approval before Phase 1 implementation
**Author:** Platform engineering (agent session, task ID `ai-config-sync-1`)
**Scope:** PostgreSQL → Redis → Provider Registry → all AI surfaces (chat, realtime voice, pipeline voice, background AI jobs, embed APIs, admin health checks)

---

## 1. Executive summary

Clara's AI configuration is already **DB-authoritative on paper**: platform-admin
settings, provider credentials, the provider registry, model catalogues and
defaults all live in PostgreSQL (`platform_env_settings`,
`platform_ai_providers`, `platform_ai_provider_credentials`,
`platform_ai_provider_models`, `platform_ai_defaults`, …). The recently merged
PR #232 made this true in practice on Vercel by hydrating DB-backed settings
into `process.env` before provider resolution.

However, the *sync model* that fix established is
`DB → process.env → Provider`, with per-instance in-process TTL caches. That
works today, but it is not the final architecture the platform owner has
specified. This document analyses the current state with file-level evidence,
and lays out the phased migration to:

```
PostgreSQL (source of truth)
        │  same-transaction revision bump
        ▼
Redis (authoritative runtime cache, revision-stamped)
        │  cache hit + revision validation (single gateway)
        ▼
Provider Registry — resolveProviderConfig(...)
        │
        ├── Chat API          ├── Realtime voice      ├── Embed APIs
        ├── Pipeline voice     ├── Background jobs     └── Admin health
        ▼
OpenAI · Gemini · Sarvam · ElevenLabs          (Qdrant stays the RAG/vector source)
```

Environment variables are demoted to **bootstrap / infrastructure /
emergency-fallback** roles and leave the normal credential path entirely.

---

## 2. Current state — evidence-based analysis

### 2.1 Where configuration lives (PostgreSQL — already authoritative)

| Data | Table(s) | Written by |
|---|---|---|
| Provider credentials + all platform env settings | `platform_env_settings` (key/value) | `setPlatformEnvSetting()` — `src/modules/phone/core/db.ts:283` |
| Provider enable/disable | `platform_ai_providers` | `setProviderEnabled()` — `src/modules/ai-governance/core/registry-db.ts` |
| Credential slots (env-key pointer, masked hint, `configured` flag) | `platform_ai_provider_credentials` | `updateProviderCredential()` — `registry-db.ts:300` |
| Capability support matrix | `platform_ai_provider_capabilities` | migrations/seed |
| Model catalogue | `platform_ai_provider_models` | `syncLiveProviderCatalog()` + admin |
| Platform defaults (chat/embedding/realtime) | `platform_ai_defaults`, `platform_ai_embedding_defaults` | admin Settings → AI |
| Provider health | `platform_ai_provider_health` | operator connection test |
| Plan entitlements | `plan_ai_provider_entitlements` (migration 055) | plan management |
| Org / agent AI settings | `org_ai_settings`, `agent_ai_settings` | tenant workspace |
| Immutable agent versions (published config) | agent-versioning tables | publish flow |

### 2.2 How it reaches the runtime today (`DB → process.env → Provider`)

1. **Hydration on read** — `getPlatformAIRegistry()` (`registry-db.ts:89-100`)
   calls `loadRuntimeSettingsOnStartup()` on *every cache miss*, which copies
   all non-empty `platform_env_settings` rows into `process.env`
   (`src/lib/db/migrate.ts:89-104`). DB values intentionally **override**
   platform env vars.
2. **Provider construction reads env directly** — `process.env.OPENAI_API_KEY`
   & friends are read at ~20 call sites (`ai-core/providers/{openai,gemini,sarvam}.ts`,
   `voice-core/providers/elevenlabs.ts`, `voice-core/api/elevenlabs/status.ts`,
   `assistant/api/{realtime,geminiSession}.ts`, `phone/core/call-handler.ts`,
   `language-core/model-catalog.ts`, `app/api/embed/session/route.ts`, …).
3. **Admin writes update only the local instance** — `setPlatformEnvSetting()`
   writes the DB row **and** mutates `process.env` of the one server instance
   that handled the request. Other warm instances converge only when their
   registry cache expires and re-hydrates.

### 2.3 Caches today (all per-instance, in-process)

| Cache | Location | TTL | Invalidation |
|---|---|---|---|
| Platform registry | `registry-db.ts:46-51` | 3 s | local mutation + TTL |
| Voice config | `voice-core/resolve.ts:140-176` | 5 s | TTL only |
| Agent production version | `agent-versioning/core/db.ts:489-496` | 3 s | publish invalidates locally |
| Agent draft config | `agent-versioning/core/db.ts:346-353` | 3 s | local mutation |
| Rate limiting | `lib/rate-limit.ts` | fixed window | in-memory only |

**Consequences of the current model:**

- Every warm instance re-runs the full registry join + env-settings query every
  3 s (`registry-db.ts:102-131` — 8 parallel queries) → avoidable DB load that
  scales with instance count.
- Convergence between instances is *eventual* (3–5 s), not event-driven; there
  is no fanout to BullMQ workers or voice services.
- No revision concept exists anywhere — staleness can only be detected by
  waiting for TTL expiry, never by comparison.
- The failure mode the owner called out is still reachable: a warm instance
  whose hydration raced an admin write can serve a stale credential for one
  TTL window.

### 2.4 What is already right (and must be preserved)

- **`resolveAIConfig()`** (`ai-core/resolve.ts:200`) is already a single,
  well-governed brain resolver: immutable version config → agent → org →
  platform registry default → env default, gated by `validateAgentAISelection()`
  (registry + entitlement + health) — the UI and runtime share one gate.
- **No silent substitution** for explicitly configured agents — only the
  *platform-default* source has a configured-provider fallback
  (`resolve.ts:302-331`); explicit selections fail loudly.
- **Redis infrastructure already exists in production**: `ioredis` + `bullmq`
  are dependencies (`package.json:81,93`); `src/modules/queue/redis.ts`
  standardises `REDIS_URL` / `REDIS_HOST` connectivity, and the RedisLabs
  instance already serves the crawl/retry/ingest workers.
- **Dual-read instrumentation pattern** (`noteLegacyResolutionFallback`,
  `resolve.ts:162-175`) — a proven migration technique this plan reuses.
- **Public error sanitisation** (`getPublicConversationError` in the published
  agent screen + embed error hardening from PR #232) — the visitor-facing half
  of the failure model already exists.

---

## 3. Target architecture

### 3.1 The rules (owner-specified, restated as invariants)

1. **Supabase/PostgreSQL is the persistent source of truth** — credentials,
   enabled state, provider configuration, models, platform defaults,
   health/configuration status.
2. **Redis is the runtime cache** — provider config, secure server-side
   credential representation, model/default resolution, health state,
   configuration revision.
3. **`process.env.OPENAI_API_KEY` must never be *required*** for a provider the
   Platform Admin has configured.
4. Env vars are **bootstrap / infrastructure / emergency fallback / local dev**
   only. `DB → Redis → runtime` is the normal production path.
5. **Admin changes invalidate Redis immediately** (same-transaction revision
   bump → post-commit cache write + event publish).
6. **Stale configuration is detectable** — every cached payload carries
   `provider_config_version` / `updated_at` / `credential_version`; the runtime
   compares `Redis revision != DB revision` and rehydrates.
7. **No silent provider substitution** for explicitly configured agents
   (already enforced — keep).
8. **Never** fall back to a random env credential when Redis is unavailable —
   degrade to PostgreSQL, refresh Redis, continue. Env fallback requires an
   explicit, flagged classification.

### 3.2 The single gateway

```
resolveProviderConfig(providerId, capability?)          
  │
  ├─ L1  in-process snapshot (revision-checked, ~250 ms)      ← avoids a Redis RTT per request
  ├─ L2  Redis  ai:cfg:<domain>:v<rev>  (revision-checked)    ← authoritative cache
  └─ L3  PostgreSQL (source of truth)                          ← miss / drift / Redis down
            │ decrypt (AES-256-GCM at rest in Redis, optional but recommended)
            ▼
       populate L2 (+revision) → return
```

- **No individual API route reads `process.env.<PROVIDER>_API_KEY`** — that is
  exactly how configuration drift happens. All ~20 current call sites route
  through the gateway (incremental adapter sweep, §5 Phase 4).
- Redis-unavailable path: **L3 direct read → attempt L2 repopulate → continue**.
  Env fallback only under `AI_CONFIG_ENV_FALLBACK=emergency` (explicit).
- Drift path (revision mismatch): rehydrate → update Redis → retry resolution
  once → re-check health → structured diagnostic → admin alert if still failing.

### 3.3 Failure model

Server-side structured diagnostics (never exposed publicly):

```
AI_CONFIG_RESOLUTION_FAILED
  provider:            openai
  source:              platform_admin
  db_configured:       true
  redis_configured:    false
  runtime_configured:  false
  config_revision:     42      ← PostgreSQL
  cache_revision:      41      ← Redis
  surface:             embed_chat
  instance:            hkg1-abc123
```

Public surface keeps the existing sanitised message: *"This assistant is
temporarily unavailable. Please try again later."*

### 3.4 Cache coverage map

| Data | Persistent source | Redis |
|---|---|---|
| Provider configuration | PostgreSQL | ✅ |
| Provider credentials | PostgreSQL (`platform_env_settings`) | ✅ secure server-side representation (encrypted) |
| Provider enabled state | PostgreSQL | ✅ |
| Provider health | PostgreSQL | ✅ |
| Platform AI defaults | PostgreSQL | ✅ |
| Org AI configuration | PostgreSQL | ✅ |
| Agent AI resolution inputs | PostgreSQL | ✅ (registry/version snapshots; per-turn resolution stays in-process) |
| Model configuration | PostgreSQL | ✅ |
| Configuration revision | PostgreSQL | ✅ (the coordination key) |
| Frequently accessed embed config | PostgreSQL | ✅ |
| Public agent configuration | PostgreSQL | ✅ |
| Rate-limit state | — | ✅ (replaces in-memory limiter; multi-instance safe) |
| RAG vectors / results | **Qdrant** | unchanged (never replaced by Redis) |

---

## 4. Data model changes

### 4.1 Revision table (migration 059)

```sql
CREATE TABLE ai_config_revisions (
  domain      TEXT PRIMARY KEY,   -- 'platform_env' | 'provider_registry' | 'models' | 'defaults' | 'org:<uuid>' | 'agent:<uuid>'
  revision    BIGINT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID
);
INSERT INTO ai_config_revisions (domain) VALUES
  ('platform_env'), ('provider_registry'), ('models'), ('defaults');
```

- **Global convenience key** `ai:cfg:revision` in Redis = max revision across
  domains — one `GET` validates an entire snapshot.
- `bumpRevision(domain, tx)` **must run inside the same transaction** as every
  config write: `setPlatformEnvSetting`, `updateProviderCredential`,
  `setProviderEnabled`, model catalogue sync, defaults updates, org/agent AI
  settings writes.
- Credential writes additionally bump a `credential_version` counter exposed on
  the cached provider payload.

### 4.2 Credential representation

`platform_env_settings` remains the persisted credential store (Supabase
encryption-at-rest) — **no schema migration for values**. The gateway holds a
`SecureCredentialStore` abstraction over it so credentials stop being "env
keys" and become first-class records; `platform_ai_provider_credentials.env_key`
is retained purely as a compatibility pointer during the migration window.

---

## 5. Implementation plan (phased, production-safe)

Each phase is independently deployable, dual-readable and instrumented
(zero-disruption rollout; the Stage-H dual-read technique the codebase already
uses). No phase switches the write path without the read path being proven.

### Phase 0 — Revision foundation (small, zero behavioural change)

- Migration 059 (`ai_config_revisions`) + `bumpRevision()` helper wired into
  every existing config write (same transaction, post-commit invalidation hook).
- Redis client bootstrap: `src/modules/ai-config/redis.ts` reusing
  `getRedisConnectionOptions()` (same RedisLabs instance as BullMQ, separate
  connection with `maxRetriesPerRequest` tuned for request paths).
- Baseline metrics: log every registry cache miss / rehydration with
  revision + instance id (drift becomes *observable* before it becomes fixable).
- **Exit criteria:** every admin config write bumps a revision; dashboards show
  hydration frequency per instance.

### Phase 1 — Provider Registry gateway (`src/modules/ai-config/`)

- `resolveProviderConfig(providerId, capability?)` — the single gateway from
  §3.2 (L1/L2/L3 with revision validation, drift rehydration, structured
  `AI_CONFIG_RESOLUTION_FAILED` diagnostics).
- `SecureCredentialStore` — AES-256-GCM-at-rest Redis representation keyed
  `ai:cfg:cred:<provider>` (key derived from `AUTH_SECRET` via HKDF; documented
  trust-domain note: Redis is co-trusted infrastructure, encryption is defence
  in depth).
- Provider adapters change signature: construct with an explicit credential
  object. Compatibility shim `getProviderCredential(envKey)` returns
  gateway-snapshot-first, env-last — lets the ~20 call sites migrate
  incrementally without a flag day.
- Dual-read instrumentation: count resolutions served from env after the DB has
  a configured credential — target 0 before Phase 4.
- **Exit criteria:** chat API + embed chat resolve through the gateway in
  production with green dual-read counters; Redis-outage drill (failover to PG)
  passes with zero user-visible errors.

### Phase 2 — Redis cache layer for the full registry

- Cache the `getPlatformAIRegistry()` snapshot (8-query join) under
  `ai:cfg:registry:v<rev>`; replace the per-instance 3 s TTL with
  revision-checked L1 + Redis L2. **Removes the 3-secondly DB join per warm
  instance.**
- Voice config cache, version/deployment/draft caches and public embed config
  follow the same pattern (revision keys per domain).
- Rate limiter gains a Redis backend (`INCR` + `EXPIRE`) with the in-memory
  limiter as the Redis-down fallback — call sites keep the
  `RateLimitResult` contract (`lib/rate-limit.ts` documents this exact swap).
- **Exit criteria:** registry hydration DB queries drop ~99 % on warm
  instances; config read latency p95 < 5 ms in-region.

### Phase 3 — Event-driven invalidation

- Post-commit flow in every admin write: bump revision (in txn) → write new
  payload + revision to Redis → `PUBLISH ai:config:changed {domain, revision}`.
- Subscribers: API instances (dedicated Redis subscriber connection),
  BullMQ workers (reuse the queue connection), voice/realtime services.
  L1 caches drop on event; next request rehydrates.
- Safety net: cheap revision poll every 30 s (missed pub/sub messages, cold
  subscribers) + long TTL backstop (TTL alone no longer the correctness
  mechanism — it becomes the last line of defence, per the owner's direction).
- **Exit criteria:** admin credential rotation is picked up by every live
  instance + workers in < 1 s, verified in staging with a multi-instance drill.

### Phase 4 — Env demotion & failure model completion

- Env classification: `INFRASTRUCTURE` (DATABASE_URL, REDIS_URL, AUTH_SECRET,
  CSP flags) / `BOOTSTRAP` (first-boot seeding only, `ALLOW_ENV_BOOTSTRAP`,
  default-on in dev, default-off in prod) / `EMERGENCY_FALLBACK`
  (`AI_CONFIG_ENV_FALLBACK=emergency`, alerts fire while active).
- Sweep the remaining direct env reads (voice-core, assistant realtime,
  phone call-handler, language-core, embed session) onto the gateway; delete
  the compatibility shim once the dual-read counter has been 0 for a full
  release cycle.
- Drift auto-heal + admin alerting (existing health-alerting migration 054
  gains an `AI_CONFIG_SYNC` alert class).
- `getPlatformAIDefaults()` (`ai-core/resolve.ts:63`) stops reading
  `AI_PROVIDER`/model env vars — defaults come from the registry snapshot.
- **Exit criteria:** `process.env.<PROVIDER>_API_KEY` appears in zero request
  paths (grep-enforced by a CI contract test); bootstrap drill provisions a
  fresh environment from env → DB → Redis in order.

### Phase 5 — Coverage & hardening

- Admin health checks run through the gateway (they currently duplicate env
  reads — `ai-governance/core/health.ts`).
- Per-domain fine-grained revisions if the global key shows contention.
- Load-test: config resolution under 500 RPS chat traffic with a concurrent
  credential rotation (zero dropped requests, ≤ 1 retry per instance).

---

## 6. What stays untouched (blast-radius guarantee)

- **Provider SDKs and payloads** — OpenAI / Gemini / Sarvam / ElevenLabs
  request construction, model catalogues, RAG/Qdrant retrieval, hybrid search
  and the ElevenLabs Mode A/B split are untouched; only *where their
  credentials come from* changes.
- **Governance gates** — `validateAgentAISelection()` semantics and the
  no-silent-substitution rule are preserved verbatim.
- **Published-agent / embed surfaces** — request flow, session tokens and
  public error sanitisation unchanged.
- **VPS/Docker topology** — long-running processes simply hold a warm L1; the
  same Redis serves workers and API.

## 7. Key decisions requested from the owner

1. **Redis client**: reuse the existing RedisLabs instance via `ioredis`
   (recommended — already in production for BullMQ) vs. adding Upstash REST
   (fully serverless-native, would be a second vendor).
2. **Credential encryption in Redis**: AES-256-GCM via HKDF(AUTH_SECRET)
   (recommended, defence in depth) vs. plaintext-in-trusted-Redis.
3. **Revision granularity**: single global revision key (recommended to start)
   vs. per-domain from day one.
4. **Phase order confirmation**: Phase 0+1 first (registry gateway), which
   already removes the `DB → process.env → Provider` dependency for chat and
   embed — voice/background sweeps follow in Phase 4.

---

*Implementation can begin on approval — Phase 0 is a single migration plus
transaction-scoped revision bumps and carries no user-visible risk.*
