# Clara AI Platform — Agent Guidelines

Multi-tenant SaaS RAG + Voice AI platform (Next.js 15 App Router, PostgreSQL, Qdrant, Redis/BullMQ, OpenAI/Gemini). See `README.md` for product overview and `Doc/` for design docs (linked below).

## Architecture

- `src/app` — routing only (App Router). Route groups: `(admin)/` internal console, `(platform)/` public site + tenant workspace, `api/` REST endpoints. Handlers delegate to `src/modules`.
- `src/modules/*` — domain/business logic by bounded context (`assistant`, `knowledge-bases`, `organisations`, `ai-core`, `queue`, `ingest`, `auth`, ...), each typically with `api/`, `core/`, sometimes `worker/`/`client/`/`ui/`. This is where most logic changes happen.
- `src/features/*` — page-level UI composition (screens/layouts/components), one folder per feature area.
- `src/lib` — cross-cutting server utilities (`db.ts`/`db/`, `env.ts`, `stripe.ts`, `razorpay.ts`, `plan-guard.ts`).
- `packages/api-client`, `packages/types` — internal shared packages referenced **only via TS path aliases** (`@clara/api-client`, `@clara/types`), not real npm workspaces (root `package.json` has no `workspaces` field). `@clara/ui` is aliased in `tsconfig.json` but `packages/ui` doesn't exist yet — don't use it.
- `backups/` — legacy/reference tenant demo apps (clara-omen-insurance, clara-techvision) as standalone Next.js projects. Excluded from lint/typecheck; treat as read-only reference unless asked otherwise.
- Multi-LLM abstraction (OpenAI/Gemini swap via `src/modules/ai-core`): see [`Doc/MULTI_LLM_ABSTRACTION.md`](Doc/MULTI_LLM_ABSTRACTION.md).
- Hybrid (dense+sparse) RAG search in Qdrant: see [`Doc/HYBRID_SEARCH_RAG.md`](Doc/HYBRID_SEARCH_RAG.md).
- Document ingestion pipeline: see [`Doc/INGESTION_PIPELINE.md`](Doc/INGESTION_PIPELINE.md).
- Voice (WebRTC/WebSocket) infra: see [`Doc/VOICE_INFRASTRUCTURE.md`](Doc/VOICE_INFRASTRUCTURE.md).
- Overall roadmap/rationale: [`Doc/ClaraAI-Implementation-Plan.md`](Doc/ClaraAI-Implementation-Plan.md), [`Doc/PRODUCTION_STRATEGY.md`](Doc/PRODUCTION_STRATEGY.md), [`Doc/MIGRATION_ANALYSIS.md`](Doc/MIGRATION_ANALYSIS.md).

## Background workers (important — two different job systems)

- **Crawl/retry jobs** (`clara-crawl`, `clara-retry` queues) use **BullMQ + Redis**, defined in `src/modules/queue/`, consumed by `workers/crawl-worker.ts` / `workers/retry-worker.ts`, both started together by `workers/all-workers.ts`.
- **Document ingestion jobs** are **NOT** BullMQ — they're rows in a Postgres `ingest_jobs` table polled by `startIngestPoller` (`src/modules/knowledge-bases/worker/ingest-poller.ts`), started alongside the BullMQ workers in `workers/worker-entry.ts` (the actual Docker `CMD` entrypoint, built via `Dockerfile.worker`).
- The main Next.js app only *enqueues* jobs; the separate `clara-worker` container/process consumes them (see `docker-compose.yaml`).

## Database

No ORM. Plain numbered SQL migrations in `src/lib/db/migrations/*.sql` (`NNN_description.sql`), auto-applied at server boot via `runMigrationsOnStartup()` (`src/lib/db/migrate.ts`, invoked from `src/instrumentation.ts`), tracked in a `schema_migrations` table. Add new migrations as the next numbered file — do not edit already-applied migration files.

## Build / test / run

- `npm run dev` — Next dev server on port 3000.
- `npm run build` then `npm start` — **`npm start` runs `scripts/start.mjs`, not `next start`**: it wraps the standalone server to attach raw WebSocket upgrade handlers for `/api/embed/voice` and phone streaming (Twilio/Vonage), which the App Router can't handle natively. Don't "simplify" this to plain `next start`.
- `npm run lint` — ESLint flat config (`next/core-web-vitals` + `next/typescript`).
- `npm run type-check` — uses `tsconfig.typecheck.json` (adds `vitest/globals`, **excludes** `backups/`, `scripts/**`, `.next*/**`). IDE errors from those excluded paths are expected and not part of this check.
- `npm test` / `npm run test:watch` — Vitest, `environment: "node"`, globs `src/**/*.test.ts(x)` only (files under `workers/` are not picked up by this glob).
- `npm run ingest` / `npm run ingest-web` — CLI ingestion scripts (`tsx scripts/ingest.ts` / `ingest-web.ts`), bypass the UI.
- `npm run seed` — production bootstrap (`scripts/seed.ts --prod`, safe on any DB); `npm run seed:dev` / `seed:reset` — demo dataset (`scripts/seed-demo.ts`, guarded: explicit NODE_ENV + local DB host); `npm run seed:clean` — purge demo/e2e artifacts; all require migrations to have run first.

## Local infra

`docker-compose.yaml` (the active file — `docker-compose.yml` is a legacy/unused template) runs `postgres` (port **1234** on host → 5432 in container), `redis`, `qdrant`, `clara-backend`, and `clara-worker`. Required env vars are documented in `.env.example`; notable ones: `DATABASE_URL`, `OPENAI_API_KEY`/`GEMINI_API_KEY`, `AI_PROVIDER`, `QDRANT_URL`, `AUTH_SECRET`, `REDIS_HOST`/`REDIS_PORT`, `WORKER_SECRET` (guards `/api/worker/*` internal trigger routes).

## Conventions

- Path aliases (`tsconfig.json`): `@/*` → `src/*`, `@clara/api-client`, `@clara/types`.
- New API routes: add the route handler under `src/app/api/...`, with actual logic in the matching `src/modules/<domain>/api/`.
