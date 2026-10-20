# 26 — Deployment, Environments & Infrastructure

> Clara AI Platform feature documentation · Domain: docker-compose, Dockerfiles, deploy/nginx, Vercel, `lib/env-scope`, migrations runner · Base: `feature/ai-core-from-doable-source @ 1adb80bf`

## 1. Definition & Purpose

The deployment story: a Docker Compose stack (backend, worker, RabbitMQ bridge, Postgres, Qdrant, Redis, RabbitMQ) behind an OpenResty edge for the production host; Vercel for the serverless deployment path; per-environment schema scoping (`CLARA_ENV`) so dev and prod share infrastructure without colliding; and the SQL migration runner (75 migrations) that versions the database. Its purpose is reproducible, isolated, observable deployments — the same code runs locally (docker compose up), on the owner host, and on Vercel with environment-appropriate transports (Features 25).

## 2. Business Logic

- **Compose stack** — `docker-compose.yml` services: `redis`, `postgres`, `qdrant`, `rabbitmq`, `clara-backend`, `clara-worker`, `clara-rabbitmq-bridge` (+ nginx-proxy network); `Dockerfile` (backend) and `Dockerfile.worker` (worker); startup helpers `scripts/docker-start.sh`, `scripts/start-local-clara.sh`, `scripts/start-prod-server.sh`, `dev-supervisor.sh`.
- **Edge** — `deploy/nginx/nginx.conf`: TLS termination, gzip/brotli, static caching, `location /api/ { proxy_buffering off; }` for streaming (⚠️ production edge is OpenResty — the repo nginx is the reference config; the Task C benchmark proved the live edge currently BUFFERS chat streams — the known streaming fix is to apply the same `proxy_buffering off; gzip off` pattern on the OpenResty `/api/chat` location).
- **Environment scoping** — `src/lib/env-scope.ts`: `resolveClaraEnv:45` (CLARA_ENV), `resolvePgSchema:57` (development → `clara_dev`), `resolveQdrantCollectionPrefix:78` (`dev_`), `resolveBullmqPrefix:102`, `applyQdrantCollectionPrefix:116`, `describeEnvScope:124`; documented in `docs/deployment/environments.md` — production defaults byte-identical (no prefix).
- **Migrations** — `src/lib/db/migrations/001-075*.sql` applied by the migration runner (`src/lib/db/migrate.ts`, startup lock lineage `fix/migration-startup-lock`); Vercel deployment runs migrations at build/boot with the startup lock serializing concurrent instances.
- **Vercel path** — Vercel-Preview / Vercel-Prod branches (deploy target branches; automatic Git deployments disabled in favor of controlled PR flow), `vercel.json`/inline config, env vars via dashboard (NET_TRACE takes effect next deployment), Functions logs for observability.
- **Health & verification** — `/api/health` (route line 25) liveness; `scripts/verify-live-stack.sh`, `scripts/poll-preview-deploy.py`, probe scripts (`probe-embedding-egress.mjs`, `test-gemini-connectivity.cjs`, `check-elevenlabs-settings.mjs`).

## 3. Business Rules

- One migration chain, applied in order, checksum-guarded; migrations are forward-only (no destructive rewrite outside explicit reset tooling).
- Dev/prod isolation is structural (schema, collection prefix, queue prefix, Redis db, vhost) — never convention-only.
- Deploy branches (Vercel-Preview/Vercel-Prod) update only via reviewed PRs — no direct pushes (auto Git deployments disabled).
- The production edge must honour streaming (proxy_buffering off) for NDJSON chat — currently a known OPS item.
- Worker and backend images build from the same source tree (no drift between API and worker behaviour).

## 4. Data Model

- 75 migrations `001_foundation.sql` … `075_embedding_default_bootstrap.sql` (full list: `scripts/feature-doc/migrations.txt`).

## 5. API Surface

| Route | Purpose |
|---|---|
| `src/app/api/health/route.ts:25` | liveness probe |
| `src/app/api/internal/init/route.ts` | deployment init hooks |
| `src/app/api/worker/**`, `/api/cron/**` | worker/cron entrypoints (Feature 25/21) |

## 6. Core Files & Infrastructure

| File | Role |
|---|---|
| `docker-compose.yml`, `Dockerfile`, `Dockerfile.worker` | container stack |
| `deploy/nginx/nginx.conf` | reference edge config (streaming pattern) |
| `src/lib/env-scope.ts` | `resolveClaraEnv:45`, `resolvePgSchema:57`, `resolveQdrantCollectionPrefix:78`, `resolveBullmqPrefix:102`, `applyQdrantCollectionPrefix:116`, `describeEnvScope:124` |
| `src/lib/db/migrate.ts` + migrations | DB versioning |
| `docs/deployment/environments.md`, `Doc/**/DEPLOY*.md`, `SETUP.md` | deployment docs |

## 7. UI Reference

- None (infrastructure); environment visibility via `(admin)/settings/environment/page.tsx` runtime flags (Feature 21/22).

## 8. Environment Variables

- `CLARA_ENV` (development|production), `DATABASE_URL`, `QDRANT_URL/API_KEY`, `REDIS_URL`, `RABBITMQ_*`, `GEMINI/OPENAI/ELEVENLABS/SARVAM_*`, `NET_TRACE*` — see `.env.example` (sectioned) and `docs/deployment/environments.md`.

## 9. Tests

- env-scope unit tests, migration runner tests, `scripts/verify-live-stack.sh`, compose boot verification (`scripts/test-boot-refusal.sh`, `tests/*runtime-build.sh`).

## 10. Cross-links

- Transports per environment — **25**; provider egress — **10**; health/incidents — **21**; observability env vars — **24**.
