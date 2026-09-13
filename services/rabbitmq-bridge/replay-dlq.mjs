import amqp from "amqplib";
import { assertTopology, EXCHANGE_EVENTS, WEBHOOK_DLQ, ROUTING_KEY } from "./topology.mjs";

const url = process.env.RABBITMQ_URL;
if (!url) throw new Error("RABBITMQ_URL is required");

const requested = Number.parseInt(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "10", 10);
const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 10;

const connection = await amqp.connect(url, { heartbeat: 30, clientProperties: { connection_name: "clara-rabbitmq-dlq-replay" } });
try {
  const topology = await connection.createChannel();
  await assertTopology(topology);
  await topology.close();

  const consumer = await connection.createChannel();
  const publisher = await connection.createConfirmChannel();
  await consumer.prefetch(1);

  let replayed = 0;
  let done;
  const finished = new Promise((resolve) => { done = resolve; });

  await consumer.consume(WEBHOOK_DLQ, async (msg) => {
    if (!msg) return done();
    if (replayed >= limit) {
      consumer.nack(msg, false, true);
      return done();
    }

    try {
      await new Promise((resolve, reject) => {
        publisher.publish(
          EXCHANGE_EVENTS,
          msg.properties.headers?.["x-first-death-routing-key"] ?? ROUTING_KEY,
          msg.content,
          {
            persistent: true,
            contentType: msg.properties.contentType ?? "application/json",
            contentEncoding: msg.properties.contentEncoding ?? "utf-8",
            messageId: msg.properties.messageId,
            type: msg.properties.type,
            headers: { ...msg.properties.headers, "x-clara-replayed": "true" },
          },
          (err) => err ? reject(err) : resolve(),
        );
      });
      consumer.ack(msg);
      replayed += 1;
      console.log(`[dlq] replayed ${msg.properties.messageId ?? "unknown"}`);
      if (replayed >= limit) done();
    } catch (err) {
      console.error("[dlq] replay failed; message remains in DLQ:", err.message);
      consumer.nack(msg, false, true);
      done();
    }
  }, { noAck: false });

  await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, 30_000))]);
  await consumer.close();
  await publisher.close();
} finally {
  await connection.close();
}

console.log(`[dlq] replay complete; count=${replayed}`);
