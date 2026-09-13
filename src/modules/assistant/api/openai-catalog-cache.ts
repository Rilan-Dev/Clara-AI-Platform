/**
 * OpenAI catalog cache — Redis-backed with graceful degradation.
 *
 * Why: the Voice tab used to trigger a live OpenAI /v1/models round-trip on
 * every visit. Voices are a code-level API contract and the model list barely
 * changes, so the catalog is cached in Redis:
 *
 *  - Key space:  clara:openai-catalog:<version>:<apiKeyFingerprint>
 *      · <version>     — bumped by invalidateOpenAICatalogCache() when voice /
 *                        AI settings change, so every fingerprint misses once.
 *      · <fingerprint> — sha256 of the API key, so rotating the key misses
 *                        without any explicit invalidation.
 *  - TTL: OPENAI_CATALOG_CACHE_TTL_SECONDS (default 6 hours).
 *  - Failure policy: if Redis is unreachable the route still answers from a
 *    live OpenAI fetch (cache status "fallback") — caching is an optimisation,
 *    never a dependency.
 */
import crypto from "node:crypto";
import Redis from "ioredis";
import { redisConnection } from "@/modules/queue/redis";
import { fetchOpenAIModelCatalog, type OpenAICatalog } from "./openai-catalog";

const VERSION_KEY = "clara:openai-catalog:version";
const KEY_PREFIX = "clara:openai-catalog";
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;

function ttlSeconds(): number {
  const raw = Number(process.env.OPENAI_CATALOG_CACHE_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_TTL_SECONDS;
}

/* ── Redis client (lazy singleton, shared on globalThis for dev HMR) ──────── */

type CacheGlobal = typeof globalThis & {
  __openaiCatalogRedis?: Redis | null;
};
const cacheGlobal = globalThis as CacheGlobal;

function getCacheRedis(): Redis | null {
  if (cacheGlobal.__openaiCatalogRedis !== undefined) return cacheGlobal.__openaiCatalogRedis;
  try {
    // A short, bounded retry budget keeps a dead Redis from hanging requests;
    // enableOfflineQueue=false makes commands fail fast instead of queueing.
    cacheGlobal.__openaiCatalogRedis = new Redis({
      ...redisConnection,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => (times > 2 ? null : Math.min(times * 200, 500)),
      lazyConnect: false,
      connectTimeout: 1500,
    });
    cacheGlobal.__openaiCatalogRedis.on("error", () => {
      /* handled per-command via try/catch; logged by callers */
    });
  } catch {
    cacheGlobal.__openaiCatalogRedis = null;
  }
  return cacheGlobal.__openaiCatalogRedis;
}

/** Test hook: drop the cached client so tests can inject a fresh mock. */
export function __resetOpenAICatalogRedisForTests(): void {
  cacheGlobal.__openaiCatalogRedis = undefined;
}

/* ── Cache operations ─────────────────────────────────────────────────────── */

export type CatalogCacheStatus = "hit" | "miss" | "refresh" | "fallback";

export type CachedOpenAICatalog = {
  catalog: OpenAICatalog;
  cache: CatalogCacheStatus;
  /** When the cached payload was written (Redis hit only). */
  cachedAt?: string;
  /** Remaining cache lifetime in seconds. */
  ttlSeconds?: number;
};

function fingerprint(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}

async function withRedis<T>(operation: (redis: Redis) => Promise<T>): Promise<T | null> {
  const redis = getCacheRedis();
  if (!redis) return null;
  try {
    return await operation(redis);
  } catch {
    return null; // Redis down / timing out — degrade gracefully.
  }
}

async function currentVersion(): Promise<string> {
  const version = await withRedis((redis) => redis.get(VERSION_KEY));
  return version ?? "0";
}

async function readCache(apiKey: string): Promise<{ catalog: OpenAICatalog; cachedAt: string; ttl: number } | null> {
  return withRedis(async (redis) => {
    const key = `${KEY_PREFIX}:${await currentVersion()}:${fingerprint(apiKey)}`;
    const [payload, ttl] = await Promise.all([
      redis.get(key),
      redis.ttl(key),
    ]);
    if (!payload) return null;
    try {
      const parsed = JSON.parse(payload) as { catalog: OpenAICatalog; cachedAt: string };
      if (!parsed?.catalog?.voices) return null;
      return { catalog: parsed.catalog, cachedAt: parsed.cachedAt, ttl: Math.max(ttl, 0) };
    } catch {
      return null;
    }
  });
}

/** Returns true when written, null when Redis was unavailable. */
async function writeCache(apiKey: string, catalog: OpenAICatalog): Promise<boolean | null> {
  return withRedis(async (redis) => {
    const key = `${KEY_PREFIX}:${await currentVersion()}:${fingerprint(apiKey)}`;
    const body = JSON.stringify({ catalog, cachedAt: new Date().toISOString() });
    await redis.set(key, body, "EX", ttlSeconds());
    return true;
  });
}

/**
 * Get the OpenAI capability catalog through the Redis cache.
 *
 * @param apiKey  Active OpenAI API key (fingerprinted into the cache key).
 * @param opts.refresh  Skip the cache, refetch live, and repopulate Redis.
 */
export async function getOpenAICatalogCached(
  apiKey: string,
  opts: { refresh?: boolean } = {},
): Promise<CachedOpenAICatalog> {
  if (!opts.refresh) {
    const cached = await readCache(apiKey);
    if (cached) {
      return { catalog: cached.catalog, cache: "hit", cachedAt: cached.cachedAt, ttlSeconds: cached.ttl };
    }
  }

  const catalog = await fetchOpenAIModelCatalog(apiKey);

  const stored = await writeCache(apiKey, catalog);
  if (stored !== true) {
    // Redis unavailable — still answer, but flag it so the UI can say "live".
    return { catalog, cache: "fallback" };
  }
  return { catalog, cache: opts.refresh ? "refresh" : "miss" };
}

/**
 * Invalidate every cached catalog (all API-key fingerprints).
 *
 * Call whenever voice / AI provider settings change — e.g. the platform env
 * page saving an OPENAI_* key, or platform assistant defaults changing the
 * default voice. Bumping the version makes the next read a miss; stale keys
 * simply expire via TTL.
 */
export async function invalidateOpenAICatalogCache(): Promise<boolean> {
  const bumped = await withRedis(async (redis) => {
    await redis.incr(VERSION_KEY);
    return true;
  });
  return bumped === true;
}
