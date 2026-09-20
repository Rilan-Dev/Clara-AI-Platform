/**
 * Security regression tests for the Gemini Live relay session tokens
 * (gap-closure Phase D).
 *
 * These lock the exact discipline the other Clara-owned realtime relays
 * already enforce (Sarvam V5 / ElevenLabs Mode C): the browser gets a
 * short-lived, capability-scoped HMAC token; the long-lived GEMINI_API_KEY
 * never mints one and never appears in one.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GEMINI_REALTIME_TOKEN_TTL_MS,
  mintGeminiRealtimeToken,
  verifyGeminiRealtimeToken,
} from "./realtime-auth";

const CLAIMS = { kbId: "kb-1", orgId: "org-1" };

describe("mintGeminiRealtimeToken / verifyGeminiRealtimeToken", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "x".repeat(48);
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });

  it("round-trips the kb/org claims", () => {
    const token = mintGeminiRealtimeToken(CLAIMS);
    expect(verifyGeminiRealtimeToken(token)).toMatchObject(CLAIMS);
  });

  it("carries a bounded expiry (default 60 minutes)", () => {
    const before = Date.now();
    const token = mintGeminiRealtimeToken(CLAIMS);
    const claims = verifyGeminiRealtimeToken(token);
    expect(claims).not.toBeNull();
    expect(claims!.expiresAtMs).toBeGreaterThanOrEqual(before + GEMINI_REALTIME_TOKEN_TTL_MS - 5_000);
    expect(claims!.expiresAtMs).toBeLessThanOrEqual(before + GEMINI_REALTIME_TOKEN_TTL_MS + 5_000);
  });

  it("honours a custom ttl", () => {
    const token = mintGeminiRealtimeToken({ ...CLAIMS, ttlMs: 1_000 });
    const claims = verifyGeminiRealtimeToken(token);
    expect(claims).not.toBeNull();
    expect(claims!.expiresAtMs).toBeLessThanOrEqual(Date.now() + 1_000);
  });

  it("rejects expired tokens", () => {
    const token = mintGeminiRealtimeToken({ ...CLAIMS, ttlMs: -1_000 });
    expect(verifyGeminiRealtimeToken(token)).toBeNull();
  });

  it("rejects tampered payloads (tenant A cannot become tenant B)", () => {
    const token = mintGeminiRealtimeToken(CLAIMS);
    const parts = token.split(".");
    // Rewrite the org claim without re-signing — signature check must fail.
    parts[3] = "org-victim";
    expect(verifyGeminiRealtimeToken(parts.join("."))).toBeNull();
    // Rewrite the kb claim too.
    const kbTampered = token.replace("kb-1", "kb-victim");
    expect(verifyGeminiRealtimeToken(kbTampered)).toBeNull();
  });

  it("rejects malformed tokens of every shape", () => {
    for (const bad of ["", "garbage", "v1", "v1.1.2.3.4.5", "v2.1.kb.org.sig", "v1.notanumber.kb.org.deadbeef"]) {
      expect(verifyGeminiRealtimeToken(bad)).toBeNull();
    }
  });

  it("never embeds the vendor key in the token", () => {
    process.env.GEMINI_API_KEY = "AIza-super-secret-key-value";
    try {
      const token = mintGeminiRealtimeToken(CLAIMS);
      expect(token).not.toContain("AIza");
      expect(token).not.toContain("super-secret");
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("binds tokens to AUTH_SECRET — a different secret fails verification", () => {
    const prev = process.env.AUTH_SECRET;
    try {
      process.env.AUTH_SECRET = "secret-one";
      const token = mintGeminiRealtimeToken(CLAIMS);
      process.env.AUTH_SECRET = "secret-two";
      expect(verifyGeminiRealtimeToken(token)).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = prev;
    }
  });
});
