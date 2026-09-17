/**
 * src/lib/rate-limit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory fixed-window rate limiter (Phase 6.4).
 *
 * Design notes:
 *   - Fixed windows (not sliding) keep memory O(active keys) and are simple
 *     to reason about; boundaries are aligned to epoch multiples so restarts
 *     and multi-process drift are stable.
 *   - Single-process deployment (Next.js standalone, one Node process — see
 *     DEPLOYMENT.md) means in-memory state is authoritative. If the platform
 *     is ever scaled horizontally, swap `hit()` for a Redis INCR + EXPIRE
 *     backend — the call sites only depend on the RateLimitResult shape.
 *   - Buckets are namespaced ("login:ip:<ip>", "chat:org:<uuid>", ...) so
 *     different endpoints with different limits never collide.
 *   - A periodic sweeper evicts stale buckets so long-tail unique keys
 *     (spoofed XFF values, one-off visitors) cannot grow memory unbounded.
 */

export interface RateLimitResult {
  /** false → the caller MUST reject with 429 */
  allowed: boolean;
  /** requests still permitted inside the current window (0 when blocked) */
  remaining: number;
  /** seconds until the current window closes and the counter resets */
  retryAfterSec: number;
  /** total hits recorded in the current window (for X-RateLimit headers) */
  current: number;
}

interface BucketState {
  /** window start, in epoch ms */
  windowStart: number;
  hits: number;
}

const buckets = new Map<string, BucketState>();

/** Sweeper interval — deliberately coarse; eviction is an optimisation. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let sweeperStarted = false;

function startSweeper(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, state] of buckets) {
      // Any bucket whose window closed more than one full window ago is dead.
      if (now - state.windowStart > 2 * 60 * 60 * 1000) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
}

/**
 * Record one hit against `bucketKey` and report whether it is allowed.
 *
 * @param bucketKey namespaced key, e.g. `login:ip:1.2.3.4`
 * @param limit     max hits per window
 * @param windowMs  window length in milliseconds
 */
export function hit(bucketKey: string, limit: number, windowMs: number): RateLimitResult {
  startSweeper();
  const now = Date.now();

  let state = buckets.get(bucketKey);
  if (!state || now - state.windowStart >= windowMs) {
    state = { windowStart: now, hits: 0 };
    buckets.set(bucketKey, state);
  }

  state.hits += 1;

  const windowEnd = state.windowStart + windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((windowEnd - now) / 1000));

  if (state.hits > limit) {
    return { allowed: false, remaining: 0, retryAfterSec, current: state.hits };
  }
  return { allowed: true, remaining: limit - state.hits, retryAfterSec, current: state.hits };
}

/** Test/ops helper — wipe all counters. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Drop a bucket entirely — used for "reset on success" semantics
 * (e.g. the login failure counter for an IP clears after a
 * successful login from that IP).
 */
export function clear(bucketKey: string): void {
  buckets.delete(bucketKey);
}

// ── Phase 6.4 platform limits (single source of truth) ───────────────────────

export const LOGIN_RATE = { limit: 5, windowMs: 15 * 60 * 1000 } as const; // 5 / 15 min / IP
export const CHAT_RATE = { limit: 60, windowMs: 60 * 1000 } as const; // 60 / min / org
export const UPLOAD_RATE = { limit: 10, windowMs: 60 * 1000 } as const; // 10 / min / org
export const REALTIME_SESSION_RATE = { limit: 10, windowMs: 60 * 60 * 1000 } as const; // 10 / hour / org

// ── ElevenLabs voice I/O (V2): parity discipline with the chat path ──────────
export const ELEVENLABS_STT_RATE = { limit: 30, windowMs: 60 * 1000 } as const; // 30 / min / org
export const ELEVENLABS_TTS_RATE = { limit: 60, windowMs: 60 * 1000 } as const; // 60 / min / org
export const ELEVENLABS_PREVIEW_RATE = { limit: 10, windowMs: 60 * 1000 } as const; // 10 / min / org

/** Convenience: uniform 429 JSON body for the platform error contract. */
export function rateLimitResponse(retryAfterSec: number, message = "Too many requests. Please try again shortly."): {
  status: number;
  headers: Record<string, string>;
  body: { error: string; code: string; status: number; retryAfter: number };
} {
  return {
    status: 429,
    headers: { "Retry-After": String(retryAfterSec) },
    body: {
      error: message,
      code: "RATE_LIMITED",
      status: 429,
      retryAfter: retryAfterSec,
    },
  };
}
