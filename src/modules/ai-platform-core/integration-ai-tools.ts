import { z } from "zod";
import { isPlatformFeatureEnabled } from "@/lib/feature-availability";
import { query } from "@/lib/db";
import { resolveOrgPlanLimits } from "@/lib/plan-guard";
import { listIntegrations } from "@/modules/integrations/registry";
import { getIntegrationActions } from "@/modules/integrations/runtime/runner-core";
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
      if (!isPlatformFeatureEnabled("integrations")) return [];
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
      const connectionRows = await query<{integration_id:string;status:"active"|"expired"|"error"|"revoked"}>(`
        SELECT integration_id, status
        FROM integration_connections
        WHERE org_id = $1
          AND status IN ('active', 'expired', 'error', 'revoked')
          AND (agent_id = $2 OR agent_id IS NULL)
          AND (user_id = $3 OR user_id IS NULL)
        ORDER BY updated_at DESC
      `, [context.tenantId, context.agentId, context.userId]);

      const allowed = new Set(
        rows
          .filter(r => Array.isArray(r.allowed_plans) && (r.allowed_plans.includes(limits.plan_id) || r.allowed_plans.includes("*")))
          .map(r => r.integration_id),
      );
      const connectionStatusById = new Map<string, "active"|"expired"|"error"|"revoked">();
      const priority = { active: 4, expired: 3, error: 2, revoked: 1 } as const;
      for (const row of connectionRows) {
        const previous = connectionStatusById.get(row.integration_id);
        if (!previous || priority[row.status] > priority[previous]) {
          connectionStatusById.set(row.integration_id, row.status);
        }
      }

      return Promise.all(listIntegrations()
        .filter(def => !value.integrationId || def.id === value.integrationId)
        .filter(def => allowed.has(def.id))
        .map(async def => {
          const status = connectionStatusById.get(def.id) ?? "disconnected";
          const connected = status === "active";
          // Advertise only actions that the runtime can actually resolve from
          // the registry/package boundary. Raw registry names may be hidden or
          // absent from the installed piece package.
          let actionNames: string[] = [];
          try {
            actionNames = (await getIntegrationActions(def.id)).map(action => action.name);
          } catch {
            actionNames = [];
          }
          const help = status === "active"
            ? actionNames.length > 0
              ? `Use the connected ${def.displayName} integration through its supported actions.`
              : `${def.displayName} is connected, but no supported actions could be loaded right now.`
            : status === "expired"
              ? `${def.displayName} connection expired; reconnect the provider account before running actions.`
              : status === "error"
                ? `${def.displayName} connection needs attention; reconnect or update credentials.`
                : status === "revoked"
                  ? `${def.displayName} connection was revoked; reconnect to restore access.`
                  : `${def.displayName} is enabled for this agent but has no usable connection yet.`;
          return {
            id: def.id,
            name: def.displayName,
            description: def.description,
            connected,
            connectionStatus: status,
            actions: actionNames,
            help,
          };
        }));
    },
  };
}