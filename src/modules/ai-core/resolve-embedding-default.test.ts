import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orgSettings: null as Record<string, unknown> | null,
  registry: null as Record<string, unknown> | null,
  embeddingRows: [] as Array<Record<string, unknown>>,
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
vi.mock("@/modules/ai-core/model-catalog", async (importOriginal) => {
  // The REAL catalogue powers the re-injection under test — the static entry
  // for gemini-embedding-2-preview is exactly what production falls back to.
  const actual = await importOriginal<typeof import("./model-catalog")>();
  return {
    ...actual,
    looksLikeChatModel: () => false,
    looksLikeEmbeddingModel: () => false,
  };
});
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
  // Simulate the production failure mode: discovery is down or no longer
  // advertises the configured default, so only OTHER rows come back.
  listProviderModels: vi.fn(async (provider: string, capability: string) =>
    provider === "gemini" && capability === "chat" ? mocks.embeddingRows : []),
}));
vi.mock("@/modules/platform-health/core/incidents", () => ({
  recordRuntimeIncident: vi.fn(async () => undefined),
}));
vi.mock("@/modules/organisations/core/agent-ai-types", () => ({
  resolveAgentRuntimeSelection: () => ({
    allowedLanguages: ["en"],
    defaultLanguage: "en",
    voiceId: null,
  }),
}));

import { resolveAIConfig } from "./resolve";

function bootstrapRow(modelId: string, extra: Record<string, unknown> = {}) {
  return {
    providerId: "gemini",
    capability: "chat",
    kind: "embedding",
    modelId,
    displayName: modelId,
    enabled: true,
    isDefault: false,
    metadata: { catalogSource: "bootstrap" },
    ...extra,
  };
}

describe("resolveAIConfig — live embedding catalogue availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GEMINI_EMBEDDING_MODEL;
    delete process.env.GEMINI_EMBEDDING_DIMENSION;
    delete process.env.AI_EMBEDDING_PROVIDER;
    mocks.orgSettings = null;
    mocks.embeddingRows = [bootstrapRow("gemini-embedding-001")];
    mocks.registry = {
      providers: [{
        providerId: "gemini",
        displayName: "Gemini",
        enabled: true,
        configured: true,
        capabilities: [{ capability: "chat", supported: true }],
      }],
      defaults: [],
      defaultModels: [],
      // The production defect: the admin selected the preview model, but
      // Google's ListModels stopped advertising it (or discovery is down) —
      // only gemini-embedding-001 rows remain.
      embeddingDefault: { providerId: "gemini", modelId: "gemini-embedding-2-preview" },
    };
    mocks.governanceResult = { ok: true };
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("fails closed when discovery returns only bootstrap rows and the configured default is stale", async () => {
    await expect(resolveAIConfig({ orgId: "org-1", surface: "rag-embedding" }))
      .rejects.toThrow("no vendor-live embedding models discovered");
    expect(mocks.embeddingRows[0].metadata).toEqual({ catalogSource: "bootstrap" });
  });

  it("records degraded discovery and embedding-configuration incidents without selecting a stale default", async () => {
    await expect(resolveAIConfig({ orgId: "org-1", surface: "rag-embedding" }))
      .rejects.toThrow("no vendor-live embedding models discovered");

    const { recordRuntimeIncident } = await import("@/modules/platform-health/core/incidents");
    expect(recordRuntimeIncident).toHaveBeenCalledWith(expect.objectContaining({
      key: "ai-embedding-catalog:gemini",
      healthy: false,
    }));
    expect(recordRuntimeIncident).toHaveBeenCalledWith(expect.objectContaining({
      key: "ai-embedding-config",
      healthy: false,
    }));
  });

  it("prefers a vendor-live row for the default when discovery actually lists it", async () => {
    mocks.embeddingRows = [
      bootstrapRow("gemini-embedding-001"),
      bootstrapRow("gemini-embedding-2-preview", { metadata: { catalogSource: "vendor_live" }, isDefault: true }),
    ];

    const result = await resolveAIConfig({ orgId: "org-1", surface: "rag-embedding" });

    expect(result.embeddingModel).toBe("gemini-embedding-2-preview");
    // No synthetic re-injection warning path taken: the incident recorder is
    // only called for the vendor-live protection… none expected here.
    const { recordRuntimeIncident } = await import("@/modules/platform-health/core/incidents");
    expect(recordRuntimeIncident).not.toHaveBeenCalled();
  });

  it("ignores rows from another provider, capability, kind, disabled state, or bootstrap source", async () => {
    mocks.embeddingRows = [
      bootstrapRow("bootstrap-model"),
      bootstrapRow("wrong-provider", {
        providerId: "openai",
        metadata: { catalogSource: "vendor_live" },
      }),
      bootstrapRow("wrong-capability", {
        capability: "realtime_voice",
        metadata: { catalogSource: "vendor_live" },
      }),
      bootstrapRow("wrong-kind", {
        kind: "chat",
        metadata: { catalogSource: "vendor_live" },
      }),
      bootstrapRow("disabled-live", {
        enabled: false,
        metadata: { catalogSource: "vendor_live" },
      }),
      bootstrapRow("valid-live", {
        metadata: { catalogSource: "vendor_live" },
        isDefault: true,
      }),
    ];
    mocks.registry = {
      ...mocks.registry,
      embeddingDefault: { providerId: "gemini", modelId: "stale-default" },
    };

    const result = await resolveAIConfig({ orgId: "org-1", surface: "rag-embedding" });

    expect(result.embeddingModel).toBe("valid-live");
  });

  it("does not select a static model when discovery returns no rows", async () => {
    mocks.embeddingRows = [];
    await expect(resolveAIConfig({ orgId: "org-1", surface: "rag-embedding" }))
      .rejects.toThrow("no vendor-live embedding models discovered");
  });
});
