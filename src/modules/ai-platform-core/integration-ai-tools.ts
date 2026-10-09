import { z } from "zod";
import { query } from "@/lib/db";
import { resolveOrgPlanLimits } from "@/lib/plan-guard";
import { listIntegrations } from "@/modules/integrations/registry";
import type { PlatformExecutionContext } from "./contracts";
import type { ToolDefinition } from "./tool-contracts";

const input = z.object({ integrationId: z.string().min(1).optional() }).strip();

export function buildIntegrationAvailabilityTool(): ToolDefinition {
  return {
    name: "integration_availability",
    description: "List the third-party integrations enabled for this organisation and agent, including connection readiness and available actions.",
    inputSchema: input,
    authorization: {
      allowedSurfaces: ["chat", "realtime", "embed"],
      requiredPermission: null,
      requiredCapability: null,
      requireUserId: true,
      requireSessionId: false,
    },
    async execute(raw, context: PlatformExecutionContext) {
      // Availability is identity-scoped: never use a placeholder agent ID or
      // allow a shared connection to substitute for missing caller provenance.
      if (!context.userId || !context.agentId) return [];
      const value = raw as { integrationId?: string };
      let limits: Awaited<ReturnType<typeof resolveOrgPlanLimits>>;
      try {
        limits = await resolveOrgPlanLimits(context.tenantId);
      } catch {
        // Availability is capability discovery; do not expose integration names
        // when the organisation entitlement cannot be authoritatively resolved.
        return [];
      }
      const rows = await query<{integration_id:string;enabled:boolean;allowed_plans:string[]}>(`
        SELECT ai.integration_id, ai.enabled, pi.allowed_plans
        FROM agent_integrations ai
        INNER JOIN agents a
          ON a.id = ai.agent_id
         AND a.org_id = $2
        JOIN organisation_integrations oi
          ON oi.org_id = $2
         AND oi.integration_id = ai.integration_id
         AND oi.enabled = TRUE
        JOIN platform_integrations pi
          ON pi.integration_id = ai.integration_id
         AND pi.enabled = TRUE
        WHERE ai.agent_id = $1
          AND ai.enabled = TRUE
      `, [context.agentId, context.tenantId]);
      // Connection readiness is user-sensitive, so availability requires user-scoped readiness.
      const connected = await query<{integration_id:string}>(`
        SELECT DISTINCT integration_id
        FROM integration_connections
        WHERE org_id = $1
          AND status = 'active'
          AND (agent_id = $2 OR agent_id IS NULL)
          AND (user_id = $3 OR user_id IS NULL)
      `, [context.tenantId, context.agentId, context.userId]);

      const allowed = new Set(
        rows
          .filter(r => Array.isArray(r.allowed_plans) && (r.allowed_plans.includes(limits.plan_id) || r.allowed_plans.includes("*")))
          .map(r => r.integration_id),
      );
      const ready = new Set(connected.map(r => r.integration_id));

      return listIntegrations()
        .filter(def => !value.integrationId || def.id === value.integrationId)
        .filter(def => allowed.has(def.id))
        .map(def => ({
          id: def.id,
          name: def.displayName,
          description: def.description,
          connected: ready.has(def.id),
          actions: def.actions,
          help: ready.has(def.id)
            ? `Use the connected ${def.displayName} integration through its supported actions.`
            : `${def.displayName} is enabled for this agent but still needs credentials connected.`,
        }));
    },
  };
}