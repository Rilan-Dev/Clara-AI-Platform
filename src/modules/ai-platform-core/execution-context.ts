/**
 * src/modules/ai-platform-core/execution-context.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 7-A — fail-closed ExecutionContext factory.
 *
 * Derives the host-neutral `PlatformExecutionContext` from Clara's existing
 * runtime identity (`ClaraRuntimeContext`-shaped input). Fails closed at
 * construction time on missing tenant identity or a missing knowledge-base
 * binding — never at action time, and never by falling back to an ambient,
 * global, or environment-derived tenant (PHASE-7-PLAN.md §14).
 */

import type {
  ExecutionContextInput,
  PlatformExecutionContext,
  SurfaceKind,
} from "./contracts";

/** Controlled failure raised for any invalid execution-context input or scope check. */
export class ExecutionContextError extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "MISSING_TENANT"
    | "MISSING_KB"
    | "INVALID_FIELD"
    | "UNKNOWN_FIELD"
    | "TENANT_SCOPE_MISMATCH";

  constructor(
    code: ExecutionContextError["code"],
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ExecutionContextError";
    this.code = code;
  }
}

/**
 * Module-private provenance registry of sanctioned platform contexts.
 *
 * CORRECTION A (architect review of `688070a5` — outcome
 * `CORRECTION_REQUIRED`): structural validity + `Object.isFrozen()` alone
 * does NOT establish provenance — a caller can independently construct and
 * freeze a structurally identical lookalike. Membership in this WeakSet is
 * the demonstrable proof that a context was produced by the sanctioned
 * factory `createExecutionContext`.
 *
 * Trust-boundary properties:
 * - module-private and NEVER exported — callers cannot enumerate it, add to
 *   it, or test membership directly;
 * - WeakSet membership is not forgeable by object shape, freezing, symbols,
 *   or metadata fields — only the factory itself can add members;
 * - weak references — contexts that are no longer referenced remain
 *   garbage-collectable (no unbounded retention);
 * - no mutable marker property is written onto the context: provenance is
 *   carried by identity (the object itself), not by inspectable state.
 */
const SANCTIONED_PLATFORM_CONTEXTS: WeakSet<object> = new WeakSet();

const SURFACE_KINDS: readonly SurfaceKind[] = ["chat", "realtime", "embed"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates and normalizes an optional identifier: null → undefined, blank → controlled failure. */
function normalizeOptionalId(
  field: "agentId" | "userId" | "sessionId" | "correlationId",
  raw: unknown,
): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "string") {
    throw new ExecutionContextError("INVALID_FIELD", `Execution-context field "${field}" must be a string.`, { field, received: typeof raw });
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ExecutionContextError("INVALID_FIELD", `Execution-context field "${field}" must not be blank.`, { field });
  }
  return trimmed;
}

/** Validates and normalizes the surface field. `undefined` = absent (default "chat"); explicit `null` is malformed and fails closed. */
function normalizeSurface(raw: unknown): SurfaceKind {
  if (raw === undefined) return "chat";
  if (typeof raw === "string" && SURFACE_KINDS.includes(raw as SurfaceKind)) {
    return raw as SurfaceKind;
  }
  throw new ExecutionContextError(
    "INVALID_FIELD",
    `Execution-context field "surface" must be one of: ${SURFACE_KINDS.join(", ")}.`,
    { field: "surface", received: String(raw) },
  );
}

/** Validates and normalizes a REQUIRED identifier (tenant / KB). */
function normalizeRequiredId(
  field: "orgId" | "kbId",
  raw: unknown,
): string {
  if (typeof raw !== "string") {
    throw new ExecutionContextError(
      field === "orgId" ? "MISSING_TENANT" : "MISSING_KB",
      field === "orgId"
        ? "Execution context requires tenant identity (orgId). Refusing to continue without an explicit tenant — there is no ambient fallback."
        : "Execution context requires a knowledge-base binding (kbId). Clara's retrieval surface is KB-bound; refusing to continue without one.",
      { field, received: raw === null ? "null" : typeof raw },
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ExecutionContextError(
      field === "orgId" ? "MISSING_TENANT" : "MISSING_KB",
      field === "orgId"
        ? "Execution context requires a non-blank tenant identity (orgId)."
        : "Execution context requires a non-blank knowledge-base binding (kbId).",
      { field },
    );
  }
  return trimmed;
}

/**
 * Builds the frozen, host-neutral execution context. Fail-closed:
 * - `orgId` (→ tenantId) and `kbId` are mandatory and non-blank;
 * - optional identity fields must be non-blank strings when present;
 * - `surface` must be a known surface kind (defaults to "chat");
 * - unknown top-level keys are rejected (typo guard: a misspelled identity
 *   field must never silently produce a tenant-less or wrong-scoped context);
 * - the returned context (and its metadata copy) is frozen AND registered in
 *   the module-private provenance WeakSet — the ONLY sanctioned production
 *   path for a valid `PlatformExecutionContext`.
 */
export function createExecutionContext(input: ExecutionContextInput): PlatformExecutionContext {
  if (!isPlainObject(input)) {
    throw new ExecutionContextError("INVALID_INPUT", "Execution-context input must be a plain object carrying Clara runtime identity.");
  }

  const knownKeys = new Set<string>([
    "orgId",
    "kbId",
    "agentId",
    "userId",
    "sessionId",
    "surface",
    "correlationId",
    "metadata",
  ]);
  const unknownKeys = Object.keys(input).filter((key) => !knownKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new ExecutionContextError(
      "UNKNOWN_FIELD",
      `Execution-context input contains unknown field(s): ${unknownKeys.join(", ")}. Identity fields must match the documented vocabulary so tenant scope can never be silently mistyped.`,
      { unknownFields: unknownKeys },
    );
  }

  const tenantId = normalizeRequiredId("orgId", input.orgId);
  const kbId = normalizeRequiredId("kbId", input.kbId);
  const surface = normalizeSurface(input.surface);

  let metadata: Readonly<Record<string, unknown>> | undefined;
  if (input.metadata !== undefined && input.metadata !== null) {
    if (!isPlainObject(input.metadata)) {
      throw new ExecutionContextError("INVALID_FIELD", `Execution-context field "metadata" must be a plain object.`, { field: "metadata" });
    }
    metadata = Object.freeze({ ...input.metadata });
  }

  const context: PlatformExecutionContext = {
    tenantId,
    kbId,
    userId: normalizeOptionalId("userId", input.userId),
    agentId: normalizeOptionalId("agentId", input.agentId),
    sessionId: normalizeOptionalId("sessionId", input.sessionId),
    correlationId: normalizeOptionalId("correlationId", input.correlationId),
    surface,
    ...(metadata !== undefined ? { metadata } : {}),
  };
  const frozen = Object.freeze(context);
  // Provenance: only here — after full validation and freezing — does the
  // context become a member of the sanctioned set. Frozen first so the
  // registry can never hold a mutable context.
  SANCTIONED_PLATFORM_CONTEXTS.add(frozen);
  return frozen;
}

/**
 * Provenance + structural check used by adapter boundaries to fail closed on
 * malformed or forged contexts. Accepts ONLY contexts demonstrably produced
 * by the sanctioned factory `createExecutionContext`:
 *
 * - the value must be a member of the module-private provenance WeakSet
 *   (CORRECTION A — a merely frozen structural lookalike constructed outside
 *   the factory is NOT a member and is rejected, so no caller can mint a
 *   trusted tenant context by hand);
 * - it must still be frozen (defense in depth);
 * - it must still carry a non-blank tenant/KB and a known surface (the
 *   existing tenant/kb/surface validation is preserved).
 *
 * The provenance mechanism is not exposed publicly, carries no mutable
 * marker property, and does not depend on externally visible state.
 */
export function isValidPlatformExecutionContext(value: unknown): value is PlatformExecutionContext {
  if (!isPlainObject(value)) return false;
  if (!Object.isFrozen(value)) return false;
  if (!SANCTIONED_PLATFORM_CONTEXTS.has(value)) return false;
  return (
    typeof value.tenantId === "string" &&
    value.tenantId.trim().length > 0 &&
    typeof value.kbId === "string" &&
    value.kbId.trim().length > 0 &&
    SURFACE_KINDS.includes(value.surface as SurfaceKind)
  );
}

/** Controlled assertion used by adapter boundaries; throws `ExecutionContextError` on malformed input. */
export function assertExecutionContext(value: unknown): PlatformExecutionContext {
  if (!isValidPlatformExecutionContext(value)) {
    throw new ExecutionContextError("INVALID_INPUT", "A valid tenant-scoped PlatformExecutionContext is required for platform-seam operations.");
  }
  return value;
}

/**
 * Tenant-scope guard: proves the context belongs to the expected tenant.
 * Cross-tenant access fails closed (a tenant-A context can never authorize
 * tenant-B scope).
 */
export function assertTenantScope(
  context: unknown,
  expectedTenantId: string,
): PlatformExecutionContext {
  const validated = assertExecutionContext(context);
  if (typeof expectedTenantId !== "string" || !expectedTenantId.trim()) {
    throw new ExecutionContextError("INVALID_INPUT", "assertTenantScope requires a non-blank expected tenant id.");
  }
  if (validated.tenantId !== expectedTenantId.trim()) {
    throw new ExecutionContextError(
      "TENANT_SCOPE_MISMATCH",
      "Execution-context tenant does not match the expected tenant scope.",
      { contextTenantId: validated.tenantId },
    );
  }
  return validated;
}
