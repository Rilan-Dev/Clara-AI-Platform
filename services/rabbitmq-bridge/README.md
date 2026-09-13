# Clara RabbitMQ Bridge

This service is the SaaS event relay between PostgreSQL and CloudAMQP RabbitMQ.

## Responsibilities

1. Claims pending rows from Clara's PostgreSQL transactional outbox through the authenticated internal API.
2. Publishes durable events to `clara.events` with publisher confirms.
3. Consumes `webhook.phone.call.completed` from `clara.webhooks`.
4. Delivers the configured phone webhook with bounded retries.
5. Dead-letters terminal failures into `clara.webhooks.dlq`.

## Environment

```text
RABBITMQ_URL=amqps://USER:PASSWORD@CLUSTER_HOST/VHOST
CLARA_INTERNAL_API_URL=https://clara.example.com
WORKER_SECRET=<same value used by Clara>
RABBITMQ_OUTBOX_POLL_MS=1000
RABBITMQ_WEBHOOK_PREFETCH=10
```

Do not put credentials in this repository. Use the CloudAMQP cluster hostname, environment variables, TLS, monitoring alarms, and quorum queues for production deployments.

## RabbitMQ topology

```text
clara.events (topic)
       |
       +-- webhook.phone.call.completed --> clara.webhooks (quorum)
                                              |
                                              +-- 2xx --> ACK
                                              +-- 429/5xx/timeout --> retry 30s -> 2m -> 10m
                                              +-- permanent/max retry --> clara.dlx -> clara.webhooks.dlq
```

## DLQ operations

A dead-lettered message is retained in `clara.webhooks.dlq`. Inspect `x-death`, `x-first-death-*`, and `x-last-death-*` headers when diagnosing failures.

Replay should be performed only after correcting the target URL/application failure. Re-publishing the same event is at-least-once behaviour, so the receiving webhook should use `X-Clara-Event-Id` as an idempotency key.

## Health / monitoring

Monitor:

- `clara.webhooks` ready/unacked messages
- `clara.webhooks.retry.*` queue depth
- `clara.webhooks.dlq` depth
- RabbitMQ connection count and channel count
- outbox rows in `publishing`, `pending`, and `failed`
- webhook 429/5xx rate
- bridge reconnects

CloudAMQP provides queue, connection, consumer, and channel monitoring/alarms through its console.
