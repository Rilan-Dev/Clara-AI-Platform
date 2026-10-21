# Environments: dev + prod on the same infrastructure

One VPS (or one Docker host), one set of infrastructure servers — Postgres,
Qdrant, Redis, RabbitMQ — serving a **production** stack and a **development**
stack simultaneously, isolated purely by environment variables. No second
database server, no second vector store, no separate Redis.

The resolver for every knob lives in `src/lib/env-scope.ts` (see its tests for
the exact rules). **Backward compatibility is absolute**: with `CLARA_ENV`
unset (or `production`) every knob resolves to the pre-scoping behaviour —
existing deployments are byte-identical after upgrading.


## Optional product features (deployment-local)

The feature families documented as **13 — Embeddable Widget & Public Demo**
and **23 — Integrations, MCP & WhatsApp** have independent, server-only
toggles. They are **not** stored in organisation tables or exposed through
`NEXT_PUBLIC_*`. They are evaluated from the running process's environment
on each request, so a development switch cannot mutate the production flag.

| Deployment | `CLARA_FEATURE_EMBEDDABLE_WIDGET` | `CLARA_FEATURE_INTEGRATIONS` |
|---|---|---|
| `CLARA_ENV=development` | Enabled by default | Enabled by default |
| `CLARA_ENV=production` or unset in a production process | Disabled by default | Disabled by default |
| Explicit `true` / `false` | Overrides **that deployment only** | Overrides **that deployment only** |

The feature flags protect public widget/demo loaders, sessions, chat/search/
voice API routes, related API-key/configuration interfaces, integration and
MCP management, WhatsApp callbacks/webhooks/cron triggers, and integration
tool execution. They also hide optional navigation and landing demos using the
uncached `GET /api/features` endpoint. Direct disabled-feature requests
receive `404 FEATURE_DISABLED` (including preflight) and are not processed.
Shared native chat, RAG, knowledge ingestion, public agent configuration,
billing, voice and unrelated webhooks remain in operation.

These controls preserve stored configurations, migrations and source code.
Existing MCP execution still additionally requires `ENABLE_MCP=true`,
authenticated identity, plan entitlement, validated connection, allowlists,
and per-invocation authorization. Enabling the optional family never bypasses
those checks.

Configure **separate deployment .env values** (and existing PG schema,
Qdrant/Redis/BullMQ/RabbitMQ separation). Turning a feature on/off takes
effect in the server process; restart/redeploy that environment to update
client views and cached tool registries. Do **not** reuse one .env across
production and development or change production secrets/settings to exercise
development integrations. Platform super-admins can inspect effective
switches in System Status → Runtime flags.

Regression contract: `src/lib/feature-availability.test.ts`,
`src/middleware.features.test.ts`, and
`src/features/admin/settings-nav.features.test.ts`. Test execution, provider
handshakes, actual dual-stack deployment and production behavior require
separate verification.

## The model

| Store      | Development (`CLARA_ENV=development`)            | Production (default)        | Override                  |
| ---------- | ------------------------------------------------ | --------------------------- | ------------------------- |
| Postgres   | schema `clara_dev` via `search_path`             | `public` (unchanged)        | `PG_SCHEMA`               |
| Qdrant     | new collections `dev_*`                          | unprefixed                  | `QDRANT_COLLECTION_PREFIX`|
| Redis      | logical db via `REDIS_URL` path (e.g. `/1`)      | db 0 (unchanged)            | `REDIS_URL` / `REDIS_DB`   |
| BullMQ     | key prefix `dev_` (cluster-safe fallback)        | no prefix                   | `BULLMQ_PREFIX`            |
| RabbitMQ   | vhost (e.g. `clara_dev`) via `RABBITMQ_VHOST`    | vhost `/` (unchanged)       | `RABBITMQ_VHOST`           |

## Why these mechanisms (and not others)

**Postgres — schema, not a second database.** The requirement is "same
connections but different environments". A Postgres schema rides the *same*
`DATABASE_URL`, the same role, the same pooler: every unqualified table
reference resolves through `search_path` (`clara_dev,public`), which the pool
sends in the connection startup packet (`options: "-c search_path=…"`).
Migrations create the schema on first boot (`CREATE SCHEMA IF NOT EXISTS`)
and the migration advisory lock is scoped per schema, so a dev migration run
never serialises against a prod one. `schema_migrations` itself is per-schema:
each environment tracks and applies its own migration history independently.
If you later want production namespaced too, set `PG_SCHEMA=clara_prod` on the
prod stack **before** its first boot after upgrading (or keep it on `public` —
also fully supported).

> Migration hardening that shipped with this feature: eight older migrations
> referenced tables as `public.<name>` (Supabase RLS/REVOKE hardening). Those
> qualifiers were removed so a fresh env-scoped schema builds cleanly; already
> applied deployments are unaffected (migrations never re-run), and on the
> default `public` search_path the unqualified form is semantically identical.

**Qdrant — collection-name prefix at generation time.** Collection names are
generated once (KB creation) and stored on the `knowledge_bases` row, so the
prefix only applies to *new* collections; reads always use the stored name and
need no prefix logic. This also makes operations safe: you can tell at a
glance which collections belong to dev, and bulk-deleting `dev_*` collections
can never touch production. Inherited names (snapshots `pub_*`, reindex
targets `*__std_*`) derive from the base name and stay consistent.

**Redis — logical database index.** `redis://…:6379/1` in the dev `REDIS_URL`
is total isolation at zero key-format cost. Caveat: managed/cluster Redis
(Redis Cluster, ElastiCache cluster mode) does not support `SELECT` — for
those, `BULLMQ_PREFIX=dev_` keyspace-prefixes every queue (applied
automatically for `CLARA_ENV=development`; BullMQ job keys move with a prefix
change, so production never gets a default prefix — in-flight jobs would be
stranded otherwise).

**RabbitMQ — vhost.** The broker's native isolation boundary: exchanges,
queues and bindings all live inside a vhost. The compose bridge URL now
honours `RABBITMQ_VHOST` (default `%2F` = `/`, unchanged). Note
`RABBITMQ_DEFAULT_VHOST` only creates a vhost on the broker's **first boot**
(empty data dir); on a long-running broker create additional vhosts manually:

```sh
docker compose exec rabbitmq rabbitmqctl add_vhost clara_dev
docker compose exec rabbitmq rabbitmqctl set_permissions -p clara_dev clara ".*" ".*" ".*"
```

## Running both stacks

Two options, both supported:

**A. Two compose projects on one host (recommended).** Clone/checkout twice,
each with its own `.env`:

```bash
# prod checkout — .env: nothing to set (defaults are production)
docker compose -p clara-prod up -d --build

# dev checkout — .env additions:
#   CLARA_ENV=development
#   REDIS_URL=redis://:<password>@redis:6379/1     # own db index
#   RABBITMQ_VHOST=clara_dev                       # own vhost
#   APP_BIND_ADDRESS=127.0.0.1                     # don't fight prod's :4000
docker compose -p clara-dev up -d --build
```

With `-p` (project name) the stacks get separate container/volume names. The
infrastructure services can be shared from the prod project: in the dev
compose file remove `postgres/redis/qdrant/rabbitmq` and point
`DATABASE_URL`/`QDRANT_URL`/`REDIS_URL`/`RABBITMQ_URL` at the host-published
loopback ports (default `127.0.0.1:1234` Postgres, `:6333` Qdrant, `:6379`
Redis, `:5672` RabbitMQ).

**B. One stack, two "promote" flows.** Keep a single deployment and treat dev
as ephemeral: set `CLARA_ENV=development`, experiment freely (everything lands
in `clara_dev` / `dev_*` / db 1), then unset it to return to production data.
Simplest possible promotion: none needed — production data was never touched.

## Verification checklist after enabling scoping

```bash
# 1. Startup log names the scope (backend + worker):
docker compose logs clara-backend | grep -E "environment scope|schema ready"
#    → [db] environment scope active: search_path=clara_dev,public
#    → [migrate] environment schema ready: clara_dev

# 2. Postgres: only the dev schema has fresh tables:
docker compose exec postgres psql -U clara -d clara_platform \
#     -c "\dt clara_dev.*" -c "select count(*) from clara_dev.documents;"

# 3. Qdrant: new KBs create dev_* collections:
curl -s 127.0.0.1:6333/collections | jq '.result.collections[].name' | grep dev_

# 4. Redis: queue depths live in the right db:
docker compose exec redis redis-cli -n 1 --scan --pattern 'dev_*' | head

# 5. RabbitMQ: dev vhost exists and the bridge connected to it:
docker compose exec rabbitmq rabbitmqctl list_vhosts
docker compose logs clara-rabbitmq-bridge | grep -i vhost
```

## Related: embedding egress on restricted networks

A separate but adjacent concern (same "environment" class of problem): a
deployment whose network cannot reach `generativelanguage.googleapis.com`
(connect-timeout; observed on some ISPs while `api.openai.com` works) fails
every document embedding. The platform's escape hatches, in order of effort:

1. **`GEMINI_BASE_URL`** — route Gemini calls through an HTTPS relay you
   control. Verified end-to-end by
   `src/modules/ai-core/providers/gemini.relay.integration.test.ts` (real
   `@google/genai` SDK against a local relay).
2. **`HTTPS_PROXY`** — route all provider traffic through an egress proxy
   (loopback DB/Redis/Qdrant stays direct via automatic `NO_PROXY`).
3. **Self-hosted embeddings** — `docker compose --profile multilingual up -d
   embeddings` (Text Embeddings Inference; fully offline, ~3 GB RAM).

Diagnose from inside the container — it stages DNS → TCP → TLS → HTTP → a
real embedding round-trip and prints the remediation for the failing layer:

```bash
docker compose exec clara-backend node scripts/probe-embedding-egress.mjs
docker compose exec clara-worker   node scripts/probe-embedding-egress.mjs
```
