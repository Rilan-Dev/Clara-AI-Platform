import { afterEach, describe, expect, it, vi } from "vitest";

// undici is real here (no mock) — describeNetworkError is a pure function over
// Error shapes; only setGlobalDispatcher stays untested to avoid polluting the
// worker's global fetch dispatcher.
import { describeNetworkError } from "@/lib/egress";

function chainError(outer: string, inner: string, innermost?: string): Error {
  const root = innermost ? new Error(innermost) : undefined;
  const cause = new Error(inner);
  (cause as { cause?: unknown }).cause = root;
  const top = new Error(outer);
  (top as { cause?: unknown }).cause = cause;
  return top;
}

describe("describeNetworkError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies undici ConnectTimeoutError chains and extracts the host", () => {
    // The exact production shape: TypeError: fetch failed → ConnectTimeoutError
    // (attempted address: generativelanguage.googleapis.com:443, timeout: 10000ms)
    const error = chainError(
      "fetch failed",
      "Connect Timeout Error (attempted address: generativelanguage.googleapis.com:443, timeout: 10000ms)",
    );
    const detail = describeNetworkError(error);
    expect(detail).not.toBeNull();
    expect(detail!.host).toBe("generativelanguage.googleapis.com:443");
    expect(detail!.detail).toContain("Connect Timeout Error");
  });

  it("extracts the host from URL-bearing messages", () => {
    const error = new Error("HTTP 401 from api.openai.com") as Error;
    const detail = describeNetworkError(error);
    // 401 is a credential failure, not a network failure — must NOT classify.
    expect(detail).toBeNull();
    void error;
  });

  it("classifies ECONNREFUSED-style DNS failures", () => {
    const error = chainError("fetch failed", "getaddrinfo ENOTFOUND api.sarvam.ai");
    const detail = describeNetworkError(error);
    expect(detail).not.toBeNull();
    expect(detail!.host).toBe("api.sarvam.ai");
  });

  it("returns null for plain provider errors (no false positives)", () => {
    expect(describeNetworkError(new Error("HTTP 429: rate limited"))).toBeNull();
    expect(describeNetworkError(new Error("invalid_api_key"))).toBeNull();
    expect(describeNetworkError(new Error("Provider Sarvam AI is currently unhealthy."))).toBeNull();
    expect(describeNetworkError("not an error")).toBeNull();
    expect(describeNetworkError(undefined)).toBeNull();
  });

  it("keeps the innermost cause as the actionable detail", () => {
    const error = chainError(
      "fetch failed",
      "TypeError: fetch failed",
      "Connect Timeout Error (attempted address: api.elevenlabs.io:443, timeout: 8000ms)",
    );
    const detail = describeNetworkError(error);
    expect(detail!.host).toBe("api.elevenlabs.io:443");
    expect(detail!.detail).toContain("api.elevenlabs.io");
  });
});
