import { describe, expect, it } from "vitest";
import { normalizeIntegrationError } from "./error-normalization.js";

describe("normalizeIntegrationError", () => {
  it("classifies connection and input failures deterministically", () => {
    expect(normalizeIntegrationError(new Error("Not connected")).code).toBe("NOT_CONNECTED");
    expect(normalizeIntegrationError(new Error("Invalid action input: email is required")).code).toBe("INVALID_INPUT");
  });

  it("classifies network policy failures separately from redirects", () => {
    expect(normalizeIntegrationError(new Error("Integration egress destination is not allowed")).code).toBe("EGRESS_BLOCKED");
    expect(normalizeIntegrationError(new Error("Integration egress redirects are not allowed")).code).toBe("REDIRECT_BLOCKED");
    expect(normalizeIntegrationError(new Error("Action is not allowed for this integration")).code).toBe("ACTION_NOT_ALLOWED");
  });

  it("marks transient upstream failures retryable", () => {
    const result = normalizeIntegrationError(new Error("Provider returned 503"));
    expect(result.code).toBe("UPSTREAM_ERROR");
    expect(result.retryable).toBe(true);
  });

  it("keeps unknown failures non-retryable", () => {
    const result = normalizeIntegrationError(new Error("piece failed"));
    expect(result.code).toBe("EXECUTION_FAILED");
    expect(result.retryable).toBe(false);
  });
});
