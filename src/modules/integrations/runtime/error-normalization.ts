export type IntegrationErrorCode =
  | "UNKNOWN_INTEGRATION"
  | "ACTION_NOT_ALLOWED"
  | "NOT_CONNECTED"
  | "INVALID_INPUT"
  | "EGRESS_BLOCKED"
  | "REDIRECT_BLOCKED"
  | "AUTHORIZATION_DENIED"
  | "PLAN_NOT_ENTITLED"
  | "UPSTREAM_ERROR"
  | "EXECUTION_FAILED";

export interface NormalizedIntegrationError {
  code: IntegrationErrorCode;
  message: string;
  retryable: boolean;
}

/**
 * Convert runner failures into a stable host-owned error contract.
 * Provider-specific detail is retained only in the already-redacted message;
 * callers can branch on code without parsing provider strings.
 */
export function normalizeIntegrationError(
  error: unknown,
): NormalizedIntegrationError {
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error === "string"
        ? error
        : "Integration action failed";

  const lower = message.toLowerCase();

  if (lower.includes("not connected")) {
    return { code: "NOT_CONNECTED", message, retryable: false };
  }
  if (lower.includes("not allowed") || lower.includes("not entitled")) {
    return {
      code: lower.includes("entitled") ? "PLAN_NOT_ENTITLED" : "ACTION_NOT_ALLOWED",
      message,
      retryable: false,
    };
  }
  if (lower.includes("invalid action input")) {
    return { code: "INVALID_INPUT", message, retryable: false };
  }
  if (lower.includes("egress destination") || lower.includes("egress protocol") || lower.includes("egress hostname")) {
    return { code: "EGRESS_BLOCKED", message, retryable: false };
  }
  if (lower.includes("egress redirect") || lower.includes("redirects are not allowed")) {
    return { code: "REDIRECT_BLOCKED", message, retryable: false };
  }
  if (lower.includes("authorization") || lower.includes("permission") || lower.includes("forbidden")) {
    return { code: "AUTHORIZATION_DENIED", message, retryable: false };
  }
  if (/(?:^|\s)(?:4\d\d)(?:\s|$)/.test(message) || lower.includes("unauthorized")) {
    return { code: "UPSTREAM_ERROR", message, retryable: false };
  }
  if (/(?:^|\s)(?:5\d\d)(?:\s|$)/.test(message) || lower.includes("timeout") || lower.includes("temporarily unavailable")) {
    return { code: "UPSTREAM_ERROR", message, retryable: true };
  }

  return { code: "EXECUTION_FAILED", message, retryable: false };
}
