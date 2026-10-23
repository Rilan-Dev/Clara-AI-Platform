/**
 * src/modules/ai-platform-core/clara-tools.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 7-B — Clara host binding for the Unified Tool Runtime.
 *
 * Binds the 7-B runtime to Clara's EXISTING infrastructure
 * (PHASE-7-PLAN.md §9 A2; handoff §§4–8):
 *
 * - `rag_search` — the required first runtime consumer, migrated onto the
 *   registry as a ToolDefinition that WRAPS the existing retrieval
 *   implementation (`claraRuntime.retrieve` → `groundClaraContext`). The
 *   underlying RAG implementation is NOT rewritten: tenant isolation,
 *   orgId/agentId/kbId/userId/sessionId carriage, retrieval semantics, the
 *   existing Qdrant/Clara knowledge-base behavior, authorization boundaries,
 *   public/embed restrictions, and the existing usage accounting
 *   (admission: "external" — the owning turn owns the query event) are all
 *   preserved byte-for-byte. The tool's domain payload IS the incumbent
 *   `GroundingOutcome`, including its domain-level `ok:false` outcomes
 *   (e.g. the 402 plan_limit_exceeded contract) — those are valid tool
 *   outputs, not tool failures; the typed `ToolFailure` envelope is reserved
 *   for runtime-level failures (context/allowlist/authorization/validation/
 *   execution).
 * - authorization — the Clara adapter composes the reviewed model:
 *   surface restrictions (registry-enforced allowlist; `rag_search` is
 *   exposed exactly where it is today — realtime and embed voice surfaces,
 *   NOT chat, which never exposed a tool surface) × plan entitlement
 *   (the existing `ai-governance` `resolvePlanAIEntitlements`) × RBAC (the
 *   existing `auth` org-access context, only when a tool declares
 *   `requiredPermission` — `rag_search` deliberately declares none: its
 *   owning routes keep the authentication boundary, exactly as today) ×
 *   tenant execution context (the 7-A provenance-hardened factory).
 * - metering — the approved hook interface, bound to the EXISTING Clara
 *   org-scoped observability spine via the existing `writeAuditLog` helper
 *   (the auth audit trail — the same discipline the quota spine itself
 *   uses for metering-domain events that must not affect billing;
 *   precedent: `quota.denied`; F-7B-01, corrected). One org-scoped audit
 *   row per metered invocation attempt; authorization-denied attempts
 *   record the dedicated `tool.denied` action (mirroring `quota.denied`),
 *   every other outcome `tool.invoked` with the typed outcome/errorCode.
 *   The hook NEVER writes billing rows: the incumbent rag_search retrieval
 *   is metered by its owning turn (the admission: "external" contract
 *   exists precisely to prevent double-billing — and a second
 *   `query_events` row would ALSO consume the org's rolling-24h quota),
 *   while the `usage_events` kind vocabulary is fixed by the existing
 *   schema CHECK constraint with a NOT NULL `model` — no tool-invocation
 *   kind exists and none may be invented without a migration (not
 *   authorized in 7-B; recorded as the billable-spine representation
 *   blocker, awaiting architect disposition). Metering failures are
 *   absorbed and logged — they NEVER break the metered invocation. Hosts
 *   may still bind their own hook; the runtime invokes it with the
 *   caller-scoped record on every provenance-verified invocation attempt.
 *
 * The incumbent `ai-core` provider stack and `src/modules/ai-core/**` are
 * consumed through `claraRuntime`, never duplicated or modified. No routes
 * are added or changed; no new dependencies; no schema changes.
 *
 * Server-side only.
 */

import { z } from "zod";
import { resolvePlanAIEntitlements } from "@/modules/ai-governance/core/entitlements-db";
import { getOrgAccessContext, writeAuditLog } from "@/modules/auth/core/db";
import type { OrgMember, PermissionKey } from "@/modules/auth/core/models";
import type { PlatformExecutionContext, SurfaceKind } from "./contracts";
import { createExecutionContext } from "./execution-context";
import { claraRuntime, type ClaraRuntimeContext } from "./clara-runtime";
import { createToolRuntime, type ToolRuntime } from "./tool-registry";
import { buildIntegrationAvailabilityTool } from "./integration-ai-tools";
import { buildIntegrationActionTool } from "./integration-action-tool";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";
import type {
  ToolAuthorizationAdapter,
  ToolAuthorizationDecision,
  ToolAuthorizationRequest,
  ToolDefinition,
  ToolInvocationOutcome,
  ToolMeteringHook,
  ToolMeteringRecord,
  ToolPlanCapability,
} from "./tool-contracts";

// ─── Surface → plan-capability mapping ──────────────────────────────────────

/**
 * Maps an invocation surface onto the plan-entitlement capability axis, the
 * same way the incumbent voice stack resolves purpose axes (voice-core
 * `platformUnavailable(provider, capability)`): embeds/floating widgets are
 * voice_chat purpose; realtime sessions are realtime_voice; chat is chat.
 */
export function planCapabilityForSurface(surface: SurfaceKind): ToolPlanCapability {
  switch (surface) {
    case "realtime":
      return "realtime_voice";
    case "embed":
      return "voice_chat";
    case "chat":
    default:
      return "chat";
  }
}

// ─── rag_search — the migrated first tool ────────────────────────────────────

export const RAG_SEARCH_TOOL_NAME = "rag_search";

/**
 * zod input schema for `rag_search` — the fields the incumbent
 * `claraRuntime.tools.invoke` reads today: `query` (required, trimmed,
 * non-blank — the old "rag_search requires a query." guard) and `ragMode`
 * (optional enum; absent → "hybrid", matching the incumbent default).
 * Unknown keys are stripped, matching the incumbent's read-only-what-it-knows
 * behavior.
 */
const ragSearchInputSchema = z
  .object({
    query: z.string().trim().min(1),
    ragMode: z.enum(["classic", "hybrid", "agentic"]).optional(),
  })
  .strip();

/**
 * The migrated `rag_search` ToolDefinition. Behavior-preserving by
 * construction: the executor calls the EXISTING `claraRuntime.retrieve` with
 * exactly the options the incumbent tool passed (ragMode from the payload,
 * channel "voice"), carrying the caller's tenant context through unchanged.
 */
export function buildRagSearchTool(): ToolDefinition {
  return {
    name: RAG_SEARCH_TOOL_NAME,
    description:
      "Retrieve tenant-bound evidence from Clara's active knowledge base.",
    inputSchema: ragSearchInputSchema,
    authorization: {
      // Exactly the surfaces the tool is exposed on today (realtime voice
      // sessions, embed/phone voice surfaces). Chat never exposed a tool
      // surface — including it here would BROADEN exposure, which the 7-B
      // authorization forbids.
      allowedSurfaces: ["realtime", "embed"],
      // The owning routes keep the authentication/RBAC boundary exactly as
      // today (session/API-key scoped, visitor-facing). No org-role
      // requirement is introduced for the incumbent tool.
      requiredPermission: null,
      // Entitlement derives from the invocation surface via the existing
      // ai-governance resolver (realtime → realtime_voice; embed →
      // voice_chat).
      requiredCapability: null,
      requireUserId: false,
      requireSessionId: false,
    },
    async execute(input, context) {
      // The caller's tenant context is carried through UNCHANGED — orgId,
      // agentId, kbId, userId, sessionId (the existing ClaraRuntimeContext
      // shape the retrieval implementation already consumes).
      const runtimeContext: ClaraRuntimeContext = {
        orgId: context.tenantId,
        agentId: context.agentId ?? null,
        kbId: context.kbId,
        userId: context.userId ?? null,
        sessionId: context.sessionId ?? null,
      };
      const validatedInput = input as { query: string; ragMode?: "classic" | "hybrid" | "agentic" };
      // The domain payload IS the incumbent GroundingOutcome — returned
      // byte-for-byte, including its domain-level ok:false outcomes.
      return claraRuntime.retrieve(runtimeContext, validatedInput.query, {
        ragMode: validatedInput.ragMode ?? "hybrid",
        channel: "voice",
      });
    },
  };
}

// ─── Clara authorization adapter ─────────────────────────────────────────────

/**
 * The Clara authorization binding: plan entitlement via the existing
 * `ai-governance` resolver, RBAC via the existing `auth` org-access context
 * (only for tools that declare `requiredPermission`). Deterministic and
 * fail-closed; an infrastructure error surfaces as a thrown error that the
 * runtime normalizes to AUTHORIZATION_UNAVAILABLE (denial).
 */
export function buildClaraToolAuthorizationAdapter(): ToolAuthorizationAdapter {
  return {
    async authorize(request: ToolAuthorizationRequest): Promise<ToolAuthorizationDecision> {
      const { context, policy } = request;

      // (1) Plan entitlement — the existing org-scoped resolver.
      const capability = policy.requiredCapability ?? planCapabilityForSurface(context.surface);
      const entitlements = await resolvePlanAIEntitlements(context.tenantId);
      if (entitlements.capabilities[capability] === false) {
        return {
          allowed: false,
          code: "PLAN_NOT_ENTITLED",
          message: `The ${entitlements.planName} plan does not include ${capability.replace("_", " ")} — tool "${request.toolName}" is not available on this plan.`,
          details: { capability, planId: entitlements.planId },
        };
      }

      // (2) RBAC — only when the tool declares a required permission.
      if (policy.requiredPermission) {
        if (!context.userId) {
          return {
            allowed: false,
            code: "UNAUTHORIZED_ROLE",
            message: `Tool "${request.toolName}" requires an org-role check, but the execution context carries no user identity. The invocation fails closed.`,
          };
        }
        const [access] = await getOrgAccessContext(context.tenantId, context.userId);
        const membership: OrgMember | null = access?.membership ?? null;
        const permissions: Set<PermissionKey> = access?.permissions ?? new Set();
        if (!membership || !permissions.has(policy.requiredPermission as PermissionKey)) {
          return {
            allowed: false,
            code: "UNAUTHORIZED_ROLE",
            message: `Forbidden — tool "${request.toolName}" requires permission: ${policy.requiredPermission}.`,
            details: { requiredPermission: policy.requiredPermission },
          };
        }
      }

      return { allowed: true };
    },
  };
}

// ─── Clara metering hook ─────────────────────────────────────────────────────

/**
 * The typed error codes that classify a metered invocation attempt as
 * authorization-denied (the denial family of the ToolErrorCode union — the
 * codes the runtime's authorization stage can produce). These attempts
 * record the dedicated `tool.denied` audit action, mirroring the quota
 * spine's existing `quota.denied` discipline for representing metering-domain
 * denials without affecting billing. Every other metered outcome (unknown
 * tool, invalid arguments, execution failure, or success) records
 * `tool.invoked` with the typed outcome/errorCode classification in the
 * payload.
 */
const TOOL_AUTHORIZATION_DENIED_CODES: ReadonlySet<string> = new Set([
  "MISSING_CONTEXT_IDENTITY",
  "UNAUTHORIZED_SURFACE",
  "UNAUTHORIZED_ROLE",
  "PLAN_NOT_ENTITLED",
  "TENANT_SCOPE_VIOLATION",
  "AUTHORIZATION_UNAVAILABLE",
]);

/**
 * The default Clara metering hook — the approved 7-B metering interface bound
 * to the existing Clara org-scoped observability spine (F-7B-01, corrected).
 *
 * Binding analysis against the existing metering infrastructure:
 *
 * - `usage_events` (the billable non-chat metering spine) CANNOT represent a
 *   distinct tool invocation: the kind vocabulary is closed by the schema
 *   CHECK constraint (EMBEDDING/TTS/OCR/TRANSCRIPTION/CONVERSATION/
 *   TRANSLATION — every kind is a billable AI provider invocation) and
 *   `model` is NOT NULL with cost taken from measured facts, never guessed.
 *   Representing a tool invocation would require a new kind or a fabricated
 *   model — a schema change / an invented event kind, both unauthorized in
 *   7-B (recorded as the billable-spine representation blocker, awaiting
 *   architect disposition).
 * - `query_events` (the chat/query billing unit) CANNOT represent a distinct
 *   tool invocation without double-billing: quota admission counts EVERY
 *   row per org in the rolling-24h window, and the incumbent rag_search
 *   retrieval is already represented by its owning turn's admitted +
 *   finalised query event (the admission: "external" contract — inserting
 *   here would count the turn twice).
 * - The existing spine's established discipline for metering-domain events
 *   that must NOT affect billing is the org-scoped audit trail:
 *   `writeAuditLog` — the same helper the quota spine itself uses to record
 *   `quota.denied` (an append-only, org-scoped, admin-analytics-observable
 *   event row with zero billing impact and zero schema impact). This hook
 *   binds there, on the already-consumed `@/modules/auth/core/db` seam.
 *
 * Event semantics: one audit row per metered invocation attempt —
 * `tool.denied` for authorization-denied attempts (the `quota.denied`
 * discipline), `tool.invoked` for every other outcome, with the full
 * caller-scoped metering record (tool, KB, agent/user/session identity,
 * surface, outcome, typed errorCode, duration, correlation) in `newData`.
 * The runtime still invokes the hook exactly once per provenance-verified
 * invocation attempt (INVALID_CONTEXT attempts produce no metering record
 * at all — F-7B-02; untrusted tenant data never reaches this binding).
 *
 * Metering failures are absorbed and logged here (and additionally by the
 * runtime's own metering stage) — never breaking the metered invocation,
 * the same never-break-the-metered-pipeline discipline as the existing
 * `logQueryEvent` / `logUsageEvent` / voice-metering writers.
 */
export function buildClaraToolMeteringHook(): ToolMeteringHook {
  return {
    async onInvocation(record: ToolMeteringRecord): Promise<void> {
      const denied =
        record.errorCode !== undefined &&
        TOOL_AUTHORIZATION_DENIED_CODES.has(record.errorCode);
      try {
        await writeAuditLog({
          orgId: record.tenantId,
          ...(record.userId !== undefined ? { userId: record.userId } : {}),
          action: denied ? "tool.denied" : "tool.invoked",
          resourceType: "tool_invocation",
          resourceId: record.toolName,
          newData: {
            invocationId: record.invocationId,
            toolName: record.toolName,
            kbId: record.kbId,
            ...(record.agentId !== undefined ? { agentId: record.agentId } : {}),
            ...(record.sessionId !== undefined ? { sessionId: record.sessionId } : {}),
            surface: record.surface,
            outcome: record.outcome,
            ...(record.errorCode !== undefined ? { errorCode: record.errorCode } : {}),
            durationMs: record.durationMs,
            ...(record.correlationId !== undefined ? { correlationId: record.correlationId } : {}),
          },
        });
      } catch (err) {
        // The existing spine's never-break-the-metered-pipeline discipline
        // (same as logQueryEvent / logUsageEvent / the voice metering
        // writers): a metering write failure is logged and swallowed.
        console.warn(
          "[tool-runtime] metering audit write failed (never breaks the invocation):",
          (err as Error)?.message ?? err,
        );
      }
    },
  };
}

// ─── The Clara tool runtime (application seam) ───────────────────────────────

/**
 * Builds a Clara-bound Unified Tool Runtime: `rag_search` registered
 * (behavior-preserving migration), the Clara authorization adapter, and the
 * default Clara metering hook. Injectable for tests; the production seam is
 * the lazily-initialized singleton below.
 */
export function buildClaraToolRuntime(overrides?: {
  authorizationAdapter?: ToolAuthorizationAdapter;
  meteringHook?: ToolMeteringHook;
}): ToolRuntime {
  const runtime = createToolRuntime({
    authorizationAdapter: overrides?.authorizationAdapter ?? buildClaraToolAuthorizationAdapter(),
    meteringHook: overrides?.meteringHook ?? buildClaraToolMeteringHook(),
  });
  runtime.registerTool(buildRagSearchTool());
  if (isPlatformFeatureEnabled("integrations")) {
    runtime.registerTool(buildIntegrationAvailabilityTool());
    runtime.registerTool(buildIntegrationActionTool());
  }
  // Organization-owned MCP tools are NOT statically registered: they are
  // advertised per request through buildMcpToolRuntime with the
  // OrgMcpToolResolver adapter (src/modules/mcp/runtime-resolver.ts), so the
  // same Unified Tool Runtime enforces one authorization and metering path
  // for both the platform catalog and tenant-owned custom endpoints.
  return runtime;
}

let claraToolRuntime: ToolRuntime | null = null;
let registeredIntegrationsEnabled: boolean | null = null;

/**
 * The Clara application seam for the Unified Tool Runtime — the replacement
 * for the former hardcoded `claraRuntime.tools` object (PHASE-7-PLAN.md §9
 * A2: "`claraRuntime.tools` seam (replacing the hardcoded object)").
 *
 * Preserve the singleton while the effective deployment policy is unchanged,
 * but rebuild when the optional integrations family changes. Otherwise a
 * cached production-off registry never acquires tools when enabled, or a
 * cached development-on registry keeps advertising disabled tools. Existing
 * tool handles independently check availability at invocation time.
 */
export function getClaraToolRuntime(): ToolRuntime {
  const integrationsEnabled = isPlatformFeatureEnabled("integrations");
  if (claraToolRuntime === null || registeredIntegrationsEnabled !== integrationsEnabled) {
    const next = buildClaraToolRuntime();
    claraToolRuntime = next;
    registeredIntegrationsEnabled = integrationsEnabled;
  }
  return claraToolRuntime;
}

// ─── Convenience: invoking through Clara identity directly ───────────────────

/**
 * Invokes a registered tool from a `ClaraRuntimeContext` (the incumbent
 * identity shape) by minting the mandatory execution context through the
 * 7-A factory and delegating to the Unified Tool Runtime. This is the
 * migration path incumbent call sites use; it fails closed exactly like the
 * runtime (missing tenant identity, forged contexts, unauthorized surfaces,
 * insufficient entitlements, invalid arguments — all typed failures).
 */
export async function invokeClaraTool(
  ctx: ClaraRuntimeContext,
  name: string,
  input: unknown,
  surface: SurfaceKind = "realtime",
): Promise<ToolInvocationOutcome> {
  let context: PlatformExecutionContext;
  try {
    context = createExecutionContext({
      orgId: ctx.orgId,
      kbId: ctx.kbId,
      agentId: ctx.agentId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      surface,
    });
  } catch (err) {
    // Identity could not produce a valid tenant-scoped context — a typed
    // INVALID_CONTEXT failure, consistent with the runtime's never-throw
    // contract for tool-level failures.
    return Object.freeze({
      ok: false as const,
      toolName: String(name),
      error: Object.freeze({
        code: "INVALID_CONTEXT" as const,
        message: (err as Error)?.message ?? "Clara runtime identity could not produce a valid tenant-scoped execution context.",
      }),
    });
  }
  return getClaraToolRuntime().invoke(name, input, context);
}
