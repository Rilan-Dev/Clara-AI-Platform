/**
 * src/modules/queue/redis.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared ioredis connection config for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` — without it the client throws
 * "maxRetriesPerRequest is not supported" at startup.
 */

export const redisConnection = {
  host: process.env.REDIS_HOST ?? "redis",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  /**
   * Required by BullMQ. Setting null disables the per-request retry cap so
   * BullMQ can manage its own connection lifecycle and retries.
   */
  maxRetriesPerRequest: null as null,
  /** Reconnect forever — the worker is a long-running daemon. */
  enableReadyCheck: false,
};
