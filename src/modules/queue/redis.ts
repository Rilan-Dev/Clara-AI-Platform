/**
 * src/modules/queue/redis.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared ioredis connection config for BullMQ.
 * Cloud deployments use REDIS_URL (redis:// or rediss://).
 * VPS/Docker deployments can continue using REDIS_HOST/REDIS_PORT.
 *
 * Environment scoping (docs/deployment/environments.md): development and
 * production can share ONE Redis server — pick a dedicated logical database
 * per environment (REDIS_URL path, e.g. redis://redis:6379/1, or REDIS_DB
 * with the host/port form). db 0 + no prefix (today's behaviour) is the
 * default for production, so existing deployments are untouched.
 */
import { resolveBullmqPrefix } from "@/lib/env-scope";

type RedisConnectionOptions = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: {};
  maxRetriesPerRequest: null;
  enableReadyCheck: false;
};

function redisDbFromEnv(): number | undefined {
  const raw = process.env.REDIS_DB?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 15) {
    throw new Error("REDIS_DB must be an integer between 0 and 15");
  }
  return n;
}

export function getRedisConnectionOptions(): RedisConnectionOptions {
  const rawUrl = process.env.REDIS_URL?.trim();
  if (rawUrl) {
    const url = new URL(rawUrl);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      throw new Error("REDIS_URL must use redis:// or rediss://");
    }
    const options = {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false as const,
      ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    };
    return options;
  }

  const legacyHost = process.env.REDIS_HOST?.trim();
  if (legacyHost?.startsWith("redis://") || legacyHost?.startsWith("rediss://")) {
    const url = new URL(legacyHost);
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  const port = Number.parseInt(process.env.REDIS_PORT ?? "6379", 10);
  return {
    host: legacyHost || "redis",
    port: Number.isFinite(port) ? port : 6379,
    username: process.env.REDIS_USERNAME?.trim() || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    // Environment scoping for the host/port form (REDIS_URL users encode the
    // db in the URL path instead). Only applied when set — default db 0.
    ...(redisDbFromEnv() != null ? { db: redisDbFromEnv() } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
export const redisConnection = getRedisConnectionOptions();

/**
 * Shared BullMQ Queue/Worker options: the connection plus an optional key
 * prefix. The REDIS_URL db index is the primary environment isolation; the
 * BULLMQ_PREFIX (dev default "dev_") covers Redis Cluster / managed Redis
 * where SELECT is unavailable. Production gets no prefix by default, so
 * in-flight job keys never move on upgrade.
 */
let bullmqPrefixLogged = false;
export function bullmqQueueOptions<TConnection extends object = typeof redisConnection>(
  connection: TConnection = redisConnection as unknown as TConnection,
): { connection: TConnection } | { connection: TConnection; prefix: string } {
  const prefix = resolveBullmqPrefix();
  if (prefix) {
    if (!bullmqPrefixLogged) {
      bullmqPrefixLogged = true;
      console.log(`[queue] BullMQ key prefix active: ${prefix} (environment scoping)`);
    }
    return { connection, prefix };
  }
  return { connection };
}
