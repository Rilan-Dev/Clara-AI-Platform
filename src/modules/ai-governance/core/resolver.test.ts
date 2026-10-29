/**
 * src/modules/ai-governance/core/resolver.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Capability resolver contract (implementation plan §4 / migration §20):
 *
 *   Platform provider (configured + enabled + healthy + supports capability)
 *     → Subscription entitlement
 *       → Agent capability
 *         → Available provider/model list
 *
 * The resolver must NEVER return: disabled providers, providers without
 * credentials, unavailable models, non-entitled capabilities.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const registryState = {
  providers: [] as Array<Record<string, unknown>>,
  defaults: [] as Array<Record<string, unknown>>,
  defaultModels: [] as Array<Record<string, unknown>>,
};

vi.mock("@/modules/ai-governance/core/registry-db", () => ({
  getPlatformAIRegistry: vi.fn(async () => registryState),
  syncLiveProviderCatalog: vi.fn(async () => {}),
  listProviderModels: vi.fn(async (providerId: string, capability?: string) => {
    const provider = registryState.providers.find((p) => p.providerId === providerId) as
      | { providerId: string; models?: Array<Record<string, unknown>> }
      | undefined;
    return (provider?.models ?? []).filter((m) => !capability || m.capability === capability);
  }),
}));

const entitlementState = {
  entitlements: null as Record<string, unknown> | null,
};

vi.mock("@/modules/ai-governance/core/entitlements-db", () => ({
  resolvePlanAIEntitlements: vi.fn(async () => entitlementState.entitlements),
}));

vi.mock("@/modules/organisations/core/agent-ai-settings-db", () => ({
  getAgentAISettings: vi.fn(async () => null),
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getAssistantConfigByAgent: vi.fn(async () => null),
}));

import { resolveAvailableAIOptions, validateAgentAISelection } from "./resolver";
import type { PlatformAIProvider } from "./types";

function makeProvider(overrides: Partial<PlatformAIProvider> & { providerId: string }): PlatformAIProvider {
  return {
    displayName: overrides.providerId,
    description: null,
    enabled: true,
    configured: true,
    capabilities: [
      { capability: "chat", supported: true },
      { capability: "voice_chat", supported: false },
      { capability: "realtime_voice", supported: true },
    ],
    health: null,
    monthlyBudgetUsd: null,
    warningThresholdPct: 80,
    credential: null,
    modelCounts: {},
    ...overrides,
  } as PlatformAIProvider;
}

function setProviders(providers: PlatformAIProvider[], defaults: Array<{ capability: string; providerId: string | null; modelId: string | null }> = []) {
  registryState.providers = providers.map((p) => ({
    ...p,
    capabilities: p.capabilities,
    models: [
      { providerId: p.providerId, capability: "chat", kind: "chat", modelId: "m-chat-1", displayName: "Chat Model", enabled: true, isDefault: true, metadata: { catalogSource: "vendor_live" } },
      { providerId: p.providerId, capability: "chat", kind: "embedding", modelId: "m-embed-1", displayName: "Embedding", enabled: true, isDefault: false, metadata: { catalogSource: "vendor_live" } },
      { providerId: p.providerId, capability: "realtime_voice", kind: "realtime", modelId: "m-rt-1", displayName: "Realtime Model", enabled: true, isDefault: true, metadata: { catalogSource: "vendor_live" } },
      { providerId: p.providerId, capability: "realtime_voice", kind: "voice", modelId: "voice-a", displayName: "Voice A", enabled: true, isDefault: false, metadata: { catalogSource: "vendor_live" } },
      { providerId: p.providerId, capability: "realtime_voice", kind: "voice", modelId: "voice-disabled", displayName: "Disabled voice", enabled: false, isDefault: false, metadata: { catalogSource: "vendor_live" } },
    ],
  }));
  (registryState as Record<string, unknown>).defaults = defaults;
}

beforeEach(() => {
  registryState.providers = [];
  entitlementState.entitlements = null;
});

describe("resolveAvailableAIOptions", () => {
  it("returns only providers that are enabled, configured, healthy and capability-supporting", async () => {
    setProviders([
      makeProvider({ providerId: "openai" }),
      makeProvider({ providerId: "sarvam", enabled: false }),
      makeProvider({ providerId: "gemini", configured: false }),
      makeProvider({ providerId: "elevenlabs", health: { providerId: "elevenlabs", status: "down", latencyMs: null, errorMessage: null, checkedAt: null, checkedBy: null } }),
    ]);
    const result = await resolveAvailableAIOptions({ organizationId: "org-1", capability: "chat" });
    expect(result.available.map((p) => p.providerId)).toEqual(["openai"]);
    expect(result.blocked.map((b) => `${b.providerId}:${b.reason}`)).toEqual([
      "sarvam:provider_disabled",
      "gemini:provider_not_configured",
      "elevenlabs:provider_unhealthy",
    ]);
  });

  it("filters providers whose adapter does not support the capability", async () => {
    const provider = makeProvider({ providerId: "openai" });
    provider.capabilities = [
      { capability: "chat", supported: true },
      { capability: "voice_chat", supported: false },
      { capability: "realtime_voice", supported: true },
    ];
    setProviders([provider]);
    const voiceChat = await resolveAvailableAIOptions({ organizationId: "org-1", capability: "voice_chat" });
    expect(voiceChat.available).toEqual([]);
    expect(voiceChat.blocked[0]!.reason).toBe("provider_capability_unsupported");
  });

  it("applies plan entitlements — non-entitled capability hides every provider", async () => {
    setProviders([makeProvider({ providerId: "openai" })]);
    entitlementState.entitlements = {
      planId: "free",
      planName: "Free",
      capabilities: { chat: true, voice_chat: true, realtime_voice: false },
      allowedProviders: { openai: true, gemini: true, sarvam: true, elevenlabs: true },
      modelExceptions: [],
    };
    const result = await resolveAvailableAIOptions({ organizationId: "org-1", capability: "realtime_voice" });
    expect(result.available).toEqual([]);
    expect(result.blocked[0]!.reason).toBe("plan_not_entitled");
    expect(result.entitlement.capabilityEnabled).toBe(false);
    expect(result.entitlement.planName).toBe("Free");
  });

  it("applies provider-level entitlements", async () => {
    setProviders([makeProvider({ providerId: "openai" }), makeProvider({ providerId: "sarvam" })]);
    entitlementState.entitlements = {
      planId: "pro",
      planName: "Pro",
      capabilities: { chat: true, voice_chat: true, realtime_voice: true },
      allowedProviders: { openai: true, gemini: true, sarvam: false, elevenlabs: true },
      modelExceptions: [],
    };
    const result = await resolveAvailableAIOptions({ organizationId: "org-1", capability: "chat" });
    expect(result.available.map((p) => p.providerId)).toEqual(["openai"]);
    expect(result.blocked.find((b) => b.providerId === "sarvam")!.reason).toBe("plan_provider_not_allowed");
  });

  it("returns only ENABLED models and excludes model entitlement exceptions", async () => {
    setProviders([makeProvider({ providerId: "openai" })]);
    entitlementState.entitlements = {
      planId: "pro",
      planName: "Pro",
      capabilities: { chat: true, voice_chat: true, realtime_voice: true },
      allowedProviders: { openai: true, gemini: true, sarvam: true, elevenlabs: true },
      modelExceptions: [
        { providerId: "openai", capability: "chat", kind: "chat", modelId: "m-chat-1", allowed: false },
      ],
    };
    const chat = await resolveAvailableAIOptions({ organizationId: "org-1", capability: "chat" });
    // Every chat model is blocked by the entitlement exception → the provider
    // has nothing selectable on the chat surface and must be blocked outright
    // (never offered as an empty picker entry).
    expect(chat.available).toHaveLength(0);
    expect(chat.blocked.find((b) => b.providerId === "openai")!.reason).toBe("provider_no_models");

    const realtime = await resolveAvailableAIOptions({ organizationId: "org-1", capability: "realtime_voice" });
    // voice-disabled must never appear; enabled realtime model + voices do.
    const voiceIds = realtime.available[0]!.voices.map((v) => v.modelId);
    expect(voiceIds).toEqual(["voice-a"]);
    expect(realtime.available[0]!.models.map((m) => m.modelId)).toEqual(["m-rt-1"]);
  });

  it("marks the default provider per capability", async () => {
    setProviders(
      [makeProvider({ providerId: "openai" }), makeProvider({ providerId: "sarvam" })],
      [{ capability: "chat", providerId: "sarvam", modelId: null }],
    );
    const result = await resolveAvailableAIOptions({ organizationId: "org-1", capability: "chat" });
    expect(result.available.find((p) => p.providerId === "sarvam")!.isDefault).toBe(true);
    expect(result.available.find((p) => p.providerId === "openai")!.isDefault).toBe(false);
  });

  it("includes sts (speech-to-speech) and stt models in the realtime_voice options", async () => {
    // Regression: the realtime modelKinds list omitted 'sts', so the curated
    // ElevenLabs conversational rows existed in the catalogue but never
    // reached the agent model pickers — the realtime voice model selection
    // showed TTS models only.
    setProviders([makeProvider({ providerId: "openai" })]);
    (registryState.providers[0] as { models: Array<Record<string, unknown>> }).models.push(
      { providerId: "openai", capability: "realtime_voice", kind: "sts", modelId: "eleven_v3_conversational", displayName: "Eleven v3 Conversational", enabled: true, isDefault: false, metadata: { catalogSource: "vendor_live" } },
      { providerId: "openai", capability: "realtime_voice", kind: "stt", modelId: "scribe_v2_realtime", displayName: "Scribe v2 Realtime", enabled: true, isDefault: false, metadata: { catalogSource: "vendor_live" } },
      { providerId: "openai", capability: "realtime_voice", kind: "sts", modelId: "sts-disabled", displayName: "Disabled STS", enabled: false, isDefault: false, metadata: { catalogSource: "vendor_live" } },
    );
    const result = await resolveAvailableAIOptions({ organizationId: "org-1", capability: "realtime_voice" });
    const models = result.available[0]!.models.map((m) => `${m.kind}:${m.modelId}`).sort();
    expect(models).toContain("sts:eleven_v3_conversational");
    expect(models).toContain("stt:scribe_v2_realtime");
    expect(models).toContain("realtime:m-rt-1");
    expect(models).not.toContain("sts:sts-disabled"); // disabled rows never resolve
  });
  it("never offers embedding models as chat options (chat lists stay kind-pure)", async () => {
    // Production regression: the OpenAI chat list showed "107 applicable
    // models for Chat" = 104 chat + 3 embedding. Embedding models cannot
    // generate text and must never be selectable as a chat LLM.
    setProviders([makeProvider({ providerId: "openai" })]);
    const chat = await resolveAvailableAIOptions({ organizationId: "org-1", capability: "chat" });
    expect(chat.available[0]!.models.map((m) => m.kind)).toEqual(["chat"]);
    expect(chat.available[0]!.models.map((m) => m.modelId)).toEqual(["m-chat-1"]);
  });

  it("blocks an embeddings-only provider on the chat surface instead of listing it with no chat models", async () => {
    // Production regression: the local Qwen provider (chat capability TRUE
    // from migration 076, embedding model rows only) appeared in the chat
    // provider picker even though Qwen3-Embedding-0.6B cannot generate text.
    setProviders([makeProvider({ providerId: "qwen" })]);
    const qwen = registryState.providers[0] as { models: Array<Record<string, unknown>> };
    qwen.models = qwen.models.filter((m) => m.kind === "embedding");
    const chat = await resolveAvailableAIOptions({ organizationId: "org-1", capability: "chat" });
    expect(chat.available).toHaveLength(0);
    expect(chat.blocked.find((b) => b.providerId === "qwen")!.reason).toBe("provider_no_models");
  });
});

describe("validateAgentAISelection (runtime gate)", () => {
  it("rejects disabled providers with an actionable reason", async () => {
    setProviders([makeProvider({ providerId: "sarvam", enabled: false })]);
    const result = await validateAgentAISelection({ organizationId: "org-1", provider: "sarvam", capability: "chat" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_DISABLED");
  });

  it("rejects non-entitled capabilities at runtime", async () => {
    setProviders([makeProvider({ providerId: "openai" })]);
    entitlementState.entitlements = {
      planId: "free",
      planName: "Free",
      capabilities: { chat: true, voice_chat: false, realtime_voice: false },
      allowedProviders: {},
      modelExceptions: [],
    };
    const result = await validateAgentAISelection({ organizationId: "org-1", provider: "openai", capability: "realtime_voice" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PLAN_NOT_ENTITLED");
  });

  it("passes known providers when the registry is not yet populated only when the current plan allows them", async () => {
    setProviders([]);
    entitlementState.entitlements = {
      planId: "pro",
      planName: "Pro",
      capabilities: { chat: true, voice_chat: true, realtime_voice: true },
      allowedProviders: { openai: true, gemini: true, sarvam: true, elevenlabs: true },
      modelExceptions: [],
    };
    const result = await validateAgentAISelection({ organizationId: "org-1", provider: "openai", capability: "chat" });
    expect(result.ok).toBe(true);
  });

  it("does not let a missing provider-registry row bypass current subscription entitlements", async () => {
    setProviders([]);
    entitlementState.entitlements = {
      planId: "starter",
      planName: "Starter",
      capabilities: { chat: true, voice_chat: true, realtime_voice: true },
      allowedProviders: { openai: true, gemini: true, sarvam: false, elevenlabs: false },
      modelExceptions: [],
    };
    const result = await validateAgentAISelection({ organizationId: "org-1", provider: "sarvam", capability: "chat" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PLAN_PROVIDER_NOT_ALLOWED");
  });

  it("rejects unknown provider ids outright", async () => {
    setProviders([]);
    const result = await validateAgentAISelection({ organizationId: "org-1", provider: "mystery-vendor", capability: "chat" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_UNKNOWN");
  });
});
