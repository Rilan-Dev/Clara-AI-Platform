export const EXCHANGE_EVENTS = "clara.events";
export const EXCHANGE_DLX = "clara.dlx";
export const WEBHOOK_QUEUE = "clara.webhooks";
export const WEBHOOK_DLQ = "clara.webhooks.dlq";
export const ROUTING_KEY = "webhook.phone.call.completed";

const QUORUM = { "x-queue-type": "quorum" };

export async function assertTopology(channel) {
  await channel.assertExchange(EXCHANGE_EVENTS, "topic", { durable: true });
  await channel.assertExchange(EXCHANGE_DLX, "direct", { durable: true });

  await channel.assertQueue(WEBHOOK_QUEUE, {
    durable: true,
    arguments: {
      ...QUORUM,
      "x-dead-letter-exchange": EXCHANGE_DLX,
      "x-dead-letter-routing-key": "webhook.dlq",
      "x-delivery-limit": 8,
    },
  });

  await channel.assertQueue(WEBHOOK_DLQ, {
    durable: true,
    arguments: QUORUM,
  });

  await channel.bindQueue(WEBHOOK_QUEUE, EXCHANGE_EVENTS, ROUTING_KEY);
  await channel.bindQueue(WEBHOOK_DLQ, EXCHANGE_DLX, "webhook.dlq");

  const retries = [
    ["clara.webhooks.retry.30s", 30_000],
    ["clara.webhooks.retry.2m", 120_000],
    ["clara.webhooks.retry.10m", 600_000],
  ];

  for (const [queue, ttl] of retries) {
    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        ...QUORUM,
        "x-message-ttl": ttl,
        "x-dead-letter-exchange": EXCHANGE_EVENTS,
        "x-dead-letter-routing-key": ROUTING_KEY,
      },
    });
  }
}
