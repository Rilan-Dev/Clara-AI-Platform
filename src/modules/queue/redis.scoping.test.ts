/**
 * src/modules/queue/redis.scoping.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Environment-scoped Redis/BullMQ wiring: REDIS_URL db index, REDIS_DB for
 * the host/port form, and the optional BullMQ key prefix. Production defaults
 * must stay byte-identical to the pre-scoping behaviour.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "REDIS_URL", "REDIS_HOST", "REDIS_PORT", "REDIS_USERNAME",
  "REDIS_PASSWORD", "REDIS_DB", "CLARA_ENV", "BULLMQ_PREFIX", "NODE_ENV",
] as const;

async function freshOptions() {
  vi.resetModules();
  const mod = await import("./redis");
  return mod.getRedisConnectionOptions();
}

async function freshQueueOptions() {
  vi.resetModules();
  const mod = await import("./redis");
  return mod.bullmqQueueOptions();
}

describe("getRedisConnectionOptions — environment scoping", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("host/port form defaults to db 0 with NO db key (today's behaviour)", async () => {
    process.env.REDIS_HOST = "redis";
    process.env.REDIS_PORT = "6379";
    const options = await freshOptions();
    expect(options.db).toBeUndefined();
    expect(options.host).toBe("redis");
  });

  it("REDIS_DB isolates the host/port form", async () => {
    process.env.REDIS_HOST = "redis";
    process.env.REDIS_DB = "2";
    const options = await freshOptions();
    expect(options.db).toBe(2);
  });

  it("REDIS_URL path db index keeps working (primary isolation channel)", async () => {
    process.env.REDIS_URL = "redis://:pass@redis:6379/3";
    const options = await freshOptions();
    expect(options.db).toBe(3);
    expect(options.password).toBe("pass");
  });

  it("REDIS_URL without a path stays db-0", async () => {
    process.env.REDIS_URL = "redis://redis:6379";
    const options = await freshOptions();
    expect(options.db).toBeUndefined();
  });

  it("rejects an out-of-range REDIS_DB", async () => {
    process.env.REDIS_DB = "16";
    await expect(freshOptions()).rejects.toThrow(/between 0 and 15/);
  });
});

describe("bullmqQueueOptions — key prefix", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("production default carries connection only (no prefix key)", async () => {
    const options = await freshQueueOptions();
    expect(options).not.toHaveProperty("prefix");
    expect(options).toHaveProperty("connection");
  });

  it("development derives the dev_ prefix", async () => {
    process.env.CLARA_ENV = "development";
    const options = await freshQueueOptions();
    expect(options).toMatchObject({ prefix: "dev_" });
  });

  it("BULLMQ_PREFIX overrides; empty string disables", async () => {
    process.env.CLARA_ENV = "development";
    process.env.BULLMQ_PREFIX = "q_";
    expect(await freshQueueOptions()).toMatchObject({ prefix: "q_" });

    process.env.BULLMQ_PREFIX = "";
    expect(await freshQueueOptions()).not.toHaveProperty("prefix");
  });

  it("applies the prefix to a custom connection object", async () => {
    process.env.CLARA_ENV = "development";
    vi.resetModules();
    const mod = await import("./redis");
    const custom = { host: "other-redis", maxRetriesPerRequest: null };
    expect(mod.bullmqQueueOptions(custom)).toMatchObject({
      connection: custom,
      prefix: "dev_",
    });
  });
});
