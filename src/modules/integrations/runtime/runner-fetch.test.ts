import { describe, expect, it, vi } from "vitest";
import { assertSafeEgressUrl, createTracedFetch, redactBody, redactHeaders, redactText, redactUrl, redactValue } from "@/modules/integrations/runtime/runner-fetch";
import { IntegrationRunnerError } from "@/modules/integrations/runtime/error-normalization";

describe("integration runtime trace redaction", () => {
  it("redacts credential-bearing JSON fields recursively", () => {
    const value = redactBody(JSON.stringify({
      apiKey: "secret-api-key",
      nested: { access_token: "secret-access-token", name: "safe" },
      password: "secret-password",
      message: "safe",
    }));
    expect(value).not.toContain("secret-api-key");
    expect(value).not.toContain("secret-access-token");
    expect(value).not.toContain("secret-password");
    expect(value).toContain('"name":"safe"');
    expect(value).toContain('"message":"safe"');
  });

  it("redacts sensitive query parameters", () => {
    const value = redactUrl("https://example.test/run?api_key=secret&safe=value&access_token=token");
    expect(value).not.toContain("secret");
    expect(value).not.toContain("token");
    expect(value).toContain("safe=value");
    expect(value).toContain("api_key=%5BREDACTED%5D");
  });

  it("redacts credential-bearing headers, including non-standard secret names", () => {
    const value = redactHeaders({
      Authorization: "Bearer secret",
      "X-Api-Key": "secret-api-key",
      "X-Client-Secret": "secret-client",
      "X-Session-Token": "secret-session",
      "Content-Type": "application/json",
    });
    expect(value).toEqual({
      Authorization: "[REDACTED]",
      "X-Api-Key": "[REDACTED]",
      "X-Client-Secret": "[REDACTED]",
      "X-Session-Token": "[REDACTED]",
      "Content-Type": "application/json",
    });
  });

  it("redacts bearer tokens and sensitive query parameters in errors", () => {
    const value = redactText("Bearer super-secret-token https://example.test/run?token=another-secret");
    expect(value).toBe("Bearer [REDACTED] https://example.test/run?token=[REDACTED]");
  });

  it("redacts sensitive JSON fields even when they occur beyond the trace truncation boundary", () => {
    const prefix = "x".repeat(3000);
    const value = redactBody(JSON.stringify({
      prefix,
      credentials: {
        access_token: "late-secret-access-token",
        client_secret: "late-client-secret",
      },
    }));
    expect(value).not.toContain("late-secret-access-token");
    expect(value).not.toContain("late-client-secret");
    expect(value).toContain("[REDACTED]");
    expect(value).toContain("chars truncated");
  });

  it("does not expose arbitrary non-JSON bodies merely because they are large", () => {
    const value = redactBody("ordinary payload");
    expect(value).toBe("ordinary payload");
  });
  it("redacts credential fields and known credential values from returned action data", () => {
    const value = redactValue({
      access_token: "oauth-access-token",
      nested: { apiKey: "api-secret-value", label: "safe" },
      message: "the api-secret-value must not escape",
    }, ["api-secret-value"]);
    expect(value).toEqual({
      access_token: "[REDACTED]",
      nested: { apiKey: "[REDACTED]", label: "safe" },
      message: "the [REDACTED] must not escape",
    });
  });


  it("blocks private, loopback, metadata-style and multicast IP destinations", async () => {
    await expect(assertSafeEgressUrl("http://127.0.0.1:8080/internal")).rejects.toThrow("not allowed");
    await expect(assertSafeEgressUrl("http://10.0.0.5/internal")).rejects.toThrow("not allowed");
    await expect(assertSafeEgressUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow("not allowed");
    await expect(assertSafeEgressUrl("http://[::1]:8080/internal")).rejects.toThrow("not allowed");
    await expect(assertSafeEgressUrl("http://[::ffff:127.0.0.1]:8080/internal")).rejects.toThrow("not allowed");
    await expect(assertSafeEgressUrl("http://[::ffff:7f00:1]:8080/internal")).rejects.toThrow("not allowed");
    await expect(assertSafeEgressUrl("http://224.0.0.1/multicast")).rejects.toThrow("not allowed");
  });

  it("does not bypass egress policy for internal-looking URL paths", async () => {
    const tracedFetch = createTracedFetch([], "project");
    await expect(
      tracedFetch("http://127.0.0.1:8787/internal/broadcast"),
    ).rejects.toThrow("not allowed");
  });

  it("returns a typed egress classification and redacted trace when DNS resolves privately", async () => {
    const dnsLookup = vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]);
    const traces: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async () => new Response("should-not-run"));
    const tracedFetch = createTracedFetch(traces as never, "project", null, fetchImpl);

    const dns = await import("node:dns");
    const lookupSpy = vi.spyOn(dns.promises, "lookup").mockImplementation(dnsLookup as never);

    try {
      await expect(tracedFetch("https://attacker-controlled.example/run?token=secret-token")).rejects.toMatchObject({
        code: "EGRESS_BLOCKED",
        retryable: false,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        statusCode: null,
        error: "Integration egress destination is not allowed",
      });
      expect(traces[0].url).not.toContain("secret-token");
    } finally {
      lookupSpy.mockRestore();
    }
  });

  it("uses the typed redirect classification for public redirects too", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://example.com/final" },
    }));
    const traces: Array<Record<string, unknown>> = [];
    const tracedFetch = createTracedFetch(traces as never, "project", null, fetchImpl);

    const error = await tracedFetch("https://example.com/start").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(IntegrationRunnerError);
    expect(error).toMatchObject({
      code: "REDIRECT_BLOCKED",
      retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects non-HTTP protocols and URL userinfo", async () => {
    await expect(assertSafeEgressUrl("file:///etc/passwd")).rejects.toThrow("protocol is not allowed");
    await expect(assertSafeEgressUrl("https://user:password@example.com")).rejects.toThrow("cannot contain credentials");
  });

  it("fails closed on HTTP redirects instead of following an unchecked Location", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1:8787/internal" },
    }));
    const traces: Array<Record<string, unknown>> = [];
    const tracedFetch = createTracedFetch(traces as never, "project", null, fetchImpl);

    await expect(tracedFetch("https://example.com/start")).rejects.toThrow("redirect is not allowed");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.com/start",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("rejects even public HTTP redirects at the generic integration boundary", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://example.com/final" },
    }));
    const tracedFetch = createTracedFetch([], "project", null, fetchImpl);

    await expect(tracedFetch("https://example.com/start")).rejects.toThrow("redirects are not allowed");
  });

  it("scrubs known secret values from arbitrary fetch errors in traces", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("provider failed with secret-value-123");
    });
    const traces: Array<Record<string, unknown>> = [];
    const tracedFetch = createTracedFetch(
      traces as never,
      "project",
      null,
      fetchImpl,
      ["secret-value-123"],
    );

    await expect(tracedFetch("https://example.com/fail")).rejects.toThrow("secret-value-123");
    expect(traces[0]).toMatchObject({
      error: "provider failed with [REDACTED]",
    });
    expect(JSON.stringify(traces)).not.toContain("secret-value-123");
  });

  it("allows a public IP destination", async () => {
    await expect(assertSafeEgressUrl("https://1.1.1.1/health")).resolves.toBeUndefined();
  });
});
