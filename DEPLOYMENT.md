# DEPLOYMENT — Clara AI Platform (Ops Guide)

How to stand the platform up in production, keep it healthy, and operate it
day to day. The platform is **one deployable unit**: a Next.js 15
standalone Node server that hosts the marketing site, the platform admin
console, tenant workspaces, the embed/widget API, the voice WebSocket relay
and the background ingest poller.

> **Audience** — operators / DevOps.  
> **Local dev setup** — see `SETUP.md`. Docker specifics: `DEPLOY.md`.

---

## 1. Architecture (what you are deploying)

```
                 ┌────────────────────────────────────────────┐
   browsers  ──► │  Clara app  (Next.js standalone, port 3000)│
   websites  ──► │  · HTTP pages + REST API (/api/**)          │
   widgets   ──► │  · WebSocket relay (/api/embed/voice,       │
                │    /api/phone/{twilio,vonage}/stream)        │
                │  · startup: env validation → migrations →    │
                │    ingest poller → subscription sweep        │
                └───────┬──────────────┬───────────────┬───────┘
                        │              │               │
                 PostgreSQL 16     Qdrant 768-d    Redis (cache/limits)
                 (system of        (RAG vectors,
                  record)           clara_kb_768d)
                        │
                 (optional) RabbitMQ ← services/rabbitmq-bridge
                                         (transactional-outbox relay)
```

**Why not serverless/Vercel for the app itself:** the voice relay and phone
streams require a long-lived WebSocket server, and the ingest poller /
subscription sweep are in-process background loops. Deploy the app anywhere
a Node process can run for weeks (Railway, Fly.io, a VM, Kubernetes, or
plain Docker Compose).

---

## 2. Option A — Self-hosted with Docker Compose (reference setup)

`docker-compose.yml` at the repo root starts the entire platform:

```bash
cp .env.example .env       # fill real secrets (see §4)
docker compose up -d --build
curl -s http://localhost:3000/api/health | jq .checks
```

Services included: `postgres` (16-alpine), `qdrant`, `redis`,
`rabbitmq` (with management UI on :15672), the `clara` app, and an nginx
reverse-proxy with TLS termination (`deploy/nginx/`, certs under
`deploy/nginx/certs/`). The compose file reflects the **single-app
architecture** — the historical separate omen/techvision demo apps were
merged into the main app in Phases 2–5 and are intentionally absent.

Container health is driven by `GET /api/health` (returns 503 when the
database or Qdrant is down — wire your load balancer to the same route).

---

## 3. Option B — Cloud deployment (recommended split)

| Component | Recommended | Notes |
|-----------|-------------|-------|
| **Clara app** | Railway (Node service) or Fly.io | Long-running process + WebSockets + in-process pollers. 1 instance is enough to start; see §7 before scaling out. |
| **PostgreSQL 16** | Railway Postgres / Supabase / RDS | Automated backups **mandatory** — this is the system of record. Enable SSL (`sslmode=require`). |
| **Qdrant** | Qdrant Cloud | One collection (`clara_kb_768d`, 768-d vectors, cosine). Snapshot before big migrations. |
| **Redis** | Railway Redis / Upstash | Optional but recommended. |
| **RabbitMQ** | CloudAMQP | Only if you enable the event bridge (`DEPLOY_RABBITMQ.md`). |
| **DNS + TLS** | Cloudflare / nginx | Terminate TLS in front of the app; pass `X-Forwarded-For` so IP rate limits see real client IPs. |

Deploy steps (Railway example):

1. New project → **Deploy from GitHub repo** (`Vite-Converted` branch).
2. Start command: `npm run start` (= `node scripts/start.mjs`); Railway
   persists no build cache issues — build command `npm ci && npm run build`
   (add `CLARA_SKIP_TYPECHECK=1` on small plans and run type-check in CI).
3. Set every variable from §4 in the service dashboard.
4. Health check path: `/api/health`.
5. Seed once (see `SEED.md`): `npm run seed` from a one-off shell or your
   workstation pointed at the same `DATABASE_URL`.

> **Historical note:** the original implementation plan (§7.2) sketched
> *Vercel for the two demo tenant apps + Railway for the backend*. The
> Phase 2–5 merge collapsed all three apps into this single service, so the
> Vercel tier is no longer needed; everything runs in the one Node service.

---

## 4. Environment variables

### Required (boot aborts without them — Phase 6.2)

| Variable | Example / rule |
|----------|----------------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/clara_platform?sslmode=require` |
| `QDRANT_URL` | `https://….qdrant.io:6333` (+ `QDRANT_API_KEY`) |
| `AUTH_SECRET` | **≥ 32 chars**, not a placeholder — HMAC key for session-token hashes; `openssl rand -hex 32` |
| `OPENAI_API_KEY` | or `GEMINI_API_KEY` + `AI_PROVIDER=gemini` — at least one |

### Operational

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` | standalone server bind |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | absolute links + emails |
| `NODE_ENV` | `production` | set by the standalone server |
| `INGEST_POLLER_ENABLED` | `true` | background document processor |
| `INGEST_POLLER_INTERVAL_MS` | `3000` | poll cadence |
| `CLARA_ADMIN_PASSWORD` | `Admin1234!` | platform-admin bootstrap password — **override in production** |

### Optional integrations

Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs), Razorpay,
Vonage/Twilio voice+phone (`DEPLOY.md`, `Doc/VOICE_INFRASTRUCTURE.md`),
email (`src/lib/email.ts`), Sentry (`SENTRY_DSN` — hook documented, wired
per-installation), virus scanning (§8), RabbitMQ bridge
(`DEPLOY_RABBITMQ.md`).

**Startup order guarantees** (`src/instrumentation.node.ts`): env
validation → migrations → ingest poller → subscription sweep. A failure at
the env-validation stage intentionally **aborts boot** (`process.exit(1)`
with a message naming the missing variables); later stages log and
continue so a flaky sweep never takes the site down.

> ⚠️ **The standalone bundle embeds `.env`.** `next build` copies the
> project `.env` into `.next/standalone/`, and the standalone server loads
> it at boot (this is what makes a plain `npm start` work without
> pre-exported variables). Consequence: **any Docker image built from
> `.next/standalone` contains your secrets** — keep such images in private
> registries only, or strip the file after build
> (`rm .next/standalone/.env` + inject env at runtime) for multi-tenant
> image pipelines. Runtime-provided variables always win over the bundled
> file; a variable that is present-but-empty in the process environment
> overrides it too (that is how the Phase 6 acceptance suite tests the
> fail-fast path).

---

## 5. CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `Vite-Converted`:

1. **lint** job — `npm run lint`, `npx tsc --noEmit`, `vitest --run`,
   model-config validation.
2. **bridge-build** — Docker build of `services/rabbitmq-bridge`.
3. **build** — full production Docker image build + push (gated).

Recommended release flow: PR → green CI → merge → image build → deploy →
`GET /api/health` smoke → run the live e2e suites from a workstation
against the deployed URL (`E2E_BASE_URL=https://… node
scripts/e2e-phase2-3.js` …).

---

## 6. Day-2 operations

### Health & monitoring
- `GET /api/health` → `{status, version, uptime, checks:{database, qdrant}, memory, responseMs}`; 503 when degraded. Poll every 30–60 s.
- Structured `console` logging with `[module]` prefixes; ship stdout to your log drain.
- `/admin/system-status` gives an ops dashboard (services, queues, workers).

### Rate limits (Phase 6.4 — in-process, per instance)

| Endpoint | Limit | Scope |
|----------|-------|-------|
| `POST /api/auth/login` | 5 failures / 15 min | per IP (reset on success) |
| `POST /api/chat` | 60 / min | per org |
| `POST /api/kbs/:id/documents` | 10 / min | per org |
| `POST /api/realtime/session` | 10 / hour | per org |
| `POST /api/embed/chat` | per `api_keys.rate_limit_per_hour` | per API key |

All 429 responses carry `Retry-After` + `{code:"RATE_LIMITED"}`.

### Login lockout (Phase 6.1)
10 consecutive bad passwords lock the account for 30 minutes
(`ACCOUNT_LOCKED`). Early unlock (audited):

```bash
curl -X POST https://app.example.com/api/platform/users/<userId>/unlock \
     -H "Authorization: Bearer <super-admin token>"
```

### Backups & migrations
- Nightly `pg_dump` of `clara_platform` (test restores!).
- Migrations are forward-only SQL files applied in filename order at boot;
  each is idempotent and tracked in `schema_migrations`. To roll back,
  restore the pre-migration dump — keep one before every upgrade.

---

## 7. Scaling notes

The app is stateful in three places: HTTP session tokens (Postgres — safe),
the ingest poller (Postgres-backed job claim — safe), and the **in-memory
rate-limit windows** (`src/lib/rate-limit.ts`). With >1 app replica:

- keep rate limits correct by swapping `hit()` for a Redis `INCR + EXPIRE`
  backend (single call-site change; the result shape stays identical), and
- put the replicas behind a sticky-less round-robin LB — sessions are
  DB-backed, so any replica can serve any request.

Until then, one replica with a restart policy is the tested topology.

---

## 8. Virus scanning (optional, fail-closed)

Set `VIRUS_SCAN_URL` to an HTTP scanner (e.g. clamd-rest, Scanii) that
accepts `POST /scan?filename=…` (raw bytes) and returns
`{clean: boolean, signature?: string}`. Uploaded documents are scanned
**before** persistence; an unreachable scanner rejects uploads with
`503 VIRUS_SCAN_UNAVAILABLE` rather than admitting unscanned files. Leave
unset to disable the hook.

---

## 9. Security posture summary (Phase 6)

- bcrypt password hashing; opaque DB-backed sessions (HMAC-hashed tokens,
  httpOnly+Secure+SameSite cookies, Bearer support for API clients).
- Per-IP failed-login throttling + per-account lockout + audited unlock.
- Zod validation on auth routes; MIME allowlist + 50 MB cap + virus-scan
  hook on uploads.
- Tenant isolation enforced per-route (`requireKbPermission`,
  `requireTenantScope`, `requireOrgPermission`); platform admins reach
  tenant data only through the audited impersonation endpoint.
- CORS on embed endpoints restricted to each key's `allowed_origins`;
  admin API is same-origin by default.
- Consistent error contract `{error, code, status}`; raw provider/stack
  errors are logged server-side and never returned to clients.
- Fail-fast startup validation; global error boundary renders a
  maintenance page for unhandled render failures.
