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
 * - metering — the approved hook interface, bound following the existing
 *   spine's discipline (append-only, never-break-the-metered-pipeline,
 *   org-scoped). The default Clara hook is a non-writing observer: the
 *   incumbent rag_search retrieval is metered by its owning turn (the
 *   admission: "external" contract exists precisely to prevent
 *   double-billing), and the `usage_events` kind vocabulary is fixed by the
 *   existing schema (CHECK constraint; no migrations are authorized in 7-B).
 *   Hosts bind their own hook to extend metering; the runtime invokes it
 *   with the caller-scoped record on every invocation attempt.
 *
 * The incumbent `ai-core` provider stack and `src/modules/ai-core/**` are
 * consumed through `claraRuntime`, never duplicated or modified. No routes
 * are added or changed; no new dependencies; no schema changes.
 *
 * Server-side only.
 */

import { z } from "zod";
import { resolvePlanAIEntitlements } from "@/modules/ai-governance/core/entitlements-db";
import { getOrgAccessContext } from "@/modules/auth/core/db";
import type { OrgMember, PermissionKey } from "@/modules/auth/core/models";
import type { PlatformExecutionContext, SurfaceKind } from "./contracts";
import { createExecutionContext } from "./execution-context";
import { claraRuntime, type ClaraRuntimeContext } from "./clara-runtime";
import { createToolRuntime, type ToolRuntime } from "./tool-registry";
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
 * The default Clara metering hook — the approved 7-B metering interface bound
 * to the existing spine's DISCIPLINE (append-only, never-break-the-metered-
 * pipeline, org-scoped) without inserting new billing rows:
 *
 * - the incumbent rag_search retrieval is metered by its OWNING turn (the
 *   grounding `admission: "external"` contract exists precisely so the
 *   caller owns the query event — inserting here would double-bill);
 * - the `usage_events` kind vocabulary is fixed by the existing schema CHECK
 *   constraint, and 7-B authorizes no migrations;
 * - the hook is the extension point where the existing usage/event
 *   infrastructure is bound per-surface by the owning flow (e.g. a future
 *   7-C loop binds per-turn accounting).
 *
 * The default implementation therefore records org-scoped structured
 * telemetry and never throws. Tests prove the RUNTIME invokes the hook with
 * the correctly scoped record; hosts may bind their own hook.
 */
export function buildClaraToolMeteringHook(): ToolMeteringHook {
  return {
    async onInvocation(record: ToolMeteringRecord): Promise<void> {
      console.info(
        "[tool-runtime] invocation metered",
        JSON.stringify({
          invocationId: record.invocationId,
          toolName: record.toolName,
          orgId: record.tenantId,
          kbId: record.kbId,
          surface: record.surface,
          outcome: record.outcome,
          errorCode: record.errorCode ?? null,
          durationMs: record.durationMs,
        }),
      );
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
  return runtime;
}

let claraToolRuntime: ToolRuntime | null = null;

/**
 * The Clara application seam for the Unified Tool Runtime — the replacement
 * for the former hardcoded `claraRuntime.tools` object (PHASE-7-PLAN.md §9
 * A2: "`claraRuntime.tools` seam (replacing the hardcoded object)"). Lazily
 * initialized exactly once; registration is fail-closed.
 */
export function getClaraToolRuntime(): ToolRuntime {
  if (claraToolRuntime === null) {
    claraToolRuntime = buildClaraToolRuntime();
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
