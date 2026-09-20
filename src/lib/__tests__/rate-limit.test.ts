import { afterEach, describe, expect, it } from "vitest";
import {
  hit,
  clear,
  resetRateLimits,
  LOGIN_RATE,
  CHAT_RATE,
  UPLOAD_RATE,
  REALTIME_SESSION_RATE,
  rateLimitResponse,
} from "@/lib/rate-limit";

afterEach(() => {
  resetRateLimits();
});

describe("rate-limit fixed window", () => {
  it("allows requests up to the limit and blocks the next one", () => {
    const key = "test:bucket";
    for (let i = 1; i <= 5; i++) {
      const r = hit(key, 5, 60_000);
      expect(r.allowed).toBe(true);
      expect(r.current).toBe(i);
      expect(r.remaining).toBe(5 - i);
    }
    const blocked = hit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("keeps counting beyond the limit (for telemetry) without un-blocking", () => {
    const key = "test:overflow";
    for (let i = 0; i < 12; i++) hit(key, 5, 60_000);
    const r = hit(key, 5, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.current).toBe(13);
  });

  it("isolates different bucket keys", () => {
    for (let i = 0; i < 5; i++) hit("a", 5, 60_000);
    expect(hit("a", 5, 60_000).allowed).toBe(false);
    expect(hit("b", 5, 60_000).allowed).toBe(true);
  });

  it("resets when the window elapses (fake time via short window)", async () => {
    const key = "test:expiry";
    for (let i = 0; i < 5; i++) hit(key, 5, 30); // 30ms window
    expect(hit(key, 5, 30).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    const fresh = hit(key, 5, 30);
    expect(fresh.allowed).toBe(true);
    expect(fresh.current).toBe(1);
  });

  it("clear() drops a bucket entirely (reset-on-success semantics)", () => {
    for (let i = 0; i < 5; i++) hit("login:fail:ip:1.2.3.4", 5, LOGIN_RATE.windowMs);
    expect(hit("login:fail:ip:1.2.3.4", 5, LOGIN_RATE.windowMs).allowed).toBe(false);
    clear("login:fail:ip:1.2.3.4");
    expect(hit("login:fail:ip:1.2.3.4", 5, LOGIN_RATE.windowMs).allowed).toBe(true);
  });
});

describe("Phase 6.4 platform limit constants", () => {
  it("matches the implementation plan table", () => {
    expect(LOGIN_RATE.limit).toBe(5);           // 5 req / 15 min / IP
    expect(LOGIN_RATE.windowMs).toBe(15 * 60_000);
    expect(CHAT_RATE.limit).toBe(60);           // 60 req / min / org
    expect(CHAT_RATE.windowMs).toBe(60_000);
    expect(UPLOAD_RATE.limit).toBe(10);         // 10 req / min / org
    expect(UPLOAD_RATE.windowMs).toBe(60_000);
    expect(REALTIME_SESSION_RATE.limit).toBe(10); // 10 req / hour / org
    expect(REALTIME_SESSION_RATE.windowMs).toBe(60 * 60_000);
  });
});

describe("rateLimitResponse contract", () => {
  it("returns the Phase 6.3 JSON error shape with Retry-After", () => {
    const rl = rateLimitResponse(120, "Too many requests.");
    expect(rl.status).toBe(429);
    expect(rl.headers["Retry-After"]).toBe("120");
    expect(rl.body).toEqual({
      error: "Too many requests.",
      code: "RATE_LIMITED",
      status: 429,
      retryAfter: 120,
    });
  });
});
