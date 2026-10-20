# 25 — Background Jobs & Messaging

> Clara AI Platform feature documentation · Domain: `queue` + `cloud-jobs` + `events` (outbox) + worker routes + RabbitMQ bridge · Base: `feature/ai-core-from-doable-source @ 1adb80bf`

## 1. Definition & Purpose

The asynchronous backbone: BullMQ/Redis job queues for ingest/crawl/scrape/retry work (Docker deployment), a Vercel-compatible cloud queue transport for serverless, the transactional event outbox that reliably publishes usage/analytics events, and the RabbitMQ bridge with dead-letter-queue replay for the messaging spine. Its purpose is that heavy work (indexing documents, crawling sites) and event delivery never block request paths, and never get lost — retries, DLQ replay, and idempotent workers are first-class.

## 2. Business Logic

- **BullMQ queues** — `src/modules/queue/redis.ts`: `getRedisConnectionOptions:37`, `bullmqQueueOptions:95`; `src/modules/queue/index.ts`: `getCrawlQueue:44`, `getRetryQueue:82` (+ ingest/scrape queues). Enqueue routes: `/api/queue/{ingest,crawl,scrape,retry}`.
- **Workers** — Docker services `clara-worker` (compose) + `/api/worker/{ingest,reindex,scrape}` execute jobs: ingestion pipeline (Feature 06), reindex (embedding realignment), scraping (Feature 07).
- **Cloud transport** — `src/modules/cloud-jobs/queue.ts`: `CLOUD_JOB_TOPICS:21`, `CloudJobKind:28`, `CloudQueueTransport:36` ("vercel" | "local"), `cloudQueueTransport:38` (env switch), `enqueueCloudJob:72`; handlers `handlers.ts`: `handleIngestMessage:23`, `handleCrawlMessage:31`, `handleRetryMessage:38`, `handleScrapeMessage:47`, dispatcher `dispatchCloudJob:82`, `unwrapPayload:15`; processors `process-crawl.ts:20`, `process-retry.ts:29`.
- **Event outbox** — `src/modules/events/outbox-db.ts`: `insertOutboxEvent:14`, `claimOutboxEvents:46`, `markOutboxPublished:85`, `markOutboxFailed:96`; internal routes `/api/internal/outbox` (+ `[id]/published`, `[id]/failed`) drive the publisher loop; migration `025_event_outbox.sql`.
- **RabbitMQ bridge** — `services/rabbitmq-bridge/` (Docker service `clara-rabbitmq-bridge`): `index.mjs` consumer, `topology.mjs` exchanges/queues/DLQ, `replay-dlq.mjs` dead-letter replay tool; design docs `docs/superpowers/{specs,plans}/2026-09-13-rabbitmq-dlq*`.
- **Cron** — Feature 21 sweeps run on schedule (Vercel cron / compose): ai-health, whatsapp health/briefings, onboarding reminders, expiry sweep (Feature 17).

## 3. Business Rules

- Queue transport is environment-selected: BullMQ+Redis for Docker, Vercel queues for serverless — same handlers, zero business-logic divergence.
- Outbox events are inserted transactionally with the state they describe; publication retries until success (failed marked with error, reviewable).
- DLQ replay is explicit operator action with audit (never automatic re-processing of poison messages).
- Workers are idempotent per job/document — re-delivery never double-indexes (document status machine guards).
- `CLARA_ENV` scoping prefixes queues/collections so dev/prod never collide (Feature 26 `env-scope`).

## 4. Data Model

- `025_event_outbox.sql`; BullMQ state in Redis (db index per env); RabbitMQ topology (dlq exchanges/queues).

## 5. API Surface

| Route | Purpose |
|---|---|
| `src/app/api/queue/{ingest,crawl,scrape,retry}/route.ts` | enqueue (auth'd) |
| `src/app/api/worker/{ingest,reindex,scrape}/route.ts` | worker execution (queue/cron auth) |
| `src/app/api/internal/outbox{,/[id]/published,/[id]/failed}` | outbox publisher control |
| `src/app/api/cron/**` | scheduled sweeps (Feature 21/17) |

## 6. Core Module Files

| File | Key exports (line) |
|---|---|
| `src/modules/queue/redis.ts` | `getRedisConnectionOptions:37`, `bullmqQueueOptions:95` |
| `src/modules/queue/index.ts` | `getCrawlQueue:44`, `getRetryQueue:82` |
| `src/modules/cloud-jobs/queue.ts` | `cloudQueueTransport:38`, `enqueueCloudJob:72`, `CLOUD_JOB_TOPICS:21` |
| `src/modules/cloud-jobs/handlers.ts` | `dispatchCloudJob:82` + message handlers `:15-47` |
| `src/modules/events/outbox-db.ts` | `insertOutboxEvent:14`, `claimOutboxEvents:46`, `markOutboxPublished:85`, `markOutboxFailed:96` |
| `services/rabbitmq-bridge/{index,topology,replay-dlq}.mjs` | bridge consumer/topology/DLQ replay |

## 7. UI Reference

- Indirect: document status screens show worker outcomes (Feature 05/06); system-status shows queue health (Feature 21).

## 8. Environment Variables

- `REDIS_URL` (db index per env), `RABBITMQ_*` (vhost per env), `CLOUD_QUEUE_TRANSPORT`, Vercel cron secrets — see `.env.example` + `docs/deployment/environments.md`.

## 9. Tests

- Outbox/cloud-jobs suites, queue option tests, DLQ replay dry-run harness (`services/rabbitmq-bridge/replay-dlq.mjs --dry`), e2e `scripts/e2e-ingest-queue.js`, `scripts/e2e-expiry-sweep.js`.

## 10. Cross-links

- Job payloads — **06/07** (ingest/crawl), **17** (downgrades); event writers — **20**; env scoping — **26**.
