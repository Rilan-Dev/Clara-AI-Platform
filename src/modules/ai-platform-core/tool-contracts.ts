/**
 * src/modules/ai-platform-core/tool-contracts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 7-B — Unified Tool Runtime contracts.
 *
 * Host-neutral vocabulary for the reviewed Phase 7-B design
 * (PHASE-7-PLAN.md §8/§9/§21 sub-phase 7-B): tool definitions with zod-backed
 * input schemas, the per-tool authorization policy/hook model (tool allowlist ×
 * surface restrictions × RBAC × plan entitlement × tenant execution context),
 * normalized tool results, typed error normalization, normalized streaming
 * tool-event types, and the usage-metering hook.
 *
 * Provenance rule (D-007 / D-P3): the architectural PATTERN follows the
 * immutable Doable reference library (capabilities/tools/MANIFEST.md and
 * doable-source/services/api/src/ai/tools/ — the Tool/ToolRegistry/ToolResult
 * shapes), read as design reference ONLY — never imported at runtime, never
 * copied verbatim, never modified. Every declaration here is Clara-owned host
 * code built ON TOP of the Phase 7-A seam (`contracts.ts` /
 * `execution-context.ts`), which remains the approved foundation.
 *
 * Phase 7-C boundary (NOT implemented here): provider tool-calling, the
 * agentic loop, bounded iteration logic, and tool-calling provider APIs are
 * unauthorized. The streaming event types below are runtime/event CONTRACTS
 * only — no provider surface consumes them yet.
 *
 * Server-side only. Zero new runtime dependencies (zod is already a project
 * dependency).
 */

import type { z } from "zod";
import type { PlatformExecutionContext, SurfaceKind } from "./contracts";

// ─── Tool identity vocabulary ────────────────────────────────────────────────

/**
 * Tool names follow the incumbent Clara tool-call vocabulary (`rag_search`):
 * lowercase snake_case, 3–64 chars, leading letter. The registry rejects any
 * other shape at registration time (fail-closed, not at action time).
 */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

/** A validated tool name. Only the registry mints these after validation. */
export type ToolName = string;

/**
 * The plan-entitlement capability axis a tool may require. Structurally the
 * same three-value union Clara's ai-governance resolver uses
 * (`AICapability`), redeclared here so the host-neutral 7-B contracts do not
 * import host modules; the Clara binding (`clara-tools.ts`) asserts the
 * compatibility of the two unions at its boundary.
 */
export type ToolPlanCapability = "chat" | "voice_chat" | "realtime_voice";

/**
 * Per-tool authorization policy — the declarative half of the reviewed
 * authorization model:
 *
 *   tool allowlist (registry membership)
 * × surface restrictions (allowedSurfaces, enforced deterministically by the
 *   runtime BEFORE any host adapter runs)
 * × RBAC (requiredPermission, when the tool declares one — checked by the
 *   host authorization adapter against the caller's org membership/roles)
 * × plan entitlement (per-surface capability, or requiredCapability when the
 *   tool pins one — checked by the host authorization adapter)
 * × tenant execution context (mandatory provenance-verified
 *   PlatformExecutionContext; enforced by the runtime).
 */
export interface ToolAuthorizationPolicy {
  /** Surfaces this tool is exposed on. Non-empty; every other surface fails closed. */
  readonly allowedSurfaces: readonly SurfaceKind[];
  /**
   * Org-level RBAC permission the invoking user must hold (host-interpreted).
   * `null`/absent = no org-role requirement (the owning route keeps the RBAC
   * boundary, as with the incumbent rag_search voice paths).
   */
  readonly requiredPermission?: string | null;
  /**
   * Plan entitlement capability required. `null`/absent = derive from the
   * invocation surface (chat → chat, realtime → realtime_voice,
   * embed → voice_chat — mirroring the incumbent voice-core purpose axes).
   */
  readonly requiredCapability?: ToolPlanCapability | null;
  /** Fail closed when the execution context carries no userId. */
  readonly requireUserId?: boolean;
  /** Fail closed when the execution context carries no sessionId. */
  readonly requireSessionId?: boolean;
}

// ─── Typed error normalization ───────────────────────────────────────────────

/**
 * The normalized typed-error vocabulary. Every tool-invocation failure is one
 * of these codes — deterministic, no permissive fallback, no untyped throws
 * crossing the runtime boundary.
 */
export type ToolErrorCode =
  /** The requested tool is not in the registry (the tool allowlist). */
  | "UNKNOWN_TOOL"
  /** The execution context is missing, malformed, or not factory-produced. */
  | "INVALID_CONTEXT"
  /** A required context identity field (user/session) is absent. */
  | "MISSING_CONTEXT_IDENTITY"
  /** The invocation surface is not in the tool's allowedSurfaces. */
  | "UNAUTHORIZED_SURFACE"
  /** The caller's RBAC role/membership does not satisfy requiredPermission. */
  | "UNAUTHORIZED_ROLE"
  /** The caller's plan does not include the required capability. */
  | "PLAN_NOT_ENTITLED"
  /** The authorization adapter detected a tenant-scope violation. */
  | "TENANT_SCOPE_VIOLATION"
  /**
   * The authorization adapter itself failed (infrastructure). Fail closed:
   * an unavailable authorization check is a denial, never a bypass.
   */
  | "AUTHORIZATION_UNAVAILABLE"
  /** The input failed the tool's zod schema validation. */
  | "INVALID_ARGUMENTS"
  /** The tool's execute() threw or returned an invalid execution outcome. */
  | "EXECUTION_FAILED";

/** Normalized typed error payload carried by every tool failure. */
export interface ToolError {
  readonly code: ToolErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

// ─── Result normalization ────────────────────────────────────────────────────

/**
 * Normalized success envelope. `data` is the tool's own domain payload and
 * stays owned by the tool implementation — returned untouched by the runtime
 * (e.g. the incumbent GroundingOutcome is returned exactly as the direct
 * implementation produces it, preserving behavior). The envelope and its
 * error payloads are frozen by the runtime; the domain payload is not.
 */
export interface ToolResult {
  readonly ok: true;
  readonly toolName: ToolName;
  readonly data: unknown;
}

/** Normalized failure envelope — typed error normalization, never a bare throw. */
export interface ToolFailure {
  readonly ok: false;
  readonly toolName: ToolName;
  readonly error: ToolError;
}

/** The normalized invocation outcome: exactly one of result | failure. */
export type ToolInvocationOutcome = ToolResult | ToolFailure;

// ─── Tool definition ─────────────────────────────────────────────────────────

/**
 * The controlled error a tool's execute() THROWS to self-report a typed
 * failure code (e.g. a domain-level PLAN_NOT_ENTITLED). Any other thrown
 * value normalizes to EXECUTION_FAILED; a returned value is ALWAYS the
 * tool's domain payload — there is no `ok`-shaped envelope protocol, so a
 * domain outcome like the incumbent `GroundingOutcome` (`{ ok: true, result,
 * warning }`) can never collide with the runtime's own envelopes.
 */
export class ToolExecutionError extends Error {
  readonly code: ToolErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ToolErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ToolExecutionError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/**
 * A unified tool definition. zod-backed input validation, a declarative
 * authorization policy, and an executor that receives ONLY the mandatory
 * tenant-scoped `PlatformExecutionContext` (the Phase 7-A provenance-hardened
 * boundary) — never ambient global state, never raw secrets.
 */
export interface ToolDefinition {
  readonly name: ToolName;
  readonly description: string;
  /** zod schema validating the invocation input before execute() runs. */
  readonly inputSchema: z.ZodType<unknown>;
  readonly authorization: ToolAuthorizationPolicy;
  /**
   * Executes the tool. Receives the zod-validated input and the frozen
   * tenant-scoped execution context. The RETURN value is always normalized as
   * the success envelope's domain payload (untouched); to self-report a typed
   * failure, throw `ToolExecutionError`; any other throw normalizes to
   * EXECUTION_FAILED.
   */
  execute(input: unknown, context: PlatformExecutionContext): Promise<unknown> | unknown;
}

/** Registry listing/discovery summary (no execute reference exposed). */
export interface ToolSummary {
  readonly name: ToolName;
  readonly description: string;
  readonly allowedSurfaces: readonly SurfaceKind[];
  readonly inputSchema: z.ZodType<unknown>;
}

// ─── Authorization hook (host-bound) ─────────────────────────────────────────

/** What the host authorization adapter is asked about one invocation. */
export interface ToolAuthorizationRequest {
  readonly toolName: ToolName;
  readonly policy: ToolAuthorizationPolicy;
  readonly context: PlatformExecutionContext;
}

/**
 * The authorization decision. `allowed: false` must carry one of the
 * authorization error codes; `TENANT_SCOPE_VIOLATION` is available for
 * host-side tenant-binding checks the host performs beyond the runtime's
 * structural checks.
 */
export type ToolAuthorizationDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code:
        | "UNAUTHORIZED_SURFACE"
        | "UNAUTHORIZED_ROLE"
        | "PLAN_NOT_ENTITLED"
        | "TENANT_SCOPE_VIOLATION";
      readonly message: string;
      readonly details?: Record<string, unknown>;
    };

/**
 * Per-tool authorization hook — host-bound. The runtime enforces the
 * deterministic parts (registry membership, mandatory execution context,
 * surface allowlist, declared identity requirements) and delegates RBAC and
 * plan-entitlement checking to this adapter, which binds Clara's EXISTING
 * infrastructure (`ai-governance` entitlements; `auth` org access context).
 *
 * Fail-closed contract: an adapter that THROWS is treated as
 * AUTHORIZATION_UNAVAILABLE — a denial, never a bypass.
 */
export interface ToolAuthorizationAdapter {
  authorize(request: ToolAuthorizationRequest): Promise<ToolAuthorizationDecision>;
}

// ─── Usage-metering hook (host-bound) ────────────────────────────────────────

/** Per-invocation metering record — correctly scoped to the caller's context. */
export interface ToolMeteringRecord {
  readonly invocationId: string;
  readonly toolName: ToolName;
  readonly tenantId: string;
  readonly kbId: string;
  readonly agentId?: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly surface: SurfaceKind;
  readonly outcome: "ok" | "error";
  readonly errorCode?: ToolErrorCode;
  readonly durationMs: number;
  readonly correlationId?: string;
}

/**
 * Usage-metering hook — the approved 7-B metering interface. The runtime
 * invokes it exactly once per invocation attempt THAT PASSES the provenance
 * assertion (success, typed failure, or boundary refusal) with the
 * caller-scoped record. Boundary carve-out (F-7B-02, corrected): a
 * provenance-invalid context (INVALID_CONTEXT) is rejected BEFORE
 * tenant-scoped metering — for that attempt the hook is NOT invoked and NO
 * metering record is produced, because a tenant-scoped
 * ToolMeteringRecord cannot be safely constructed from an untrusted
 * context (no ambient/default tenant is fabricated and no tenant identity
 * is inferred from the rejected object). Every OTHER refusal boundary
 * (unknown tool, authorization denial, schema validation) and every
 * executed invocation DOES produce exactly one metering record, because
 * those stages run after the context has been provenance-verified. The
 * Clara binding wires this onto the existing metering spine's discipline
 * (append-only, never-break-the-metered-pipeline, org-scoped); metering
 * failures are logged and NEVER break the invocation. No new billing
 * architecture is hard-coded here — hosts bind their own hook.
 */
export interface ToolMeteringHook {
  onInvocation(record: ToolMeteringRecord): void | Promise<void>;
}

// ─── Streaming tool-event contract (runtime/event types ONLY — 7-C is NOT implemented) ──

/**
 * Normalized streaming tool-event types. These are the runtime/event
 * contracts the (unauthorized, future) 7-C provider tool-calling loop and any
 * host transport MAY surface; 7-B defines and emits them only. Events pair
 * strictly around tool EXECUTION: `tool_call_started` fires immediately
 * before execute() runs, and exactly one terminal event
 * (`tool_call_succeeded` | `tool_call_failed`) follows. Pre-execution
 * refusals (unknown tool, invalid context, authorization denial, schema
 * validation) emit NO events — no tool call happened. Apart from the
 * invalid-context refusal (rejected before a trusted tenant-scoped metering
 * record can exist — see the ToolMeteringHook carve-out above), these
 * refusals are captured by the metering record instead.
 *
 * Tenant identifiers deliberately do NOT appear in event payloads: these
 * events are shaped for transport surfaces, and tenant ids must not leak
 * into client-visible streams.
 */
export type ToolStreamingEvent =
  | {
      readonly type: "tool_call_started";
      readonly invocationId: string;
      readonly toolName: ToolName;
      readonly correlationId?: string;
      readonly startedAt: string;
    }
  | {
      readonly type: "tool_call_succeeded";
      readonly invocationId: string;
      readonly toolName: ToolName;
      readonly correlationId?: string;
      readonly durationMs: number;
      readonly finishedAt: string;
    }
  | {
      readonly type: "tool_call_failed";
      readonly invocationId: string;
      readonly toolName: ToolName;
      readonly correlationId?: string;
      readonly durationMs: number;
      readonly finishedAt: string;
      readonly error: ToolError;
    };

/**
 * Event sink — receives normalized streaming tool events. Sink errors are
 * caught and logged; they NEVER break the invocation (the same discipline as
 * the metering spine).
 */
export type ToolEventSink = (event: ToolStreamingEvent) => void;
