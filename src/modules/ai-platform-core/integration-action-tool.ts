import { z } from "zod";
import { query } from "@/lib/db";
import { resolveOrgPlanLimits } from "@/lib/plan-guard";
import { getIntegration } from "@/modules/integrations/registry";
import { runAction } from "@/modules/integrations/runtime/runner-core";
import { ToolExecutionError } from "./tool-contracts";
import type { PlatformExecutionContext } from "./contracts";
import type { ToolDefinition } from "./tool-contracts";

const inputSchema = z.object({
  integrationId: z.string().min(1),
  actionName: z.string().min(1),
  props: z.record(z.string(), z.unknown()).default({}),
}).strip();

export function buildIntegrationActionTool(): ToolDefinition {
  return {
    name: "integration_action",
    description: "Execute an action on an organisation integration that this agent is explicitly allowed to use. Use integration_availability first when you need to discover available actions.",
    inputSchema: inputSchema,
    authorization: {
      allowedSurfaces: ["chat", "realtime", "embed"],
      requiredPermission: null,
      requiredCapability: null,
      requireUserId: true,
      requireSessionId: false,
    },
    async execute(raw, context: PlatformExecutionContext) {
      if (!context.userId || !context.agentId) {
        throw new ToolExecutionError(
          "MISSING_CONTEXT_IDENTITY",
          "Integration actions require tenant, agent, and user identity.",
        );
      }
      const input = raw as { integrationId:string; actionName:string; props:Record<string,unknown> };
      const def = getIntegration(input.integrationId);
      if (!def) throw new ToolExecutionError("UNKNOWN_TOOL", `Unknown integration: ${input.integrationId}`);

      const platform = (await query<{enabled:boolean;allowed_plans:string[]}>(
        "SELECT enabled, allowed_plans FROM platform_integrations WHERE integration_id=$1",
        [input.integrationId],
      ))[0];
      if (!platform?.enabled) throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", `Integration ${def.displayName} is disabled by the platform administrator.`);

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

      const grant = (await query<{enabled:boolean}>(
        "SELECT enabled FROM organisation_integrations WHERE org_id=$1 AND integration_id=$2",
        [context.tenantId, input.integrationId],
      ))[0];
      if (!grant?.enabled) throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", `${def.displayName} is not enabled for this organisation.`);

      const agentGrant = (await query<{enabled:boolean}>(        "SELECT ai.enabled FROM agent_integrations ai INNER JOIN agents a ON a.id=ai.agent_id WHERE ai.agent_id=$1 AND a.org_id=$2 AND ai.integration_id=$3",
        [context.agentId ?? null, context.tenantId, input.integrationId],
      ))[0];
      if (!context.agentId || !agentGrant?.enabled) {
        throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", `${def.displayName} is not enabled for this agent.`);
      }

      // Readiness must use the same tenant/user/agent credential scope as the
      // runner. Without the user predicate, another user's connection could
      // make this AI tool report a credential as ready even though runAction
      // would correctly deny the current user's credential lookup.
      const connection = (await query<{id:string}>(
        "SELECT id FROM integration_connections WHERE org_id=$1 AND integration_id=$2 AND status='active' AND (agent_id=$3 OR agent_id IS NULL) AND (user_id=$4 OR user_id IS NULL) ORDER BY CASE WHEN agent_id=$3 THEN 0 ELSE 1 END, CASE WHEN user_id=$4 THEN 0 ELSE 1 END, updated_at DESC LIMIT 1",
        [context.tenantId, input.integrationId, context.agentId, context.userId],
      ))[0];
      if (!connection && def.authType !== "none") {
        throw new ToolExecutionError("EXECUTION_FAILED", `${def.displayName} is enabled but has no active connection.`);
      }

      const result = await runAction({
        workspaceId: context.tenantId,
        agentId: context.agentId,
        userId: context.userId!,
        integrationId: input.integrationId,
        actionName: input.actionName,
        props: input.props,
      });
      if (!result.success) {
        throw new ToolExecutionError(
          "EXECUTION_FAILED",
          result.error ?? `Integration action failed: ${input.actionName}`,
          {
            integrationId: input.integrationId,
            actionName: input.actionName,
            ...(result.errorCode ? { runnerErrorCode: result.errorCode } : {}),
            ...(result.retryable !== undefined ? { retryable: result.retryable } : {}),
          },
        );
      }
      return result.output;
    },
  };
}
