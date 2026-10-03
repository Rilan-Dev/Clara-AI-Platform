/**
 * src/modules/ai-platform-core/tool-registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 7-B — the Unified Tool Runtime.
 *
 * Implements the reviewed 7-B design (PHASE-7-PLAN.md §8/§9/§21 sub-phase
 * 7-B; the architectural pattern of the immutable Doable reference
 * `services/api/src/ai/tools/index.ts` — register/get/execute — hardened to
 * Clara's 7-A fail-closed seam discipline; read as design reference only,
 * never imported):
 *
 * - registration is EXPLICIT and validated up front (fail at registration,
 *   not at action time): name/description/zod-schema/authorization-policy/
 *   executor are all checked before the tool becomes invocable;
 * - duplicate registration is rejected deterministically and never
 *   overwrites a live tool; failed/duplicate registrations leave the
 *   registry untouched (validate-then-commit atomicity);
 * - the committed definition set is frozen (definition wrapper + policy +
 *   allowedSurfaces array frozen in place, following the CORRECTION B
 *   pattern; zod schema instances are intentionally NOT frozen — they lazily
 *   write internal caches, and freezing them breaks safeParse — proven by
 *   the post-registration invocation tests);
 * - lookup/discovery is deterministic with NO implicit fallback; unknown
 *   tools fail closed;
 * - invocation requires a mandatory, provenance-verified
 *   PlatformExecutionContext (the Phase 7-A WeakSet boundary — forged frozen
 *   lookalikes are rejected);
 * - the invocation lifecycle is:
 *     context assertion → allowlist lookup → authorization (deterministic
 *     surface/identity checks + the host authorization adapter) → zod input
 *     validation → execute() → result/error normalization → metering hook →
 *     streaming tool events;
 *     a provenance-invalid context terminates the invocation at the FIRST
 *     arrow (INVALID_CONTEXT) BEFORE tenant-scoped metering — no metering
 *     record is constructed from untrusted data and the metering hook is
 *     not invoked for that attempt (F-7B-02, corrected; regression-proven);
 * - every failure is a normalized typed error (ToolFailure); the runtime
 *   never throws out of invoke() for tool-level failures and never falls
 *     back permissively;
 * - metering-hook and event-sink failures are logged and never break the
 *   invocation (the existing spine's discipline).
 *
 * 7-C boundary: no provider tool-calling, no agentic loop, no iteration
 * budgets — the streaming events are contract-only.
 *
 * Server-side only. Zero new runtime dependencies.
 */

import type { PlatformExecutionContext, SurfaceKind } from "./contracts";
import { assertExecutionContext } from "./execution-context";
import type {
  ToolAuthorizationAdapter,
  ToolAuthorizationDecision,
  ToolAuthorizationPolicy,
  ToolDefinition,
  ToolError,
  ToolEventSink,
  ToolFailure,
  ToolInvocationOutcome,
  ToolMeteringHook,
  ToolMeteringRecord,
  ToolResult,
  ToolStreamingEvent,
  ToolSummary,
} from "./tool-contracts";
import { TOOL_NAME_PATTERN, ToolExecutionError } from "./tool-contracts";

// ─── Controlled failures ─────────────────────────────────────────────────────

/** Registration failed validation or duplicated a live tool. */
export class ToolRegistrationError extends Error {
  readonly code: "DEFINITION_INVALID" | "ALREADY_REGISTERED";
  readonly problems: readonly string[];

  constructor(
    code: ToolRegistrationError["code"],
    message: string,
    problems: readonly string[] = [],
  ) {
    super(message);
    this.name = "ToolRegistrationError";
    this.code = code;
    this.problems = Object.freeze([...problems]);
  }
}

/** Lookup of a tool name the registry does not know. Controlled failure — no fallback. */
export class UnknownToolError extends Error {
  readonly toolName: string;
  readonly knownTools: readonly string[];

  constructor(toolName: string, knownTools: readonly string[]) {
    super(
      `Unknown tool: "${toolName}". Registered tools: ${
        knownTools.length > 0 ? knownTools.join(", ") : "(none)"
      }. Tool invocation fails closed — there is no implicit fallback.`,
    );
    this.name = "UnknownToolError";
    this.toolName = toolName;
    this.knownTools = Object.freeze([...knownTools]);
  }
}

// ─── Construction options ────────────────────────────────────────────────────

/**
 * Runtime construction options. `authorizationAdapter` is REQUIRED: without a
 * host authorization binding, RBAC and plan-entitlement checks could silently
 * not run — a permissive fallback the 7-B contract forbids. The metering hook
 * and event sink are optional (no metering/no events is a telemetry choice,
 * not a security posture).
 */
export interface ToolRuntimeOptions {
  readonly authorizationAdapter: ToolAuthorizationAdapter;
  readonly meteringHook?: ToolMeteringHook;
  readonly eventSink?: ToolEventSink;
}

/** Per-invocation options. */
export interface ToolInvokeOptions {
  /** Additional per-invocation event sink (runtime sink, if any, also receives the events). */
  readonly eventSink?: ToolEventSink;
}

// ─── Internals ───────────────────────────────────────────────────────────────

const VALID_SURFACES: readonly SurfaceKind[] = ["chat", "realtime", "embed"];
const VALID_CAPABILITIES = ["chat", "voice_chat", "realtime_voice"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Freezes the committed tool's plain-object parts in place: the definition
 * wrapper, its authorization policy, and the allowedSurfaces array (a fresh
 * frozen copy — the caller's original policy array is left alone; only the
 * committed copy is authoritative). The zod schema and the execute function
 * are intentionally NOT frozen:
 * - zod instances lazily write internal caches during safeParse; freezing
 *   them breaks subsequent parsing (covered by the post-registration
 *   invocation regression tests);
 * - freezing functions is unnecessary for this boundary (7-A precedent).
 */
function freezeCommittedDefinition(def: ToolDefinition): ToolDefinition {
  const policy: ToolAuthorizationPolicy = Object.freeze({
    ...def.authorization,
    allowedSurfaces: Object.freeze([...def.authorization.allowedSurfaces]),
  });
  return Object.freeze({
    ...def,
    authorization: policy,
  });
}

/**
 * Up-front structural validation of a tool definition. Every problem is
 * collected; any non-empty problem list rejects the registration BEFORE the
 * registry is modified.
 */
function validateToolDefinition(def: unknown): asserts def is ToolDefinition {
  const problems: string[] = [];

  if (!isPlainObject(def)) {
    throw new ToolRegistrationError(
      "DEFINITION_INVALID",
      "Tool registration requires a complete tool definition object.",
      ["definition must be a plain object"],
    );
  }

  const name = def.name;
  if (typeof name !== "string" || !TOOL_NAME_PATTERN.test(name)) {
    problems.push(`name must match ${TOOL_NAME_PATTERN} (lowercase snake_case, 3-64 chars)`);
  }

  const description = def.description;
  if (typeof description !== "string" || !description.trim() || description.length > 1000) {
    problems.push("description must be a non-blank string of at most 1000 characters");
  }

  const schema = (def as Record<string, unknown>).inputSchema;
  if (
    !isPlainObject(schema) ||
    typeof (schema as Record<string, unknown>).safeParse !== "function"
  ) {
    problems.push("inputSchema must be a zod schema exposing safeParse()");
  } else {
    // Duck-typing proof: a zod-compatible schema returns a { success } result
    // object for a probe parse instead of throwing.
    try {
      const probe = (schema as { safeParse(input: unknown): { success: boolean } }).safeParse({});
      if (!isPlainObject(probe) || typeof probe.success !== "boolean") {
        problems.push("inputSchema.safeParse() must return a { success } result object");
      }
    } catch {
      problems.push("inputSchema.safeParse() threw on a probe parse");
    }
  }

  const authorization = (def as Record<string, unknown>).authorization;
  if (!isPlainObject(authorization)) {
    problems.push("authorization must be a ToolAuthorizationPolicy object");
  } else {
    const surfaces = (authorization as Record<string, unknown>).allowedSurfaces;
    if (
      !Array.isArray(surfaces) ||
      surfaces.length === 0 ||
      !surfaces.every((s) => typeof s === "string" && VALID_SURFACES.includes(s as SurfaceKind))
    ) {
      problems.push(
        `authorization.allowedSurfaces must be a non-empty subset of ${VALID_SURFACES.join(", ")}`,
      );
    }
    const permission = (authorization as Record<string, unknown>).requiredPermission;
    if (permission !== undefined && permission !== null && typeof permission !== "string") {
      problems.push("authorization.requiredPermission must be a string or null");
    }
    const capability = (authorization as Record<string, unknown>).requiredCapability;
    if (
      capability !== undefined &&
      capability !== null &&
      !(typeof capability === "string" && (VALID_CAPABILITIES as readonly string[]).includes(capability))
    ) {
      problems.push(
        `authorization.requiredCapability must be one of ${VALID_CAPABILITIES.join(", ")} or null`,
      );
    }
  }

  if (typeof (def as Record<string, unknown>).execute !== "function") {
    problems.push("execute must be a function");
  }

  if (problems.length > 0) {
    throw new ToolRegistrationError(
      "DEFINITION_INVALID",
      `Tool registration rejected — ${problems.length} problem(s): ${problems.join("; ")}. The registry fails closed and has not been modified.`,
      problems,
    );
  }
}

function failure(toolName: string, error: ToolError): ToolFailure {
  return Object.freeze({
    ok: false as const,
    toolName,
    error: Object.freeze({
      code: error.code,
      message: error.message,
      ...(error.details !== undefined
        ? { details: Object.freeze({ ...error.details }) }
        : {}),
    }),
  });
}

function result(toolName: string, data: unknown): ToolResult {
  return Object.freeze({
    ok: true as const,
    toolName,
    data,
  });
}

/** Emits to a sink, absorbing and logging sink errors — never breaks the invocation. */
function emit(sink: ToolEventSink | undefined, event: ToolStreamingEvent): void {
  if (!sink) return;
  try {
    sink(event);
  } catch (err) {
    console.warn(
      "[tool-runtime] event sink failed (never breaks the invocation):",
      (err as Error)?.message ?? err,
    );
  }
}

/** Emits to the runtime sink AND the per-invocation sink (each absorbed independently). */
function emitAll(
  runtimeSink: ToolEventSink | undefined,
  invocationSink: ToolEventSink | undefined,
  event: ToolStreamingEvent,
): void {
  emit(runtimeSink, event);
  emit(invocationSink, event);
}

/** Runs the metering hook, absorbing and logging hook errors — never breaks the invocation. */
async function meter(hook: ToolMeteringHook | undefined, record: ToolMeteringRecord): Promise<void> {
  if (!hook) return;
  try {
    await hook.onInvocation(record);
  } catch (err) {
    console.warn(
      "[tool-runtime] metering hook failed (never breaks the invocation):",
      (err as Error)?.message ?? err,
    );
  }
}

// ─── The runtime ─────────────────────────────────────────────────────────────

export interface ToolRuntime {
  /**
   * Validates and registers a tool. Fail-closed: invalid definitions and
   * duplicate names throw `ToolRegistrationError` and leave the registry
   * untouched. The committed definition (wrapper + policy + allowedSurfaces)
   * is frozen in place.
   */
  registerTool(definition: ToolDefinition): void;

  /** Whether a tool with this exact name is registered. */
  hasTool(name: string): boolean;

  /**
   * Deterministic exact-name lookup of a registered definition. Unknown
   * names throw `UnknownToolError` — no fallback, no fuzzy matching.
   */
  getTool(name: string): ToolDefinition;

  /** Listing/discovery summaries (fresh frozen array; no execute references). */
  listTools(): readonly ToolSummary[];

  /**
   * Invokes a tool through the full 7-B lifecycle. NEVER throws for
   * tool-level failures — every failure is the normalized typed
   * `ToolFailure`. Lifecycle: context assertion → allowlist → authorization
   * (surface + identity checks, then the host adapter) → zod validation →
   * execute() → normalization → metering → streaming events. A
   * provenance-invalid context fails closed at the context assertion with
   * INVALID_CONTEXT and produces NO tenant-scoped metering record — the
   * metering hook is not invoked and no untrusted tenant data is passed
   * into metering (see tool-contracts.ts ToolMeteringHook).
   */
  invoke(
    name: string,
    input: unknown,
    context: PlatformExecutionContext,
    options?: ToolInvokeOptions,
  ): Promise<ToolInvocationOutcome>;
}

/**
 * Creates an isolated Unified Tool Runtime instance. The application seam
 * uses the lazily-initialized Clara singleton in `clara-tools.ts`
 * (`getClaraToolRuntime`); tests and future embeddings create their own.
 */
export function createToolRuntime(options: ToolRuntimeOptions): ToolRuntime {
  if (!isPlainObject(options) || typeof options.authorizationAdapter?.authorize !== "function") {
    throw new ToolRegistrationError(
      "DEFINITION_INVALID",
      "Tool runtime construction requires a valid ToolAuthorizationAdapter — without a host authorization binding, RBAC and plan-entitlement checks would silently not run (a permissive fallback the 7-B contract forbids).",
    );
  }
  const authorizationAdapter = options.authorizationAdapter;
  const meteringHook = options.meteringHook;
  const runtimeEventSink = options.eventSink;

  const tools = new Map<string, ToolDefinition>();

  function knownNames(): string[] {
    return [...tools.keys()];
  }

  /**
   * Runs the full authorization stage. Returns `null` when allowed, or the
   * normalized typed failure when denied. Deterministic structural checks
   * (surface allowlist, declared identity requirements) run first with no
   * host I/O; the host adapter (RBAC × plan entitlement × host tenant
   * checks) runs after and is fail-closed on its own errors.
   */
  async function runAuthorization(
    def: ToolDefinition,
    context: PlatformExecutionContext,
  ): Promise<ToolFailure | null> {
    // Deterministic structural checks first (no host I/O):
    if (!def.authorization.allowedSurfaces.includes(context.surface)) {
      return failure(def.name, {
        code: "UNAUTHORIZED_SURFACE",
        message: `Tool "${def.name}" is not exposed on the "${context.surface}" surface. Allowed surfaces: ${def.authorization.allowedSurfaces.join(", ")}. The tool runtime fails closed — surface restrictions are never bypassed.`,
        details: { allowedSurfaces: def.authorization.allowedSurfaces, surface: context.surface },
      });
    }
    if (def.authorization.requireUserId === true && !context.userId) {
      return failure(def.name, {
        code: "MISSING_CONTEXT_IDENTITY",
        message: `Tool "${def.name}" requires a user identity in the execution context; none is present. The invocation fails closed.`,
      });
    }
    if (def.authorization.requireSessionId === true && !context.sessionId) {
      return failure(def.name, {
        code: "MISSING_CONTEXT_IDENTITY",
        message: `Tool "${def.name}" requires a session identity in the execution context; none is present. The invocation fails closed.`,
      });
    }
    // Host authorization (RBAC × plan entitlement × host tenant checks):
    let decision: ToolAuthorizationDecision;
    try {
      decision = await authorizationAdapter.authorize({
        toolName: def.name,
        policy: def.authorization,
        context,
      });
    } catch (err) {
      // Fail closed: an unavailable authorization check is a denial.
      return failure(def.name, {
        code: "AUTHORIZATION_UNAVAILABLE",
        message: `Authorization could not be evaluated for tool "${def.name}" — the invocation fails closed rather than proceeding unchecked.`,
        details: { reason: (err as Error)?.message ?? String(err) },
      });
    }
    if (!decision.allowed) {
      return failure(def.name, {
        code: decision.code,
        message: decision.message,
        ...(decision.details !== undefined ? { details: decision.details } : {}),
      });
    }
    return null;
  }

  return {
    registerTool(definition: ToolDefinition): void {
      validateToolDefinition(definition);
      if (tools.has(definition.name)) {
        throw new ToolRegistrationError(
          "ALREADY_REGISTERED",
          `Tool registration rejected — "${definition.name}" is already registered. Re-registration is not permitted; the live tool is preserved.`,
        );
      }
      // Validate-then-commit: a rejected registration never touches the
      // caller's objects; the committed copy is frozen AFTER validation.
      tools.set(definition.name, freezeCommittedDefinition(definition));
    },

    hasTool(name: string): boolean {
      return typeof name === "string" && tools.has(name);
    },

    getTool(name: string): ToolDefinition {
      if (typeof name !== "string" || !tools.has(name)) {
        throw new UnknownToolError(String(name), knownNames());
      }
      return tools.get(name) as ToolDefinition;
    },

    listTools(): readonly ToolSummary[] {
      return Object.freeze(
        [...tools.values()].map((def) =>
          Object.freeze({
            name: def.name,
            description: def.description,
            allowedSurfaces: Object.freeze([...def.authorization.allowedSurfaces]),
            inputSchema: def.inputSchema,
          }),
        ),
      );
    },

    async invoke(
      name: string,
      input: unknown,
      context: PlatformExecutionContext,
      options?: ToolInvokeOptions,
    ): Promise<ToolInvocationOutcome> {
      const startedAt = Date.now();
      const invocationId =
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `toolinv-${startedAt}-${Math.random().toString(36).slice(2)}`;

      // (1) Mandatory execution context — the Phase 7-A provenance boundary.
      // An invalid, non-factory, or forged context fails closed before
      // anything else happens. This deliberately includes metering (F-7B-02,
      // corrected): the tenant-scoped ToolMeteringRecord would have to be
      // built FROM this untrusted context, so no record is produced, the
      // metering hook is not invoked, and no untrusted tenant data reaches
      // the metering boundary. The security boundary is intentional and is
      // NOT weakened — no ambient/default tenant is fabricated and no tenant
      // identity is inferred from the rejected object.
      try {
        assertExecutionContext(context);
      } catch (err) {
        return failure("<unresolved>", {
          code: "INVALID_CONTEXT",
          message:
            (err as Error)?.message ??
            "A valid tenant-scoped PlatformExecutionContext is required for tool invocation.",
        });
      }

      const recordOutcome = async (
        toolName: string,
        outcome: "ok" | "error",
        errorCode: ToolError["code"] | undefined,
      ): Promise<void> => {
        await meter(meteringHook, {
          invocationId,
          toolName,
          tenantId: context.tenantId,
          kbId: context.kbId,
          ...(context.agentId !== undefined ? { agentId: context.agentId } : {}),
          ...(context.userId !== undefined ? { userId: context.userId } : {}),
          ...(context.sessionId !== undefined ? { sessionId: context.sessionId } : {}),
          surface: context.surface,
          outcome,
          ...(errorCode !== undefined ? { errorCode } : {}),
          durationMs: Date.now() - startedAt,
          ...(context.correlationId !== undefined ? { correlationId: context.correlationId } : {}),
        });
      };

      // (2) Tool allowlist — registry membership.
      if (typeof name !== "string" || !tools.has(name)) {
        await recordOutcome(String(name), "error", "UNKNOWN_TOOL");
        return failure(String(name), {
          code: "UNKNOWN_TOOL",
          message: `Unknown tool: "${String(name)}". Registered tools: ${
            knownNames().length > 0 ? knownNames().join(", ") : "(none)"
          }. Tool invocation fails closed — there is no implicit fallback.`,
        });
      }
      const def = tools.get(name) as ToolDefinition;

      // (3) Authorization — deterministic checks, then the host adapter.
      const denied = await runAuthorization(def, context);
      if (denied !== null) {
        await recordOutcome(def.name, "error", denied.error.code);
        return denied;
      }

      // (4) zod input validation.
      const parsed = def.inputSchema.safeParse(input);
      if (!parsed.success) {
        const typedFailure = failure(def.name, {
          code: "INVALID_ARGUMENTS",
          message: `Tool "${def.name}" rejected its input: the arguments failed schema validation.`,
          details: {
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              code: issue.code,
              message: issue.message,
            })),
          },
        });
        await recordOutcome(def.name, "error", "INVALID_ARGUMENTS");
        return typedFailure;
      }

      // (5) Execute — with paired streaming events around the execution only.
      const invokeEventSink = options?.eventSink;
      const correlationId = context.correlationId;
      emitAll(runtimeEventSink, invokeEventSink, {
        type: "tool_call_started",
        invocationId,
        toolName: def.name,
        ...(correlationId !== undefined ? { correlationId } : {}),
        startedAt: new Date(startedAt).toISOString(),
      });

      let outcome: ToolInvocationOutcome;
      try {
        // The return value is ALWAYS the domain payload — untouched.
        outcome = result(def.name, await def.execute(parsed.data, context));
      } catch (err) {
        if (err instanceof ToolExecutionError) {
          // The tool self-reported a typed failure code.
          outcome = failure(def.name, {
            code: err.code,
            message: err.message,
            ...(err.details !== undefined ? { details: err.details } : {}),
          });
        } else {
          outcome = failure(def.name, {
            code: "EXECUTION_FAILED",
            message: `Tool "${def.name}" failed during execution: ${
              (err as Error)?.message ?? String(err)
            }`,
          });
        }
      }

      const durationMs = Date.now() - startedAt;
      const finishedAt = new Date().toISOString();
      if (outcome.ok) {
        emitAll(runtimeEventSink, invokeEventSink, {
          type: "tool_call_succeeded",
          invocationId,
          toolName: def.name,
          ...(correlationId !== undefined ? { correlationId } : {}),
          durationMs,
          finishedAt,
        });
      } else {
        emitAll(runtimeEventSink, invokeEventSink, {
          type: "tool_call_failed",
          invocationId,
          toolName: def.name,
          ...(correlationId !== undefined ? { correlationId } : {}),
          durationMs,
          finishedAt,
          error: outcome.error,
        });
      }

      // (6) Metering — exactly once, correctly scoped, never breaks the call.
      await recordOutcome(
        def.name,
        outcome.ok ? "ok" : "error",
        outcome.ok ? undefined : outcome.error.code,
      );

      return outcome;
    },
  };
}
