import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orgSettings: null as Record<string, unknown> | null,
  registry: null as Record<string, unknown> | null,
  governanceResult: { ok: true } as { ok: boolean; reason?: string },
  blockedModelId: null as string | null,
  blockedProvider: null as string | null,
}));

vi.mock("@/modules/organisations/core/db", () => ({
  getAgentById: vi.fn(async () => null),
}));
vi.mock("@/modules/organisations/core/ai-settings-db", () => ({
  getOrgAISettings: vi.fn(async () => mocks.orgSettings),
}));
vi.mock("@/modules/organisations/core/agent-ai-settings-db", () => ({
  getAgentAISettings: vi.fn(async () => null),
}));
vi.mock("@/modules/knowledge-bases/core/db", () => ({
  getAssistantConfigByAgent: vi.fn(async () => null),
  getKnowledgeBaseById: vi.fn(async () => null),
}));
vi.mock("@/modules/knowledge-bases/core/ai-overrides-db", () => ({
  getKbAIOverrides: vi.fn(async () => null),
}));
vi.mock("@/modules/ai-core/model-catalog", () => ({
  looksLikeChatModel: () => false,
  looksLikeEmbeddingModel: () => false,
  // resolve.ts re-injects the platform embedding default through the static
  // catalogue when vendor discovery loses it — undefined keeps this suite's
  // mocked rows authoritative.
  findEmbeddingModel: () => undefined,
}));
vi.mock("@/modules/agent-versioning/core/db", () => ({
  getActiveDeploymentCached: vi.fn(async () => null),
  getAgentDraftConfigCached: vi.fn(async () => null),
  getProductionVersionConfigCached: vi.fn(async () => null),
  getActiveDeploymentKbCollection: vi.fn(async () => null),
}));
vi.mock("@/modules/ai-governance/core/resolver", () => ({
  validateAgentAISelection: vi.fn(async (input: { provider: string; modelId?: string | null }) =>
    mocks.blockedProvider && input.provider === mocks.blockedProvider
      ? { ok: false, reason: `Provider ${input.provider} is not available on the Starter plan.` }
      : mocks.blockedModelId && input.modelId === mocks.blockedModelId
        ? { ok: false, reason: `Model ${input.modelId} is not available on the Starter plan.` }
        : mocks.governanceResult),
}));
vi.mock("@/modules/ai-governance/core/registry-db", () => ({
  getPlatformAIRegistry: vi.fn(async () => mocks.registry),
  // Resolution only accepts vendor-live catalogue rows; the selected chat
  // model must be discoverable or "No chat model is configured" fires.
  listProviderModels: vi.fn(async (provider: string, capability: string) =>
    capability === "chat" && (provider === "sarvam" || provider === "openai")
      ? [{
          providerId: provider,
          capability: "chat",
          kind: "chat",
          modelId: provider === "sarvam" ? "sarvam-105b" : "gpt-4o",
          displayName: provider === "sarvam" ? "Sarvam 105B" : "GPT-4o",
          enabled: true,
          isDefault: true,
          metadata: { catalogSource: "vendor_live" },
        }]
      : []),
}));
vi.mock("@/modules/organisations/core/agent-ai-types", () => ({
  resolveAgentRuntimeSelection: () => ({
    allowedLanguages: ["en"],
    defaultLanguage: "en",
    voiceId: null,
  }),
}));

import { resolveAIConfig } from "./resolve";

describe("resolveAIConfig subscription authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SARVAM_CHAT_MODEL = "sarvam-105b";
    process.env.OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
    process.env.SARVAM_EMBEDDING_FALLBACK_PROVIDER = "openai";
    mocks.orgSettings = {
      orgId: "org-1",
      // Deliberately stale legacy list: the old org settings endpoint is frozen.
      allowedProviders: ["openai", "gemini"],
      defaultProvider: "sarvam",
      allowedChatModels: {},
      allowedEmbeddingModels: {},
      allowedRealtimeModels: {},
      allowedVoices: {},
      allowedLanguages: ["en"],
      enableVoice: true,
      enableRealtime: true,
      enablePublicEmbed: true,
    };
    mocks.registry = {
      providers: [{
        providerId: "sarvam",
        displayName: "Sarvam",
        enabled: true,
        configured: true,
        capabilities: [{ capability: "chat", supported: true }],
      }],
      defaults: [],
      defaultModels: [],
      embeddingDefault: { providerId: "openai", modelId: "text-embedding-3-small" },
    };
    mocks.governanceResult = { ok: true };
    mocks.blockedModelId = null;
    mocks.blockedProvider = null;
  });

  it("does not reject a plan-entitled Sarvam selection because a legacy org allow-list is stale", async () => {
    const result = await resolveAIConfig({ orgId: "org-1", surface: "chat" });

    expect(result.provider).toBe("sarvam");
    expect(result.chatModel).toBe("sarvam-105b");
  });

  it("preserves an entitled platform default when an earlier registry provider is also allowed", async () => {
    // Legacy org provider list does not define availability or precedence.
    mocks.orgSettings = { ...(mocks.orgSettings ?? {}), defaultProvider: null };
    mocks.registry = {
      ...(mocks.registry ?? {}),
      providers: [
        {
          providerId: "openai", displayName: "OpenAI",
          enabled: true, configured: true,
          capabilities: [{ capability: "chat", supported: true }],
        },
        {
          providerId: "sarvam", displayName: "Sarvam",
          enabled: true, configured: true,
          capabilities: [{ capability: "chat", supported: true }],
        },
      ],
      defaults: [{ capability: "chat", providerId: "sarvam", modelId: "sarvam-105b" }],
    };

    const result = await resolveAIConfig({ orgId: "org-1", surface: "chat" });
    expect(result.provider).toBe("sarvam");
    expect(result.chatModel).toBe("sarvam-105b");
  });

  it("falls back to an entitled provider when the platform default is denied by the current plan", async () => {
    mocks.orgSettings = { ...(mocks.orgSettings ?? {}), defaultProvider: null };
    mocks.blockedProvider = "sarvam";
    mocks.registry = {
      ...(mocks.registry ?? {}),
      providers: [
        {
          providerId: "openai", displayName: "OpenAI",
          enabled: true, configured: true,
          capabilities: [{ capability: "chat", supported: true }],
        },
        {
          providerId: "sarvam", displayName: "Sarvam",
          enabled: true, configured: true,
          capabilities: [{ capability: "chat", supported: true }],
        },
      ],
      defaults: [{ capability: "chat", providerId: "sarvam", modelId: "sarvam-105b" }],
    };

    const result = await resolveAIConfig({ orgId: "org-1", surface: "chat" });
    expect(result.provider).toBe("openai");
    expect(result.chatModel).toBe("gpt-4o");
  });

  it("denies a vendor-live chat model excluded by the current plan even if its provider is allowed", async () => {
    mocks.blockedModelId = "sarvam-105b";
    await expect(resolveAIConfig({ orgId: "org-1", surface: "chat" }))
      .rejects.toThrow("Model sarvam-105b is not available on the Starter plan.");
  });

  it("still rejects a provider denied by the live subscription governance gate", async () => {
    mocks.governanceResult = {
      ok: false,
      reason: "Provider Sarvam is not available on the Starter plan.",
    };

    await expect(resolveAIConfig({ orgId: "org-1", surface: "chat" }))
      .rejects.toThrow("Provider Sarvam is not available on the Starter plan.");
  });
});