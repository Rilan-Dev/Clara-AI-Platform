import { describe, expect, it } from "vitest";
import { redactBody } from "../runner-fetch.js";

describe("integration trace known-secret redaction", () => {
  it("removes known credential values from plain-text bodies", () => {
    const secret = "super-secret-access-token-123";
    const body = `provider echoed ${secret} in an otherwise non-sensitive message`;

    const redacted = redactBody(body, [secret]);

    expect(redacted).not.toContain(secret);
    expect(redacted).toContain("[REDACTED]");
  });

  it("removes known credentials from JSON values even when the field name is non-sensitive", () => {
    const secret = "opaque-provider-value-456";
    const body = JSON.stringify({
      message: `provider echoed ${secret}`,
      status: "ok",
    });

    const redacted = redactBody(body, [secret]);

    expect(redacted).not.toContain(secret);
    expect(redacted).toContain("[REDACTED]");
  });
});
