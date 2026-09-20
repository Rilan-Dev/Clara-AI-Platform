# Clara RabbitMQ + DLQ Architecture Design

## Goal
Introduce RabbitMQ into Clara as a durable SaaS event bus where it provides clear value, while retaining BullMQ + Redis for job execution, and add a production-grade dead-letter path without coupling the Next.js application directly to AMQP.

## Current State
- BullMQ + Redis already powers `clara-crawl` and `clara-retry`.
- Crawl jobs use BullMQ attempts/backoff; URL retries are persisted in PostgreSQL and scheduled through BullMQ.
- Document ingestion is currently a PostgreSQL-backed queue drained by the worker process.
- Phone call webhooks update `phone_call_logs` synchronously and the phone configuration already contains an optional `webhookUrlOverride`.
- The project already runs a long-lived worker container (`Dockerfile.worker` / `workers/worker-entry.ts`).

## Decision
Do **not** replace BullMQ. Use two messaging layers with explicit responsibilities:

1. **BullMQ + Redis** — command/job execution: crawling, scheduled URL retries, and existing background work.
2. **RabbitMQ** — durable domain-event transport between the SaaS application and independently scalable integration consumers.

The first production consumer is outbound phone-call webhook delivery because Clara already exposes a per-KB webhook destination. The topology is intentionally extensible for future `knowledge_base.*`, `document.*`, billing, notification, and integration consumers.

## Reliability Pattern
Use a PostgreSQL transactional outbox in the application. The application records the domain event in PostgreSQL; a small RabbitMQ bridge service claims pending outbox rows, publishes with publisher confirms, and marks them published. This avoids losing an event when PostgreSQL succeeds but RabbitMQ is temporarily unavailable.

The bridge is isolated from the Next.js runtime, so the main application does not need an AMQP dependency. This also keeps deployment responsibilities clean.

## RabbitMQ Topology

```text
PostgreSQL event_outbox
        |
        v
rabbitmq-bridge
        |
        | publisher confirms
        v
clara.events (topic exchange, durable)
        |
        +-- webhook.phone.call.* --> clara.webhooks (quorum)
        |                              |
        |                              +-- success -> ack
        |                              +-- transient -> retry TTL queue
        |                              +-- permanent/max retry -> DLX
        |
        +-- future domain consumers

clara.dlx (direct exchange)
        |
        +--> clara.webhooks.dlq (quorum, durable)
```

Retry queues use TTL + dead-letter routing back to `clara.webhooks`; retry delays are 30 seconds, 2 minutes, and 10 minutes. The final failed delivery is dead-lettered into `clara.webhooks.dlq`.

Use durable exchanges, durable quorum queues, persistent messages, manual consumer acknowledgements, and publisher confirms. CloudAMQP's cluster hostname must be used through `CLOUDAMQP_URL`/`RABBITMQ_URL`; credentials must never be committed. TLS uses `amqps://`.

## Event Contract
Every event contains:
- `id` — UUID used as the idempotency/message identifier.
- `type` — dot-delimited event type.
- `occurredAt` — ISO timestamp.
- `aggregateType` and `aggregateId`.
- `payload` — event-specific JSON.

Phone completion event:
- type: `webhook.phone.call.completed`
- aggregateType: `phone_call`
- payload includes `callSid`, `kbId`, `status`, terminal call fields, and `targetUrl`.

The webhook consumer sends `X-Clara-Event-Id`, `X-Clara-Event-Type`, and `X-Clara-Delivery-Attempt` headers. It treats 2xx as success, non-retryable 4xx as permanent failure, and 429/5xx/network failures as retryable.

## DLQ Policy
RabbitMQ DLQ is for messages that cannot be successfully delivered after bounded retries or are rejected as permanently invalid. DLQ messages are retained for operator inspection and replay. RabbitMQ's native `x-death` headers remain available for diagnosis.

The PostgreSQL outbox remains the source of truth for publication reliability. A RabbitMQ DLQ is not used as the primary job database.

## Security
- Do not store RabbitMQ credentials in source control.
- Use `RABBITMQ_URL` with `amqps://` in production.
- The existing `WORKER_SECRET` protects the internal outbox endpoints.
- The bridge validates event payload shape before publishing.
- Outbound webhook URLs are restricted to `http:`/`https:` and are not allowed to target obvious loopback/link-local/private IP literals from the bridge configuration layer.

## Deployment
Add a `clara-rabbitmq-bridge` service to the existing deployment. It runs independently from the Next.js API and existing BullMQ worker. It only needs network access to PostgreSQL through the application API and to CloudAMQP.

Required production variables:
- `RABBITMQ_URL=amqps://...`
- `CLARA_INTERNAL_API_URL=https://app.example.com`
- `WORKER_SECRET=...`

The RabbitMQ bridge is fail-open for application requests: if RabbitMQ is unavailable, the application still records the outbox event and continues normal request processing. Publication resumes automatically when the bridge reconnects.

## Non-Goals
- Migrating `clara-crawl` or `clara-retry` from BullMQ.
- Replacing Redis.
- Moving real-time phone audio/WebSocket traffic through RabbitMQ.
- Treating RabbitMQ as the primary persistence layer.
- Adding RabbitMQ to every internal function just to increase infrastructure complexity.
