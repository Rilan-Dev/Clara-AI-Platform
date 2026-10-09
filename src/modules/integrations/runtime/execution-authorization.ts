import { query } from "@/lib/db";
import { resolveOrgPlanLimits } from "@/lib/plan-guard";
import { getIntegration } from "../registry";
import type { RunActionParams } from "./types.js";
import { integrationError } from "./error-normalization";

/**
 * Re-check integration authorization at the actual execution boundary.
 *
 * The AI-facing tool performs capability checks before calling runAction, but
 * plan/grant state can change between those two operations. Keeping the same
 * fail-closed checks inside the runner prevents stale authorization from
 * reaching an integration action and also protects any future direct runner
 * caller from bypassing the host authorization contract.
 */
export async function assertIntegrationExecutionAuthorized(
  params: Pick<RunActionParams, "integrationId" | "workspaceId" | "agentId">,
): Promise<void> {
  const def = getIntegration(params.integrationId);
  if (!def) {
    throw integrationError("UNKNOWN_INTEGRATION", `Unknown integration: ${params.integrationId}`);
  }

  const platform = (await query<{ enabled: boolean; allowed_plans: unknown }>(
    "SELECT enabled, allowed_plans FROM platform_integrations WHERE integration_id=$1",
    [params.integrationId],
  ))[0];

  if (!platform?.enabled) {
    throw integrationError("AUTHORIZATION_DENIED", `Integration ${def.displayName} is disabled by the platform administrator`);
  }

  // This is an authorization boundary: never use the UI-oriented helper that
  // falls back to free limits when plan resolution fails. A database/plan
  // resolution failure must deny execution rather than accidentally granting
  // access to an integration that the real plan may permit.
  let limits: Awaited<ReturnType<typeof resolveOrgPlanLimits>>;
  try {
    limits = await resolveOrgPlanLimits(params.workspaceId);
  } catch {
    throw integrationError("PLAN_NOT_ENTITLED", "Integration plan entitlement could not be verified");
  }
  if (
    !Array.isArray(platform.allowed_plans) ||
    (!platform.allowed_plans.includes(limits.plan_id) &&
      !platform.allowed_plans.includes("*"))
  ) {
    throw integrationError("PLAN_NOT_ENTITLED", `The current plan cannot use ${def.displayName}`);
  }

  const organisationGrant = (
    await query<{ enabled: boolean }>(
      "SELECT enabled FROM organisation_integrations WHERE org_id=$1 AND integration_id=$2",
      [params.workspaceId, params.integrationId],
    )
  )[0];

  if (!organisationGrant?.enabled) {
    throw integrationError("AUTHORIZATION_DENIED", `${def.displayName} is not enabled for this organisation`);
  }

  if (!params.agentId) {
    throw integrationError("AUTHORIZATION_DENIED", `${def.displayName} requires an explicitly scoped agent`);
  }

  const agentGrant = (
    await query<{ enabled: boolean }>(
      `SELECT ai.enabled
         FROM agent_integrations ai
         INNER JOIN agents a
           ON a.id=ai.agent_id
          AND a.org_id=$2
        WHERE ai.agent_id=$1 AND ai.integration_id=$3`,
      [params.agentId, params.workspaceId, params.integrationId],
    )
  )[0];

  if (!agentGrant?.enabled) {
    throw integrationError("AUTHORIZATION_DENIED", `${def.displayName} is not enabled for this agent`);
  }
}
