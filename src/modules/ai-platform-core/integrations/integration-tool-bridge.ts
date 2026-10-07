/**
 * Integrations Framework I-4 — Unified Tool Runtime bridge.
 *
 * Integration actions become ordinary Clara ToolDefinitions and are invoked
 * exclusively through the existing Phase 7 Unified Tool Runtime. This module
 * owns no credentials, persistence, provider transport, or parallel executor.
 */
import { z } from "zod";
import { query } from "@/lib/db";
import { resolveOrgPlanLimits } from "@/lib/plan-guard";
import { getIntegration } from "@/modules/integrations/registry";
import {
  getIntegrationActions,
  runAction,
} from "@/modules/integrations/runtime/runner-core";
import { validateActionProps } from "@/modules/integrations/runtime/action-input-validation";
import { assertExecutionContext } from "../execution-context";
import type { PlatformExecutionContext, SurfaceKind } from "../contracts";
import type {
  IntegrationActionDefinition,
  IntegrationExecutionRequest,
  IntegrationExecutionResult,
  IntegrationToolBridgeAdapter,
} from "./integration-contracts";
import type { ToolDefinition } from "../tool-contracts";
import type { ToolRuntime } from "../tool-registry";
import { ToolExecutionError } from "../tool-contracts";
import { getClaraToolRuntime } from "../clara-tools";

const ALLOWED_SURFACES: readonly SurfaceKind[] = ["chat", "realtime", "embed"];

function hashSuffix(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 8);
}

export function integrationToolName(integrationId: string, actionName: string): string {
  const base = `integration_${integrationId}_${actionName}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  if (base.length <= 64) return base;
  return `${base.slice(0, 55)}_${hashSuffix(base)}`;
}

function buildInputSchema(
  props: Record<string, unknown>,
): z.ZodType<unknown> {
  return z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
    const errors = validateActionProps(props, value, true);
    for (const message of errors) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });
}

export function buildIntegrationActionDefinition(
  integrationId: string,
  action: {
    name: string;
    displayName: string;
    description: string;
    props: Record<string, unknown>;
  },
): IntegrationActionDefinition {
  return {
    integrationId,
    name: action.name,
    displayName: action.displayName,
    description: action.description,
    inputSchema: buildInputSchema(action.props),
    allowedSurfaces: ALLOWED_SURFACES,
    requiresConnection: getIntegration(integrationId)?.authType !== "none",
  };
}

export function buildIntegrationToolDefinition(
  action: IntegrationActionDefinition,
): ToolDefinition {
  return {
    name: integrationToolName(action.integrationId, action.name),
    description: action.description || `Execute ${action.displayName} on ${action.integrationId}.`,
    inputSchema: action.inputSchema,
    authorization: {
      allowedSurfaces: action.allowedSurfaces,
      requiredPermission: null,
      requiredCapability: null,
      requireUserId: true,
      requireSessionId: false,
    },
    async execute(input, context) {
      const result = await runAction({
        workspaceId: context.tenantId,
        agentId: context.agentId,
        userId: context.userId!,
        integrationId: action.integrationId,
        actionName: action.name,
        props: input as Record<string, unknown>,
      });

      if (!result.success) {
        throw new ToolExecutionError(
          "EXECUTION_FAILED",
          result.error ?? `Integration action failed: ${action.name}`,
          {
            integrationId: action.integrationId,
            actionName: action.name,
            ...(result.errorCode ? { runnerErrorCode: result.errorCode } : {}),
            ...(result.retryable !== undefined ? { retryable: result.retryable } : {}),
          },
        );
      }
      return result.output;
    },
  };
}

async function assertIntegrationCapability(
  context: PlatformExecutionContext,
  integrationId: string,
): Promise<void> {
  const def = getIntegration(integrationId);
  if (!def) throw new ToolExecutionError("UNKNOWN_TOOL", `Unknown integration: ${integrationId}`);

  const platform = (await query<{ enabled: boolean; allowed_plans: string[] }>(
    "SELECT enabled, allowed_plans FROM platform_integrations WHERE integration_id=$1",
    [integrationId],
  ))[0];
  if (!platform?.enabled) {
    throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", `Integration ${def.displayName} is disabled by the platform administrator.`);
  }

  let limits: Awaited<ReturnType<typeof resolveOrgPlanLimits>>;
  try {
    limits = await resolveOrgPlanLimits(context.tenantId);
  } catch {
    throw new ToolExecutionError("PLAN_NOT_ENTITLED", "Integration plan entitlement could not be verified.");
  }
  if (
    !Array.isArray(platform.allowed_plans) ||
    (!platform.allowed_plans.includes(limits.plan_id) && !platform.allowed_plans.includes("*"))
  ) {
    throw new ToolExecutionError("PLAN_NOT_ENTITLED", `The ${limits.plan_name ?? limits.plan_id} plan cannot use ${def.displayName}.`);
  }

  const grant = (await query<{ enabled: boolean }>(
    "SELECT enabled FROM organisation_integrations WHERE org_id=$1 AND integration_id=$2",
    [context.tenantId, integrationId],
  ))[0];
  if (!grant?.enabled) {
    throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", `${def.displayName} is not enabled for this organisation.`);
  }

  if (!context.agentId) {
    throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", "Integration tools require an agent execution context.");
  }
  const agentGrant = (await query<{ enabled: boolean }>(
    "SELECT ai.enabled FROM agent_integrations ai INNER JOIN agents a ON a.id=ai.agent_id WHERE ai.agent_id=$1 AND a.org_id=$2 AND ai.integration_id=$3",
    [context.agentId, context.tenantId, integrationId],
  ))[0];
  if (!agentGrant?.enabled) {
    throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", `${def.displayName} is not enabled for this agent.`);
  }

  if (def.authType !== "none") {
    const connection = (await query<{ id: string }>(
      "SELECT id FROM integration_connections WHERE org_id=$1 AND integration_id=$2 AND status='active' AND (agent_id=$3 OR agent_id IS NULL) AND (user_id=$4 OR user_id IS NULL) ORDER BY CASE WHEN agent_id=$3 THEN 0 ELSE 1 END, CASE WHEN user_id=$4 THEN 0 ELSE 1 END, updated_at DESC LIMIT 1",
      [context.tenantId, integrationId, context.agentId, context.userId],
    ))[0];
    if (!connection) {
      throw new ToolExecutionError("EXECUTION_FAILED", `${def.displayName} is enabled but has no active connection.`);
    }
  }
}

async function buildDefinitions(
  context: PlatformExecutionContext,
  integrationId: string,
): Promise<readonly ToolDefinition[]> {
  assertExecutionContext(context);
  await assertIntegrationCapability(context, integrationId);

  const actions = await getIntegrationActions(integrationId);
  return actions.map((action) =>
    buildIntegrationToolDefinition(actionDefinition(integrationId, action)),
  );
}

export function buildIntegrationToolBridgeAdapter(): IntegrationToolBridgeAdapter {
  return {
    async listToolDefinitions(context, integrationId) {
      return buildDefinitions(context, integrationId);
    },

    async invokeThroughRuntime(request: IntegrationExecutionRequest): Promise<IntegrationExecutionResult> {
      assertExecutionContext(request.context);
      await assertIntegrationCapability(request.context, request.integrationId);

      const actions = await getIntegrationActions(request.integrationId);
      const action = actions.find((candidate) => candidate.name === request.actionName);
      if (!action) {
        return {
          ok: false,
          error: {
            code: "UNKNOWN_ACTION",
            message: `Unknown integration action: ${request.integrationId}/${request.actionName}`,
          },
        };
      }

      const definition = buildIntegrationToolDefinition(
        actionDefinition(request.integrationId, action),
      );
      const runtime = getClaraToolRuntime();
      if (!runtime.hasTool(definition.name)) {
        runtime.registerTool(definition);
      }

      const outcome = await runtime.invoke(
        definition.name,
        request.input,
        request.context,
      );

      if (!outcome.ok) {
        return {
          ok: false,
          error: {
            code: outcome.error.code === "INVALID_ARGUMENTS"
              ? "INVALID_ARGUMENTS"
              : outcome.error.code === "TENANT_SCOPE_VIOLATION"
                ? "UNAUTHORIZED"
                : "EXECUTION_FAILED",
            message: outcome.error.message,
          },
        };
      }

      return { ok: true, output: outcome.data };
    },
  };
}

/**
 * Registers all currently connected integration actions into the existing
 * runtime. Registration is idempotent and deliberately does not expose
 * credential material or create another execution engine.
 */
export async function registerConnectedIntegrationTools(
  context: PlatformExecutionContext,
  runtime: ToolRuntime = getClaraToolRuntime(),
): Promise<readonly string[]> {
  const rows = await query<{ integration_id: string }>(
    `SELECT DISTINCT ic.integration_id
       FROM integration_connections ic
       INNER JOIN organisation_integrations oi
         ON oi.org_id=ic.org_id AND oi.integration_id=ic.integration_id AND oi.enabled=TRUE
       INNER JOIN platform_integrations pi
         ON pi.integration_id=ic.integration_id AND pi.enabled=TRUE
       INNER JOIN agent_integrations ai
         ON ai.integration_id=ic.integration_id AND ai.agent_id=$2 AND ai.enabled=TRUE
       INNER JOIN agents a ON a.id=ai.agent_id AND a.org_id=$1
      WHERE ic.org_id=$1
        AND ic.status='active'
        AND (ic.agent_id=$2 OR ic.agent_id IS NULL)
        AND (ic.user_id=$3 OR ic.user_id IS NULL)`,
    [context.tenantId, context.agentId ?? null, context.userId],
  );

  const registered: string[] = [];
  for (const row of rows) {
    const definitions = await buildDefinitions(context, row.integration_id);
    for (const definition of definitions) {
      if (!runtime.hasTool(definition.name)) {
        runtime.registerTool(definition);
      }
      registered.push(definition.name);
    }
  }
  return registered;
}
