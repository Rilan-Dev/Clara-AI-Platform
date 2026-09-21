/**
 * Shared ioredis connection config for BullMQ.
 * Cloud deployments use REDIS_URL (redis:// or rediss://).
 * VPS/Docker deployments can continue using REDIS_HOST/REDIS_PORT.
 */
import type { RedisOptions } from "ioredis";

export function getRedisConnectionOptions(): RedisOptions {
  const rawUrl = process.env.REDIS_URL?.trim();
  if (rawUrl) {
    const url = new URL(rawUrl);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      throw new Error("REDIS_URL must use redis:// or rediss://");
    }
    const options: RedisOptions = {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
    if (url.pathname.length > 1) options.db = Number(url.pathname.slice(1));
    if (url.protocol === "rediss:") options.tls = {};
    return options;
  }
  // Be defensive about legacy/misconfigured deployments where REDIS_HOST
  // contains a complete redis:// or rediss:// URL. Treat it as REDIS_URL
  // instead of handing the URL string to ioredis as a DNS hostname.
  const legacyHost = process.env.REDIS_HOST?.trim();
  if (legacyHost?.startsWith("redis://") || legacyHost?.startsWith("rediss://")) {
    const url = new URL(legacyHost);
    const options: RedisOptions = {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
    if (url.pathname.length > 1) options.db = Number(url.pathname.slice(1));
    if (url.protocol === "rediss:") options.tls = {};
    return options;
  }

  const port = Number.parseInt(process.env.REDIS_PORT ?? "6379", 10);
  return {
    host: legacyHost || "redis",
    port: Number.isFinite(port) ? port : 6379,
    username: process.env.REDIS_USERNAME?.trim() || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
export const redisConnection = getRedisConnectionOptions();
