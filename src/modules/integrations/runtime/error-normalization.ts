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

  if (lower.includes("unknown integration")) {
    return { code: "UNKNOWN_INTEGRATION", message, retryable: false };
  }
  if (lower.includes("not connected")) {
    return { code: "NOT_CONNECTED", message, retryable: false };
  }
  // Policy-specific messages must be classified before the generic
  // "not allowed" matcher because egress/redirect failures intentionally
  // use that wording.
  if (lower.includes("egress redirect") || lower.includes("redirects are not allowed")) {
    return { code: "REDIRECT_BLOCKED", message, retryable: false };
  }
  if (lower.includes("egress destination") || lower.includes("egress protocol") || lower.includes("egress hostname")) {
    return { code: "EGRESS_BLOCKED", message, retryable: false };
  }
  if (lower.includes("invalid action input")) {
    return { code: "INVALID_INPUT", message, retryable: false };
  }
  if (lower.includes("not entitled")) {
    return { code: "PLAN_NOT_ENTITLED", message, retryable: false };
  }
  if (lower.includes("not allowed")) {
    return { code: "ACTION_NOT_ALLOWED", message, retryable: false };
  }
  if (lower.includes("action '") && lower.includes(" not found")) {
    return { code: "ACTION_NOT_ALLOWED", message, retryable: false };
  }
  if (lower.includes("authorization") || lower.includes("permission") || lower.includes("forbidden")) {
    return { code: "AUTHORIZATION_DENIED", message, retryable: false };
  }
  if (/(?:^|\s)(?:408|429)(?:\s|$)/.test(message) || lower.includes("rate limit") || lower.includes("too many requests")) {
    return { code: "UPSTREAM_ERROR", message, retryable: true };
  }
  if (/(?:^|\s)4\d\d(?:\s|$)/.test(message) || lower.includes("unauthorized")) {
    return { code: "UPSTREAM_ERROR", message, retryable: false };
  }
  if (/(?:^|\s)5\d\d(?:\s|$)/.test(message) || lower.includes("timeout") || lower.includes("temporarily unavailable")) {
    return { code: "UPSTREAM_ERROR", message, retryable: true };
  }

  return { code: "EXECUTION_FAILED", message, retryable: false };
}
