import { NextResponse } from "next/server";

/**
 * Phase 1 API conventions (plan §6.2): one error contract for all routes.
 * - Quota refusals   → 402 with machine-readable code + upgrade payload
 * - Feature refusals → 403 with upgrade payload
 * - Validation       → 422 with field-annotated payload
 * - Unexpected       → 500 with correlationId matching the server log line
 */
export type UpgradeCTA = {
  plan: string;
  planName: string;
  reason: string;
  ctaUrl: string;
};

export class ApiError extends Error {
  status: number;
  code: string;
  upgrade?: UpgradeCTA;
  fields?: Record<string, string>;
  correlationId: string;

  constructor(
    status: number,
    code: string,
    message: string,
    opts?: { upgrade?: UpgradeCTA; fields?: Record<string, string> }
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.upgrade = opts?.upgrade;
    this.fields = opts?.fields;
    this.correlationId = newCorrelationId();
  }
}

export function newCorrelationId(): string {
  return `corr_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.upgrade ? { upgrade: err.upgrade } : {}),
          ...(err.fields ? { fields: err.fields } : {}),
          correlationId: err.correlationId,
        },
      },
      { status: err.status }
    );
  }
  const correlationId = newCorrelationId();
  console.error(
    JSON.stringify({
      level: "error",
      correlationId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  );
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong on our side.",
        correlationId,
      },
    },
    { status: 500 }
  );
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}
