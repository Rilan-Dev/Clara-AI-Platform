import { describe, expect, it } from "vitest";
import { redactBody, redactText, redactUrl } from "@/modules/integrations/runtime/runner-fetch";

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

  it("redacts bearer tokens and sensitive query parameters in errors", () => {
    const value = redactText("Bearer super-secret-token https://example.test/run?token=another-secret");
    expect(value).toBe("Bearer [REDACTED] https://example.test/run?token=[REDACTED]");
  });

  it("does not expose arbitrary non-JSON bodies merely because they are large", () => {
    const value = redactBody("ordinary payload");
    expect(value).toBe("ordinary payload");
  });
});
