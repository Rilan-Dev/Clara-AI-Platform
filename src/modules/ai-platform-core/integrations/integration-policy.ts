import { query, type QueryResultRow } from "@/lib/db";
import { resolveOrgPlanLimits } from "@/lib/plan-guard";
import { getIntegration } from "@/modules/integrations/registry";
import type { PlatformExecutionContext } from "../contracts";
import { ToolExecutionError } from "../tool-contracts";

async function authorizationQuery<T extends QueryResultRow>(sql: string, params: unknown[], purpose: string): Promise<T[]> {
  try {
    return await query<T>(sql, params);
  } catch {
    // Do not expose SQL, schema, or driver error details to model/tool callers.
    throw new ToolExecutionError("AUTHORIZATION_UNAVAILABLE", `${purpose} could not be verified.`);
  }
}

/**
 * The single Clara-owned capability policy for integration discovery and
 * invocation. Call before advertising actions and again before execution;
 * the runner repeats the security-critical checks at the credential boundary.
 */
export async function assertIntegrationCapability(
  context: PlatformExecutionContext,
  integrationId: string,
): Promise<void> {
  if (!context.userId || !context.agentId) {
    throw new ToolExecutionError(
      "MISSING_CONTEXT_IDENTITY",
      "Integration capability checks require tenant, agent, and user identity.",
    );
  }

  const def = getIntegration(integrationId);
  if (!def) throw new ToolExecutionError("UNKNOWN_TOOL", `Unknown integration: ${integrationId}`);

  const platform = (await authorizationQuery<{ enabled: boolean; allowed_plans: string[] }>(
    "SELECT enabled, allowed_plans FROM platform_integrations WHERE integration_id=$1",
    [integrationId],
    "Platform integration policy",
  ))[0];
  if (!platform?.enabled) {
    throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", `Integration ${def.displayName} is disabled by the platform administrator.`);
  }

  let limits: Awaited<ReturnType<typeof resolveOrgPlanLimits>>;
  try {
    limits = await resolveOrgPlanLimits(context.tenantId);
  } catch {
    throw new ToolExecutionError("AUTHORIZATION_UNAVAILABLE", "Integration plan entitlement could not be verified.");
  }
  if (
    !Array.isArray(platform.allowed_plans) ||
    (!platform.allowed_plans.includes(limits.plan_id) && !platform.allowed_plans.includes("*"))
  ) {
    throw new ToolExecutionError("PLAN_NOT_ENTITLED", `The ${limits.plan_name ?? limits.plan_id} plan cannot use ${def.displayName}.`);
  }

  const grant = (await authorizationQuery<{ enabled: boolean }>(
    "SELECT enabled FROM organisation_integrations WHERE org_id=$1 AND integration_id=$2",
    [context.tenantId, integrationId],
    "Organisation integration grant",
  ))[0];
  if (!grant?.enabled) {
    throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", `${def.displayName} is not enabled for this organisation.`);
  }

  const agentGrant = (await authorizationQuery<{ enabled: boolean }>(
    "SELECT ai.enabled FROM agent_integrations ai INNER JOIN agents a ON a.id=ai.agent_id WHERE ai.agent_id=$1 AND a.org_id=$2 AND ai.integration_id=$3",
    [context.agentId, context.tenantId, integrationId],
    "Agent integration grant",
  ))[0];
  if (!agentGrant?.enabled) {
    throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", `${def.displayName} is not enabled for this agent.`);
  }

  if (def.authType !== "none") {
    const connection = (await authorizationQuery<{ id: string }>(
      "SELECT id FROM integration_connections WHERE org_id=$1 AND integration_id=$2 AND status='active' AND (agent_id=$3 OR agent_id IS NULL) AND (user_id=$4 OR user_id IS NULL) ORDER BY CASE WHEN agent_id=$3 THEN 0 ELSE 1 END, CASE WHEN user_id=$4 THEN 0 ELSE 1 END, updated_at DESC LIMIT 1",
      [context.tenantId, integrationId, context.agentId, context.userId],
      "Integration connection readiness",
    ))[0];
    if (!connection) {
      throw new ToolExecutionError("EXECUTION_FAILED", `${def.displayName} is enabled but has no active connection.`);
    }
  }
}
