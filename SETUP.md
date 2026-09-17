# SETUP — Clara AI Platform (Developer Guide)

Full local-setup guide for the **Clara AI Platform**: the single unified
Next.js application that hosts the marketing site, the platform admin
console, the tenant workspaces, the embeddable widget API, and the voice
relay. Follow it top to bottom and you will end with a running stack, a
seeded demo dataset, and a green test suite.

> **Audience** — developers joining the project.  
> **Ops/deployment guide** — see `DEPLOYMENT.md`.  
> **API reference** — see `API.md`.

---

## 1. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node.js | ≥ 20 (22/24 tested) | runtime |
| npm | ≥ 10 (11 tested) | package manager — **use npm, not pnpm/yarn** (lockfile + `allowScripts` policy are npm-specific) |
| Docker + Compose | any recent | local Postgres / Qdrant / Redis / RabbitMQ |
| git | ≥ 2.40 | clone, hooks |
| (optional) bun | ≥ 1.1 | faster `tsx` alternative used by some scripts; Node fallback works |

Hardware: 4 GB RAM is enough to run the stack; **production builds in a
4 GB container should set `CLARA_SKIP_TYPECHECK=1`** (type-checking runs as
a separate `npm run type-check` step) to avoid OOM during `next build`.

---

## 2. Clone & install

```bash
git clone -b Vite-Converted https://github.com/Rilan-Dev/Clara-AI-Platform.git
cd Clara-AI-Platform
npm install
```

`npm install` runs `scripts/sync-monaco-assets.mjs` (postinstall) and
executes the native build scripts that are allow-listed in `package.json →
allowScripts` (esbuild, sharp, msgpackr-extract, protobufjs,
unrs-resolver). If your npm policy blocks them, approve once:

```bash
npm approve-scripts   # npm ≥ 11 sandbox policy
npm rebuild
```

---

## 3. Environment

```bash
cp .env.example .env
```

Minimum viable local `.env`:

```ini
DATABASE_URL=postgresql://clara:clarapassword@localhost:1234/clara_platform?sslmode=disable
QDRANT_URL=http://localhost:6333
AUTH_SECRET=<openssl rand -hex 32>        # min 32 chars — enforced at boot in production
OPENAI_API_KEY=sk-...                     # or GEMINI_API_KEY + AI_PROVIDER=gemini
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Validation lives in `src/lib/env.ts` and is evaluated **once at process
startup** (via `src/instrumentation.ts → instrumentation.node.ts`). In
production a missing `DATABASE_URL` / `QDRANT_URL` / `AUTH_SECRET` /
provider key **aborts boot with a clear error**; in development it only
warns so `next dev` stays usable while you fill the file in.

### Infrastructure services

The full local stack (Postgres 16, Qdrant, Redis, RabbitMQ + management UI)
is one command:

```bash
docker compose up -d postgres qdrant redis rabbitmq
```

Alternatively point `DATABASE_URL` / `QDRANT_URL` at any remote instances —
nothing in the codebase assumes localhost.

---

## 4. Database migrations

Migrations are plain SQL files in `src/lib/db/migrations/` applied **in
filename order** by `src/lib/db/migrate.ts` into the `schema_migrations`
table. They run automatically:

- on `npm run dev` (first request), and
- on production boot, before the server accepts traffic.

No manual migration step is required. To verify state:

```bash
psql "$DATABASE_URL" -c "SELECT filename FROM schema_migrations ORDER BY filename;"
```

---

## 5. Seed data

The demo dataset (recommended — it creates everything you need):

```bash
npm run seed          # idempotent demo story (see SEED.md)
```

This creates two demo tenants with logins:

| Tenant | Plan | Login | Password |
|--------|------|-------|----------|
| Omen United Insurance | Pro | `omen-admin@omeninsurance.com` | `Omen1234!` |
| TechVision Solutions | Starter | `techvision-admin@techvision.io` | `Tech1234!` |
| Platform admin (bootstrap) | — | `admin@clara.ai` | `Admin1234!` (env `CLARA_ADMIN_PASSWORD`) |

Reset or regenerate at any time (`seed:reset` wipes **only** the demo UUID
scope, never user-created rows):

```bash
npm run seed:reset
npm run seed:docs      # regenerate the sample PDFs under public/seed-docs/
```

Details, idempotency guarantees and the synthetic-analytics design:
**`SEED.md`**.

---

## 6. Run

### Development

```bash
npm run dev            # http://localhost:3000, hot reload
```

The dev server auto-applies migrations, starts the background **ingest
poller** (processes uploaded documents every ~3 s) and the subscription
expiry sweep — the same startup path as production (see
`src/instrumentation.node.ts`).

### Production build (what CI deploys)

```bash
npm run build          # or: CLARA_SKIP_TYPECHECK=1 npm run build (low-RAM CI)
npm start              # node scripts/start.mjs — standalone server + WS relay
```

`scripts/start.mjs` monkey-patches `http.createServer` to attach the
WebSocket servers for the **voice relay** (`/api/embed/voice`) and **phone
streaming** (`/api/phone/twilio/stream`, `/api/phone/vonage/stream`)
before importing the Next standalone server — this is why the platform
cannot run as a plain serverless function.

---

## 7. Verify the running stack

```bash
curl -s localhost:3000/api/health | jq .checks   # database + qdrant must be "ok"
```

Landing page `http://localhost:3000/`, pricing `/pricing`, platform admin
`/admin` (login with the platform admin), tenant workspace `/workspace`
(login with a tenant admin), embeddable demo website
`/embed/landing-demo`.

---

## 8. Tests & quality gates

| Gate | Command | Scope |
|------|---------|-------|
| Unit tests | `npx vitest run` (`npm test` watches) | `src/**/__tests__` — deterministic, no network |
| Type check | `npm run type-check` | whole repo, `tsconfig.typecheck.json` |
| Lint | `npm run lint` | 0 errors required; warnings reviewed case-by-case |
| Model config | `npm run validate:model-config` | model catalogue sanity (WS-0.4) |
| E2E (live server) | `node scripts/e2e-<suite>.js` | see below |

E2E suites (server must be running; each exits non-zero on failure):

```bash
node scripts/e2e-phase2-3.js      # marketing merge + tenant app (34 checks)
node scripts/e2e-phase4.js        # demo website + embed widget (38 checks)
node scripts/e2e-phase5.js        # demo data seeding (53 checks)
node scripts/e2e-phase6.js        # production hardening acceptance (run standalone)
node scripts/e2e-org-workspace.js # org scoping / RBAC (35 checks)
node scripts/e2e-plan-limits.js   # all four plan tiers (102 checks)
node scripts/e2e-ingest-queue.js  # upload → ingest → ready pipeline (10 checks)
```

> `e2e-phase6.js` should run **standalone** (not concurrently with other
> suites): its rate-limit buckets are shared with any parallel traffic.

---

## 9. Project layout (orientation)

```
src/
  app/                     Next.js App Router
    (platform)/            marketing site + tenant workspace (/workspace)
    (admin)/               platform admin console (/admin)
    api/                   all REST routes (see API.md)
    embed/                 public embed surfaces + /embed/clara.js
  features/                UI feature modules (screens/components)
  modules/                 domain modules (auth, knowledge-bases, assistant…)
  lib/                     cross-cutting infra (db, env, rate-limit, http…)
  security/                CSP + blocked-domain policies
  instrumentation*.ts      startup hook: env validation → migrations → poller
scripts/                   operational scripts (start.mjs, e2e-*, seed, …)
services/rabbitmq-bridge/  optional event bridge (see DEPLOY_RABBITMQ.md)
Doc/                       implementation plan + architecture notes
```

Three-layer context architecture, module conventions and commit style are
defined in `AGENTS.md` — read it before changing anything.

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Boot aborts with "Missing required environment variables" | Intentional Phase 6.2 fail-fast — fill `.env` (see §3). |
| `npm install` native-script warnings | `npm approve-scripts && npm rebuild` (see §2). |
| `next build` OOM in CI | `CLARA_SKIP_TYPECHECK=1 npm run build`, run `type-check` separately. |
| Login returns 429 after a few bad attempts | Phase 6 brute-force gate: 5 failed logins / 15 min / IP. Wait or clear by a successful login. |
| Login returns 403 `ACCOUNT_LOCKED` | 10 consecutive failures locked the account (30 min auto-expire); platform admin: `POST /api/platform/users/:id/unlock`. |
| Uploaded document stuck `pending` | The ingest poller is disabled (`INGEST_POLLER_ENABLED=false`) or the embedding provider is unreachable — check `/admin/system-status` and server logs. |
| `ECONNREFUSED … :1234/:6333` | docker compose services not up (§3). |
| Chat/embed return 502 with a friendly message | Provider-side outage or regional block; raw provider errors are intentionally sanitized (Phase 6.3). |
