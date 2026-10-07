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
 * Host-owned error carrying an explicit classification. Runtime boundaries
 * should prefer this over encoding control-flow semantics in provider strings.
 */
export class IntegrationRunnerError extends Error {
  readonly code: IntegrationErrorCode;
  readonly retryable: boolean;

  constructor(code: IntegrationErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "IntegrationRunnerError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function integrationError(
  code: IntegrationErrorCode,
  message: string,
  retryable = false,
): IntegrationRunnerError {
  return new IntegrationRunnerError(code, message, retryable);
}

/**
 * Convert runner failures into a stable host-owned error contract.
 * Explicit host classifications take precedence; legacy/provider errors use
 * conservative compatibility heuristics.
 */
export function normalizeIntegrationError(
  error: unknown,
): NormalizedIntegrationError {
  if (error instanceof IntegrationRunnerError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }

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
