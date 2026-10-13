import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orgSettings: null as Record<string, unknown> | null,
  registry: null as Record<string, unknown> | null,
  governanceResult: { ok: true } as { ok: boolean; reason?: string },
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
}));
vi.mock("@/modules/agent-versioning/core/db", () => ({
  getActiveDeploymentCached: vi.fn(async () => null),
  getAgentDraftConfigCached: vi.fn(async () => null),
  getProductionVersionConfigCached: vi.fn(async () => null),
  getActiveDeploymentKbCollection: vi.fn(async () => null),
}));
vi.mock("@/modules/ai-governance/core/resolver", () => ({
  validateAgentAISelection: vi.fn(async () => mocks.governanceResult),
}));
vi.mock("@/modules/ai-governance/core/registry-db", () => ({
  getPlatformAIRegistry: vi.fn(async () => mocks.registry),
  listProviderModels: vi.fn(async () => []),
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
  });

  it("does not reject a plan-entitled Sarvam selection because a legacy org allow-list is stale", async () => {
    const result = await resolveAIConfig({ orgId: "org-1", surface: "chat" });

    expect(result.provider).toBe("sarvam");
    expect(result.chatModel).toBe("sarvam-105b");
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