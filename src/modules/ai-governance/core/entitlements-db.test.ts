import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  subscriptions: [] as Row[],
  plans: {} as Record<string, Row>,
  capabilities: {} as Record<string, Row[]>,
  providers: {} as Record<string, Row[]>,
  models: {} as Record<string, Row[]>,
  providerMatrixConfigured: true,
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn(async (rawSql: string, params?: unknown[]) => {
    const sql = rawSql.replace(/\\s+/g, " ");
    if (sql.includes("FROM org_subscriptions os")) return state.subscriptions;
    if (sql.includes("FROM subscription_plans")) {
      const planId = String(params?.[0] ?? "free");
      return state.plans[planId] ? [state.plans[planId]] : [];
    }
    if (sql.includes("SELECT EXISTS (SELECT 1 FROM plan_ai_provider_entitlements)")) {
      return [{ matrix_configured: state.providerMatrixConfigured }];
    }
    if (sql.includes("FROM plan_ai_capabilities")) return state.capabilities[String(params?.[0])] ?? [];
    if (sql.includes("FROM plan_ai_provider_entitlements")) return state.providers[String(params?.[0])] ?? [];
    if (sql.includes("FROM plan_ai_model_entitlements")) return state.models[String(params?.[0])] ?? [];
    throw new Error(`Unexpected entitlement query: ${sql}`);
  }),
}));

import { resolvePlanAIEntitlements } from "./entitlements-db";

function provider(providerId: string, allowed: boolean): Row {
  return { ent_provider: providerId, ent_allowed: allowed };
}

function capability(capabilityId: string, enabled: boolean): Row {
  return { capability: capabilityId, cap_enabled: enabled };
}

beforeEach(() => {
  state.subscriptions = [];
  state.plans = {
    free: { plan_id: "free", plan_name: "Free", voice_enabled: false },
    starter: { plan_id: "starter", plan_name: "Starter", voice_enabled: true },
    pro: { plan_id: "pro", plan_name: "Pro", voice_enabled: true },
  };
  state.capabilities = {
    free: [
      capability("chat", true),
      capability("voice_chat", false),
      capability("realtime_voice", false),
    ],
    starter: [
      capability("chat", true),
      capability("voice_chat", true),
      capability("realtime_voice", true),
    ],
    pro: [
      capability("chat", true),
      capability("voice_chat", true),
      capability("realtime_voice", true),
    ],
  };
  state.providers = {
    free: [provider("openai", true), provider("gemini", true), provider("sarvam", false), provider("elevenlabs", false)],
    starter: [provider("openai", true), provider("gemini", true), provider("sarvam", false), provider("elevenlabs", false)],
    pro: [provider("openai", true), provider("gemini", true), provider("sarvam", true), provider("elevenlabs", true)],
  };
  state.models = {};
  state.providerMatrixConfigured = true;
});

describe("resolvePlanAIEntitlements", () => {
  it("uses the current Starter subscription provider matrix instead of stale agent/org choices", async () => {
    state.subscriptions = [{
      plan_id: "starter",
      plan_name: "Starter",
      voice_enabled: true,
      sub_status: "active",
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    }];

    const result = await resolvePlanAIEntitlements("org-1");

    expect(result.planId).toBe("starter");
    expect(result.allowedProviders).toMatchObject({
      openai: true,
      gemini: true,
      sarvam: false,
      elevenlabs: false,
    });
  });

  it("uses Free capabilities after an expired Pro subscription instead of inheriting paid voice flags", async () => {
    state.subscriptions = [{
      plan_id: "pro",
      plan_name: "Pro",
      voice_enabled: true,
      sub_status: "active",
      current_period_end: new Date(Date.now() - 86_400_000).toISOString(),
    }];

    const result = await resolvePlanAIEntitlements("org-1");

    expect(result.planId).toBe("free");
    expect(result.planName).toBe("Free");
    expect(result.capabilities.voice_chat).toBe(false);
    expect(result.capabilities.realtime_voice).toBe(false);
    expect(result.allowedProviders.sarvam).toBe(false);
    expect(result.allowedProviders.elevenlabs).toBe(false);
  });

  it("defaults missing provider rows to denied once the provider entitlement matrix is active", async () => {
    state.subscriptions = [{
      plan_id: "starter",
      plan_name: "Starter",
      voice_enabled: true,
      sub_status: "active",
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    }];
    state.providers.starter = [provider("openai", true)];

    const result = await resolvePlanAIEntitlements("org-1");

    expect(result.allowedProviders.openai).toBe(true);
    expect(result.allowedProviders.sarvam).toBe(false);
    expect(result.allowedProviders.elevenlabs).toBe(false);
  });

  it("retains legacy compatibility only while the provider entitlement matrix is completely empty", async () => {
    state.providerMatrixConfigured = false;
    state.providers = { free: [], starter: [], pro: [] };
    state.subscriptions = [{
      plan_id: "starter",
      plan_name: "Starter",
      voice_enabled: true,
      sub_status: "active",
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    }];

    const result = await resolvePlanAIEntitlements("org-1");

    expect(result.allowedProviders).toEqual({
      openai: true,
      gemini: true,
      sarvam: true,
      elevenlabs: true,
    });
  });
});