# RabbitMQ + DLQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add RabbitMQ as a durable SaaS event bus with an outbox relay and webhook consumer, while retaining BullMQ + Redis and adding a production DLQ.

**Architecture:** Next.js writes integration-worthy domain events to PostgreSQL `event_outbox`. A separate Node bridge claims and publishes those events to a durable RabbitMQ topic exchange with publisher confirms. A webhook consumer handles phone-call events with bounded TTL retries and a quorum DLQ. BullMQ remains the job-processing layer.

**Tech Stack:** Next.js 15, TypeScript, PostgreSQL, BullMQ 5, Redis, RabbitMQ/AMQPS, Node.js 18+, `amqplib` 2.0.1 in the bridge service.

**Spec:** `docs/superpowers/specs/2026-09-13-rabbitmq-dlq-design.md`

## Global Constraints

- Keep `clara-crawl` and `clara-retry` on BullMQ.
- RabbitMQ credentials must be environment variables only.
- Production RabbitMQ connections must use `amqps://`.
- RabbitMQ consumers must use manual acknowledgements and persistent messages.
- RabbitMQ durable integration queues must use quorum queues.
- PostgreSQL outbox publication must be retryable and idempotent.
- Never place large document/file bodies in RabbitMQ events.
- Existing phone call behaviour must continue to work if RabbitMQ is unavailable.

---

### Task 1: Add the transactional outbox schema and DB helper

**Files:**
- Create: `src/lib/db/migrations/025_event_outbox.sql`
- Create: `src/modules/events/outbox-db.ts`

**Interfaces:**
- Produces `insertOutboxEvent(client, event)` for transaction-aware event insertion.
- Produces `claimOutboxEvents(limit)` for internal relay APIs.
- Produces `markOutboxPublished(id)` and `markOutboxFailed(id, error)`.

- [ ] **Step 1: Write the migration**

Create `event_outbox` with UUID id, event type, aggregate fields, routing key, JSON payload, status, attempts, availability timestamp, lock timestamp, publication timestamp, last error, and created timestamp. Add indexes for pending polling and stale publishing recovery.

- [ ] **Step 2: Implement the DB helper**

Use `pg` pool queries. Claim rows using `FOR UPDATE SKIP LOCKED`, recover `publishing` rows whose lock is older than five minutes, increment attempts when claiming, and return only a bounded batch.

- [ ] **Step 3: Run type-check**

Run `npm run type-check` and expect the new helper to compile without changing existing behaviour.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/migrations/025_event_outbox.sql src/modules/events/outbox-db.ts
git commit -m "feat: add transactional event outbox"
```

---

### Task 2: Add authenticated outbox relay endpoints

**Files:**
- Create: `src/app/api/internal/outbox/route.ts`
- Create: `src/app/api/internal/outbox/[id]/published/route.ts`
- Create: `src/app/api/internal/outbox/[id]/failed/route.ts`

**Interfaces:**
- `GET /api/internal/outbox?limit=20` returns claimed events and requires `Authorization: Bearer <WORKER_SECRET>`.
- `POST /api/internal/outbox/:id/published` marks an event published.
- `POST /api/internal/outbox/:id/failed` schedules a retry or permanently fails the outbox event.

- [ ] **Step 1: Add shared worker-secret authentication**

Reject missing or incorrect bearer credentials with 401 and never log the secret.

- [ ] **Step 2: Implement the claim endpoint**

Return at most 20 events by default and at most 100 when explicitly requested. Include id, type, routing key, payload, attempts, and timestamps.

- [ ] **Step 3: Implement publication acknowledgement**

Allow only a claimed event to transition to `published` and set `published_at`.

- [ ] **Step 4: Implement publication failure**

Use exponential backoff capped at 10 minutes and transition to `failed` after 20 publication attempts.

- [ ] **Step 5: Run route/type tests**

Run `npm run type-check` and existing `npm test` suites that cover API authentication.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/internal/outbox
git commit -m "feat: expose authenticated outbox relay API"
```

---

### Task 3: Add RabbitMQ bridge service with topology and publisher confirms

**Files:**
- Create: `services/rabbitmq-bridge/package.json`
- Create: `services/rabbitmq-bridge/package-lock.json`
- Create: `services/rabbitmq-bridge/index.mjs`
- Create: `services/rabbitmq-bridge/topology.mjs`
- Create: `services/rabbitmq-bridge/Dockerfile`

**Interfaces:**
- Reads `RABBITMQ_URL`, `CLARA_INTERNAL_API_URL`, `WORKER_SECRET`, and optional polling/consumer tuning variables.
- Publishes to `clara.events` using topic routing.
- Declares `clara.webhooks` and `clara.webhooks.dlq` as durable quorum queues.

- [ ] **Step 1: Add bridge package metadata**

Pin `amqplib` to `2.0.1`. Keep the bridge dependency surface intentionally small and use Node's built-in `fetch` for HTTP calls.

- [ ] **Step 2: Declare RabbitMQ topology**

Create durable topic exchange `clara.events`, durable direct exchange `clara.dlx`, quorum queue `clara.webhooks`, quorum queue `clara.webhooks.dlq`, and three TTL retry queues. Bind `webhook.phone.call.#` to the webhook queue and route final failures to the DLQ.

- [ ] **Step 3: Implement reconnecting AMQP connection**

Use `amqplib` connection recovery with exponential backoff. Re-run topology declarations after reconnect. Use a confirm channel for publication.

- [ ] **Step 4: Implement outbox polling**

Poll the internal API every second, publish each event with `messageId=event.id`, wait for publisher confirms, and then acknowledge the event to the API. On publish failure, call the failure endpoint and continue polling.

- [ ] **Step 5: Implement graceful shutdown**

Stop polling, cancel consumers, close the channel, and close the connection on SIGTERM/SIGINT.

- [ ] **Step 6: Commit**

```bash
git add services/rabbitmq-bridge
git commit -m "feat: add RabbitMQ outbox bridge"
```

---

### Task 4: Add webhook consumer with bounded retry and DLQ

**Files:**
- Modify: `services/rabbitmq-bridge/index.mjs`
- Modify: `services/rabbitmq-bridge/topology.mjs`

**Interfaces:**
- Consumes `webhook.phone.call.completed` events.
- Sends JSON HTTP POST to the event `targetUrl`.
- Uses `X-Clara-Event-Id`, `X-Clara-Event-Type`, and `X-Clara-Delivery-Attempt` headers.

- [ ] **Step 1: Implement payload validation**

Require a valid UUID-like event id, supported event type, and `http:` or `https:` target URL. Reject malformed events to the DLQ without retrying.

- [ ] **Step 2: Implement delivery**

POST JSON with a 15-second timeout. Treat all 2xx responses as success.

- [ ] **Step 3: Implement retry classification**

Retry 429, 5xx, timeout, DNS, and network failures. Do not retry ordinary 4xx responses except 429.

- [ ] **Step 4: Implement TTL retries**

Publish failed transient deliveries to the next retry queue with `expiration` and route them back to `clara.events` after 30 seconds, 2 minutes, and 10 minutes. Add a retry counter header.

- [ ] **Step 5: Dead-letter terminal failures**

After the third retry, reject the message with `requeue=false` so RabbitMQ routes it to `clara.dlx` and `clara.webhooks.dlq`.

- [ ] **Step 6: Commit**

```bash
git add services/rabbitmq-bridge

git commit -m "feat: add webhook retry and RabbitMQ DLQ handling"
```

---

### Task 5: Publish phone-call completion events transactionally

**Files:**
- Modify: `src/modules/phone/core/db.ts`
- Create or modify: `src/modules/events/event-contracts.ts`

**Interfaces:**
- `updateCallLog()` remains the public function used by existing phone routes.
- Terminal call updates insert a `webhook.phone.call.completed` outbox event in the same PostgreSQL transaction as the call-log update.

- [ ] **Step 1: Define the event contract**

Define the exact TypeScript payload for phone completion events, excluding secrets and large transcript data. Include a bounded transcript only if already present and below the configured size limit; otherwise include a reference/summary.

- [ ] **Step 2: Make terminal call updates transactional**

Wrap the call-log update and outbox insert in one transaction. Fetch the configured webhook URL for the call's config and insert an event only when the URL is configured and the update is terminal (`endedAt` or terminal status).

- [ ] **Step 3: Preserve existing behaviour**

If there is no webhook URL, perform only the existing database update. If the event insert fails, roll back the call-log update so the caller cannot observe a successful state that lacks its required outbox event.

- [ ] **Step 4: Run type-check/tests**

Run `npm run type-check` and the phone tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/events src/modules/phone/core/db.ts
git commit -m "feat: emit phone completion events through outbox"
```

---

### Task 6: Add deployment configuration and environment documentation

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml` if present in the current branch; otherwise create the deployment fragment documented for the existing deployment platform.
- Modify: `Dockerfile.worker` only if the chosen deployment needs shared service conventions.
- Create: `services/rabbitmq-bridge/README.md`

**Interfaces:**
- Production bridge consumes only `RABBITMQ_URL`, `CLARA_INTERNAL_API_URL`, and `WORKER_SECRET`.

- [ ] **Step 1: Document variables**

Add safe placeholders only. Never add the supplied CloudAMQP password.

- [ ] **Step 2: Add service deployment**

Run the bridge as a separate long-lived service with restart-on-failure and no public port exposure.

- [ ] **Step 3: Document CloudAMQP topology**

Document the expected exchange/queue names and the recommendation to use the cluster DNS hostname and TLS. CloudAMQP recommends environment variables, the cluster hostname, alarms, and quorum queues for production.

- [ ] **Step 4: Commit**

```bash
git add .env.example services/rabbitmq-bridge/README.md docker-compose.yml Dockerfile.worker

git commit -m "ops: deploy Clara RabbitMQ bridge"
```

---

### Task 7: Verification and deployment readiness

**Files:**
- Modify: `services/rabbitmq-bridge/README.md` only if verification discovers missing operational steps.

- [ ] **Step 1: Run static checks**

Run `npm run type-check`, `npm run lint`, and `npm test -- --run`.

- [ ] **Step 2: Verify migration ordering**

Confirm migration `025_event_outbox.sql` is automatically discovered by `src/lib/db/migrate.ts` and does not conflict with existing migrations.

- [ ] **Step 3: Verify bridge package**

Run `npm install`/`npm ci` inside `services/rabbitmq-bridge` and execute its topology validation command against a test RabbitMQ broker or CloudAMQP test vhost.

- [ ] **Step 4: Verify failure paths**

Test: RabbitMQ unavailable, webhook 500, webhook 429, webhook 400, repeated timeout, successful webhook, and final DLQ routing.

- [ ] **Step 5: Verify existing BullMQ**

Confirm `clara-crawl`, `clara-retry`, Redis progress pub/sub, and the existing ingest poller remain unchanged in responsibility.

- [ ] **Step 6: Final deployment notes**

Document password rotation, environment variable injection, CloudAMQP alarms, queue monitoring, DLQ monitoring, and replay procedure.
