import amqp from "amqplib";
import { assertTopology, EXCHANGE_EVENTS, ROUTING_KEY, WEBHOOK_QUEUE } from "./topology.mjs";

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const CLARA_INTERNAL_API_URL = process.env.CLARA_INTERNAL_API_URL?.replace(/\/$/, "");
const WORKER_SECRET = process.env.WORKER_SECRET;
const POLL_MS = Number.parseInt(process.env.RABBITMQ_OUTBOX_POLL_MS ?? "1000", 10);
const PREFETCH = Number.parseInt(process.env.RABBITMQ_WEBHOOK_PREFETCH ?? "10", 10);

if (!RABBITMQ_URL) throw new Error("RABBITMQ_URL is required");
if (!CLARA_INTERNAL_API_URL) throw new Error("CLARA_INTERNAL_API_URL is required");
if (!WORKER_SECRET) throw new Error("WORKER_SECRET is required");

let publisherChannel = null;
let consumerChannel = null;
let stopping = false;
let pollRunning = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function workerHeaders() {
  return {
    authorization: `Bearer ${WORKER_SECRET}`,
    "content-type": "application/json",
  };
}

async function fetchInternal(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(`${CLARA_INTERNAL_API_URL}${path}`, {
      ...options,
      headers: { ...workerHeaders(), ...(options.headers ?? {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function publishConfirmed(channel, exchange, routingKey, content, options) {
  await new Promise((resolve, reject) => {
    channel.publish(exchange, routingKey, content, options, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function setupRabbit(model) {
  const topologyChannel = await model.createChannel();
  topologyChannel.on("error", (err) => console.error("[rabbitmq] topology channel:", err.message));
  await assertTopology(topologyChannel);

  const publisher = await model.createConfirmChannel();
  publisher.on("error", (err) => console.error("[rabbitmq] publisher channel:", err.message));
  publisherChannel = publisher;

  const consumer = await model.createChannel();
  consumer.on("error", (err) => console.error("[rabbitmq] consumer channel:", err.message));
  await consumer.prefetch(Number.isFinite(PREFETCH) && PREFETCH > 0 ? PREFETCH : 10);
  consumerChannel = consumer;

  await consumer.consume(WEBHOOK_QUEUE, (msg) => {
    if (!msg || !consumerChannel) return;
    void handleWebhookMessage(consumerChannel, msg).catch((err) => {
      console.error("[rabbitmq] webhook handler crashed:", err);
      try { consumerChannel?.nack(msg, false, false); } catch {}
    });
  }, { noAck: false });

  console.log("[rabbitmq] topology and consumers ready");
}

async function relayOutbox() {
  if (pollRunning || stopping || !publisherChannel) return;
  pollRunning = true;
  try {
    const response = await fetchInternal(`/api/internal/outbox?limit=20`);
    if (!response.ok) throw new Error(`outbox HTTP ${response.status}`);
    const body = await response.json();
    for (const event of body.events ?? []) {
      try {
        const envelope = {
          id: event.id,
          type: event.type,
          occurredAt: event.createdAt,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
        };
        await publishConfirmed(
          publisherChannel,
          EXCHANGE_EVENTS,
          event.routingKey,
          Buffer.from(JSON.stringify(envelope)),
          {
            contentType: "application/json",
            contentEncoding: "utf-8",
            persistent: true,
            messageId: event.id,
            type: event.type,
            timestamp: Date.now(),
          },
        );

        const ack = await fetchInternal(`/api/internal/outbox/${encodeURIComponent(event.id)}/published`, { method: "POST" });
        if (!ack.ok) console.error(`[outbox] publish ack failed for ${event.id}: HTTP ${ack.status}`);
      } catch (err) {
        console.error(`[outbox] failed to publish ${event.id}:`, err.message);
        await fetchInternal(`/api/internal/outbox/${encodeURIComponent(event.id)}/failed`, {
          method: "POST",
          body: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        }).catch((failure) => console.error("[outbox] failure callback failed:", failure.message));
      }
    }
  } catch (err) {
    console.warn("[outbox] relay unavailable:", err.message);
  } finally {
    pollRunning = false;
  }
}

function retryQueueFor(attempt) {
  if (attempt <= 0) return null;
  if (attempt === 1) return "clara.webhooks.retry.30s";
  if (attempt === 2) return "clara.webhooks.retry.2m";
  if (attempt === 3) return "clara.webhooks.retry.10m";
  return null;
}

function isSafeWebhookUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (host === "::1" || host === "0.0.0.0") return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
    const match = host.match(/^172\.(\d+)\./);
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
    return true;
  } catch {
    return false;
  }
}

async function deliverWebhook(event, attempt) {
  const targetUrl = event?.payload?.targetUrl;
  if (!isSafeWebhookUrl(targetUrl)) {
    const error = new Error("Webhook target URL is invalid or blocked");
    error.permanent = true;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Clara-Webhooks/1.0",
        "x-clara-event-id": event.id,
        "x-clara-event-type": event.type,
        "x-clara-delivery-attempt": String(attempt),
      },
      body: JSON.stringify(event.payload),
      signal: controller.signal,
    });

    if (response.ok) return;
    const error = new Error(`Webhook returned HTTP ${response.status}`);
    error.retryable = response.status === 429 || response.status >= 500;
    error.permanent = !error.retryable;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function handleWebhookMessage(channel, msg) {
  let event;
  try {
    event = JSON.parse(msg.content.toString("utf8"));
  } catch {
    channel.nack(msg, false, false);
    return;
  }

  const attempt = Number(msg.properties.headers?.["x-clara-retry"] ?? 0) + 1;
  try {
    if (event.type !== "webhook.phone.call.completed") throw Object.assign(new Error("Unsupported webhook event type"), { permanent: true });
    await deliverWebhook(event, attempt);
    channel.ack(msg);
    console.log(`[webhook] delivered event=${event.id} attempt=${attempt}`);
  } catch (err) {
    const retryable = err?.retryable === true || (!err?.permanent && err?.name === "AbortError");
    const retryQueue = retryable ? retryQueueFor(attempt) : null;

    if (retryQueue) {
      channel.sendToQueue(retryQueue, msg.content, {
        persistent: true,
        contentType: "application/json",
        messageId: event.id,
        type: event.type,
        headers: { ...msg.properties.headers, "x-clara-retry": attempt },
      });
      channel.ack(msg);
      console.warn(`[webhook] retry scheduled event=${event.id} attempt=${attempt}`);
      return;
    }

    console.error(`[webhook] dead-lettering event=${event.id}:`, err?.message ?? String(err));
    channel.nack(msg, false, false);
  }
}

async function main() {
  if (process.argv.includes("--topology-only")) {
    const connection = await amqp.connect(RABBITMQ_URL, { heartbeat: 30 });
    const channel = await connection.createChannel();
    await assertTopology(channel);
    await channel.close();
    await connection.close();
    console.log("[rabbitmq] topology ready");
    return;
  }

  const connection = await amqp.connect(RABBITMQ_URL, {
    heartbeat: 30,
    clientProperties: { connection_name: "clara-rabbitmq-bridge" },
    recovery: {
      initialDelay: 500,
      maxDelay: 10_000,
      factor: 2,
      jitter: 0.2,
      maxRetries: Infinity,
      setup: setupRabbit,
    },
  });

  connection.on("error", (err) => console.error("[rabbitmq] connection:", err.message));
  connection.on("handler-error", (err, event) => console.error(`[rabbitmq] handler error ${event}:`, err.message));
  connection.on("connect", () => console.log("[rabbitmq] connected"));
  connection.on("disconnect", (err) => console.warn("[rabbitmq] disconnected:", err?.message ?? "unknown"));

  await setupRabbit(connection);
  console.log("[rabbitmq] Clara bridge started");

  while (!stopping) {
    await relayOutbox();
    await sleep(Number.isFinite(POLL_MS) && POLL_MS > 0 ? POLL_MS : 1000);
  }

  await connection.close();
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[rabbitmq] ${signal} — shutting down`);
  try { await publisherChannel?.close(); } catch {}
  try { await consumerChannel?.close(); } catch {}
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

main().catch((err) => {
  console.error("[rabbitmq] fatal:", err);
  process.exit(1);
});
