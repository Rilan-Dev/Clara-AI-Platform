/**
 * src/modules/ai-governance/core/entitlements-db.ts
 * Subscription-plan AI entitlement resolution.
 *
 * The current subscription is the authority. Provider/model/capability rows
 * are fetched independently: joining all three matrices creates a Cartesian
 * product that can be truncated and accidentally turn missing entitlements
 * into implicit permission.
 */

import { query } from "@/lib/db";
import type { AICapability, GovernanceProviderId, PlanAIEntitlements } from "./types";

type Row = Record<string, unknown>;
type Plan = { planId: string; planName: string; voiceEnabled: boolean };

const PROVIDER_IDS: GovernanceProviderId[] = ["openai", "gemini", "sarvam", "elevenlabs", "qwen"];

async function getFreePlan(): Promise<Plan> {
  const rows = await query<Row>(
    `SELECT id AS plan_id, name AS plan_name, voice_enabled
       FROM subscription_plans
      WHERE id = 'free'
      LIMIT 1`,
  );
  const row = rows[0];
  return row
    ? {
        planId: String(row.plan_id),
        planName: String(row.plan_name),
        voiceEnabled: Boolean(row.voice_enabled),
      }
    : { planId: "free", planName: "Free", voiceEnabled: false };
}

/** Resolve the effective AI entitlements for the organisation's current plan. */
export async function resolvePlanAIEntitlements(orgId: string): Promise<PlanAIEntitlements> {
  const subscriptions = await query<Row>(
    `SELECT sp.id AS plan_id, sp.name AS plan_name, sp.voice_enabled,
            os.status AS sub_status, os.current_period_end
       FROM org_subscriptions os
       JOIN subscription_plans sp ON sp.id = os.plan_id
      WHERE os.org_id = $1
      ORDER BY os.updated_at DESC
      LIMIT 1`,
    [orgId],
  );

  let plan: Plan;
  const subscription = subscriptions[0];
  if (!subscription) {
    plan = await getFreePlan();
  } else {
    const periodEnd = subscription.current_period_end
      ? new Date(String(subscription.current_period_end)).getTime()
      : null;
    const expired = periodEnd !== null && periodEnd < Date.now();
    const goodStanding =
      (subscription.sub_status === "active" || subscription.sub_status === "trialing") &&
      !expired;

    // Expired, past-due, cancelled, or otherwise non-active subscriptions
    // receive the actual Free plan's entitlements—not paid-plan fallback flags.
    plan = goodStanding
      ? {
          planId: String(subscription.plan_id),
          planName: String(subscription.plan_name),
          voiceEnabled: Boolean(subscription.voice_enabled),
        }
      : await getFreePlan();
  }

  return loadPlanEntitlements(plan);
}

async function loadPlanEntitlements(plan: Plan): Promise<PlanAIEntitlements> {
  const [capabilityRows, providerRows, modelRows, matrixState] = await Promise.all([
    query<Row>(
      `SELECT capability, enabled AS cap_enabled
         FROM plan_ai_capabilities
        WHERE plan_id = $1`,
      [plan.planId],
    ),
    query<Row>(
      `SELECT provider_id AS ent_provider, allowed AS ent_allowed
         FROM plan_ai_provider_entitlements
        WHERE plan_id = $1`,
      [plan.planId],
    ),
    query<Row>(
      `SELECT provider_id AS m_provider, capability AS m_capability,
              kind AS m_kind, model_id AS m_model, allowed AS m_allowed
         FROM plan_ai_model_entitlements
        WHERE plan_id = $1`,
      [plan.planId],
    ),
    query<Row>(
      `SELECT EXISTS (SELECT 1 FROM plan_ai_capabilities) AS capability_matrix_configured,
              EXISTS (SELECT 1 FROM plan_ai_provider_entitlements) AS provider_matrix_configured,
              EXISTS (SELECT 1 FROM plan_ai_model_entitlements) AS model_matrix_configured`,
    ),
  ]);

  const capabilities: PlanAIEntitlements["capabilities"] = {};
  for (const row of capabilityRows) {
    if (row.capability != null) {
      capabilities[String(row.capability) as AICapability] = Boolean(row.cap_enabled);
    }
  }

  // Legacy compatibility exists only before EITHER entitlement matrix has
  // been seeded. Once either matrix is active, an incomplete/missing row
  // must never grant access through an old plan.voice_enabled flag.
  const matrixConfigured =
    Boolean(matrixState[0]?.capability_matrix_configured) ||
    Boolean(matrixState[0]?.provider_matrix_configured) ||
    Boolean(matrixState[0]?.model_matrix_configured) ||
    capabilityRows.length > 0 ||
    providerRows.length > 0 ||
    modelRows.length > 0;
  if (!("chat" in capabilities)) capabilities.chat = !matrixConfigured;
  if (!("voice_chat" in capabilities)) capabilities.voice_chat = !matrixConfigured && plan.voiceEnabled;
  if (!("realtime_voice" in capabilities)) capabilities.realtime_voice = !matrixConfigured && plan.voiceEnabled;

  const allowedProviders: PlanAIEntitlements["allowedProviders"] = {};
  if (matrixConfigured) {
    // Explicit matrix mode is default-deny: a missing provider row is not an
    // entitlement. This also makes partial migrations safe.
    for (const provider of PROVIDER_IDS) allowedProviders[provider] = false;
  } else {
    // Bounded legacy compatibility only while the provider matrix is empty.
    for (const provider of PROVIDER_IDS) allowedProviders[provider] = true;
  }
  for (const row of providerRows) {
    const provider = String(row.ent_provider) as GovernanceProviderId;
    if (PROVIDER_IDS.includes(provider)) allowedProviders[provider] = Boolean(row.ent_allowed);
  }

  const modelExceptions: PlanAIEntitlements["modelExceptions"] = modelRows
    .filter((row) => row.m_provider != null && row.m_model != null)
    .map((row) => ({
      providerId: String(row.m_provider) as GovernanceProviderId,
      capability: String(row.m_capability) as AICapability,
      kind: String(row.m_kind) as PlanAIEntitlements["modelExceptions"][number]["kind"],
      modelId: String(row.m_model),
      allowed: Boolean(row.m_allowed),
    }));

  return {
    planId: plan.planId,
    planName: plan.planName,
    capabilities,
    allowedProviders,
    modelExceptions,
  };
}
