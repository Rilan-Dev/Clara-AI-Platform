import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import Redis from "ioredis";
import {
  getOpenAICatalogCached,
  invalidateOpenAICatalogCache,
  __resetOpenAICatalogRedisForTests,
} from "./openai-catalog-cache";
import { OPENAI_REALTIME_VOICES } from "./openai-catalog";

/* ── ioredis harness: an in-memory map standing in for Redis ──────────────── */

type Store = Map<string, { value: string; expiresAt: number | null }>;
const store: Store = new Map();
let shouldFail = false;
let incrCalls = 0;

vi.mock("ioredis", () => ({
  default: class MockRedis {
    on() { return this; }
    async get(key: string) {
      if (shouldFail) throw new Error("redis down");
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== null && entry.expiresAt < Date.now()) return null;
      return entry.value;
    }
    async ttl(key: string) {
      if (shouldFail) throw new Error("redis down");
      const entry = store.get(key);
      if (!entry) return -2;
      if (entry.expiresAt === null) return -1;
      return Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
    }
    async set(key: string, value: string, _mode?: string, ttlSeconds?: number) {
      if (shouldFail) throw new Error("redis down");
      store.set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
      });
      return "OK";
    }
    async incr(key: string) {
      if (shouldFail) throw new Error("redis down");
      incrCalls += 1;
      const next = String(Number(store.get(key)?.value ?? 0) + 1);
      store.set(key, { value: next, expiresAt: null });
      return Number(next);
    }
    disconnect() { /* noop */ }
  },
}));

function mockFetch(models: Array<{ id: string }>) {
  // Each call must return a FRESH Response — a body can only be read once.
  const fetchSpy = vi.fn().mockImplementation(async () =>
    new Response(JSON.stringify({ data: models }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

const API_KEY = "sk-test-catalog-key";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
  store.clear();
  shouldFail = false;
  incrCalls = 0;
  __resetOpenAICatalogRedisForTests();
  // Instantiate a fresh mock client for this test.
  new Redis();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("openai-catalog-cache", () => {
  it("fetches live on a miss, stores in Redis, then serves hits without fetching", async () => {
    const fetchSpy = mockFetch([{ id: "gpt-realtime-2.1-mini" }]);

    const first = await getOpenAICatalogCached(API_KEY);
    expect(first.cache).toBe("miss");
    expect(first.catalog.realtimeModels.map((m) => m.id)).toEqual(["gpt-realtime-2.1-mini"]);
    expect(first.catalog.voices).toHaveLength(OPENAI_REALTIME_VOICES.length);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await getOpenAICatalogCached(API_KEY);
    expect(second.cache).toBe("hit");
    expect(second.cachedAt).toBeTruthy();
    expect(typeof second.ttlSeconds).toBe("number");
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no second OpenAI round-trip
  });

  it("refresh=1 bypasses the cache, refetches, and repopulates Redis", async () => {
    const fetchSpy = mockFetch([{ id: "gpt-realtime-2.1" }]);

    await getOpenAICatalogCached(API_KEY); // prime the cache
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const refreshed = await getOpenAICatalogCached(API_KEY, { refresh: true });
    expect(refreshed.cache).toBe("refresh");
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // And the refreshed payload is now the cached one.
    const next = await getOpenAICatalogCached(API_KEY);
    expect(next.cache).toBe("hit");
    expect(next.catalog.realtimeModels.map((m) => m.id)).toEqual(["gpt-realtime-2.1"]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps a different API key on a different cache entry (key rotation misses)", async () => {
    const fetchSpy = mockFetch([{ id: "gpt-realtime-2.1" }]);

    await getOpenAICatalogCached("sk-key-one");
    const rotated = await getOpenAICatalogCached("sk-key-two");
    expect(rotated.cache).toBe("miss");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("falls back to a live fetch when Redis is unavailable", async () => {
    shouldFail = true;
    const fetchSpy = mockFetch([{ id: "gpt-realtime-2.1-mini" }]);

    const result = await getOpenAICatalogCached(API_KEY);
    expect(result.cache).toBe("fallback");
    expect(result.catalog.voices).toHaveLength(OPENAI_REALTIME_VOICES.length);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("expires cached entries after the TTL", async () => {
    mockFetch([{ id: "gpt-realtime-2.1" }]);
    await getOpenAICatalogCached(API_KEY); // miss → cached

    vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 1000); // default TTL is 6h

    const expired = await getOpenAICatalogCached(API_KEY);
    expect(expired.cache).toBe("miss");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("invalidation bumps the version so every fingerprint misses once", async () => {
    const fetchSpy = mockFetch([{ id: "gpt-realtime-2.1" }]);

    await getOpenAICatalogCached("sk-key-one"); // miss
    await getOpenAICatalogCached("sk-key-one"); // hit

    expect(await invalidateOpenAICatalogCache()).toBe(true);
    expect(incrCalls).toBe(1);

    const after = await getOpenAICatalogCached("sk-key-one");
    expect(after.cache).toBe("miss");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("invalidation reports failure when Redis is unavailable", async () => {
    shouldFail = true;
    expect(await invalidateOpenAICatalogCache()).toBe(false);
  });
});
