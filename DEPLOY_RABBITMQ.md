# Clara RabbitMQ + DLQ Deployment Runbook

This runbook adds the RabbitMQ event layer without replacing the existing BullMQ/Redis job system.

## 1. Rotate the exposed CloudAMQP password first

The RabbitMQ credential previously shared outside the deployment environment must be rotated before production deployment. Do not copy that credential into Git, `.env.example`, Dockerfiles, or logs.

Use the CloudAMQP console's password rotation control, then store the new AMQPS URL in your deployment secret store.

## 2. Production variables

Set these on the **Next.js application** and the **RabbitMQ bridge** as appropriate:

```text
WORKER_SECRET=<strong shared internal secret>
RABBITMQ_URL=amqps://USER:PASSWORD@CLUSTER_HOST/VHOST
CLARA_INTERNAL_API_URL=https://your-clara-domain.example
RABBITMQ_OUTBOX_POLL_MS=1000
RABBITMQ_WEBHOOK_PREFETCH=10
```

Use the CloudAMQP cluster DNS hostname, not an individual broker node. Keep AMQPS/TLS enabled in production.

## 3. Apply the database migration

Clara's normal startup migration runner discovers `025_event_outbox.sql` automatically. On the first production rollout, verify the startup logs contain:

```text
[migrate] applied 025_event_outbox.sql
```

The migration creates `event_outbox`, indexes for pending/stale rows, and a deduplication key.

## 4. Deploy the bridge

From the repository root:

```bash
docker compose -f docker-compose.rabbitmq-bridge.yaml up --build -d
```

Check:

```bash
docker compose -f docker-compose.rabbitmq-bridge.yaml ps
docker compose -f docker-compose.rabbitmq-bridge.yaml logs -f clara-rabbitmq-bridge
```

Expected startup logs:

```text
[rabbitmq] connected
[rabbitmq] topology and consumers ready
[rabbitmq] Clara bridge started
```

The bridge does not expose a public port.

## 5. RabbitMQ topology

The bridge declares this topology automatically:

```text
PostgreSQL event_outbox
        |
        v
rabbitmq-bridge -- publisher confirms --> clara.events (topic)
                                             |
                                             +--> webhook.phone.call.completed
                                                    |
                                                    v
                                             clara.webhooks (quorum)
                                                    |
                                  +-----------------+------------------+
                                  |                                    |
                               success                              failure
                                  |                                    |
                                 ACK                         retry 30s -> 2m -> 10m
                                                                       |
                                                                       v
                                                              clara.dlx / DLQ
                                                                       |
                                                                       v
                                                          clara.webhooks.dlq
```

The integration queues are quorum queues because the CloudAMQP/RabbitMQ production guidance recommends them for replicated, data-safe workloads.

## 6. What remains on BullMQ

Do not remove Redis or BullMQ. Clara continues to use BullMQ for:

- `clara-crawl`
- `clara-retry`
- delayed URL retries
- crawl worker concurrency
- existing background job execution

RabbitMQ is the domain-event/integration bus, not the replacement job scheduler.

## 7. Phone webhook behaviour

When a phone call reaches a terminal state and its phone configuration has `webhookUrlOverride`, the call-log update and outbox event are committed in the same PostgreSQL transaction.

The bridge publishes the event and the webhook consumer sends:

```http
POST <webhookUrlOverride>
Content-Type: application/json
User-Agent: Clara-Webhooks/1.0
X-Clara-Event-Id: <uuid>
X-Clara-Event-Type: webhook.phone.call.completed
X-Clara-Delivery-Attempt: <number>
```

2xx responses are acknowledged. 429/5xx/network timeouts use the bounded retry path. Other 4xx responses are dead-lettered without retry.

## 8. DLQ operations

Inspect `clara.webhooks.dlq` in the CloudAMQP/RabbitMQ management interface.

Before replaying a message:

1. Fix the webhook receiver or configuration.
2. Confirm the receiving system uses `X-Clara-Event-Id` for idempotency.
3. Replay the original message to `clara.events` with routing key `webhook.phone.call.completed`.

RabbitMQ delivery is intentionally at-least-once. A network failure after the remote receiver accepts a request but before Clara receives the HTTP response can cause a retry.

## 9. Monitoring alerts

Create CloudAMQP alarms for:

- `clara.webhooks.dlq` > 0
- sustained growth in `clara.webhooks`
- sustained growth in `clara.webhooks.retry.*`
- broker memory/disk alarms
- unexpected connection/channel growth

Also monitor the PostgreSQL outbox for rows in `failed` or a growing `pending` backlog.

## 10. Rollback

The RabbitMQ layer can be disabled without changing the BullMQ crawl/retry system:

1. Stop `clara-rabbitmq-bridge`.
2. Keep the application running; phone-call completion events remain in `event_outbox`.
3. Re-enable the bridge after RabbitMQ is healthy.

If the application release itself must be rolled back, first ensure the older release understands the `event_outbox` migration. The table is additive and does not modify existing phone tables.
