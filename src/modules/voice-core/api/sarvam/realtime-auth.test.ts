import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SARVAM_REALTIME_TOKEN_TTL_MS,
  isSarvamRelayRequest,
  mintSarvamRealtimeToken,
  sarvamRelayHeaderValue,
  verifySarvamRealtimeToken,
} from "./realtime-auth";

describe("Sarvam realtime relay auth", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "x".repeat(48);
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });

  it("round-trips a minted token", () => {
    const token = mintSarvamRealtimeToken({ kbId: "kb-1", orgId: "org-2" });
    const claims = verifySarvamRealtimeToken(token);
    expect(claims).toMatchObject({ kbId: "kb-1", orgId: "org-2" });
    expect(claims!.expiresAtMs).toBeGreaterThan(Date.now() + SARVAM_REALTIME_TOKEN_TTL_MS - 60_000);
  });

  it("rejects tampered payloads (signature covers kbId/orgId/exp)", () => {
    const token = mintSarvamRealtimeToken({ kbId: "kb-1", orgId: "org-2" });
    const parts = token.split(".");
    parts[2] = "kb-other"; // swap the kbId
    expect(verifySarvamRealtimeToken(parts.join("."))).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = mintSarvamRealtimeToken({ kbId: "kb-1", orgId: "org-2", ttlMs: -1000 });
    expect(verifySarvamRealtimeToken(token)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySarvamRealtimeToken("")).toBeNull();
    expect(verifySarvamRealtimeToken("v2.1.2.3.4")).toBeNull();
    expect(verifySarvamRealtimeToken("garbage")).toBeNull();
  });

  it("relay header verification accepts the correct value and rejects others", () => {
    expect(isSarvamRelayRequest(sarvamRelayHeaderValue())).toBe(true);
    expect(isSarvamRelayRequest("deadbeef")).toBe(false);
    expect(isSarvamRelayRequest(null)).toBe(false);
  });

  it("header is bound to AUTH_SECRET (different secret → different value)", () => {
    const value1 = sarvamRelayHeaderValue();
    process.env.AUTH_SECRET = "y".repeat(48);
    const value2 = sarvamRelayHeaderValue();
    expect(value1).not.toBe(value2);
    // A header minted under secret 1 fails verification under secret 2.
    expect(isSarvamRelayRequest(value1)).toBe(false);
  });
});
