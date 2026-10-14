import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderConfig } from "@/modules/ai-core/types";

vi.mock("@/modules/ai-governance/core/registry-db", () => ({
  getPlatformAIRegistry: vi.fn(async () => ({
    embeddingDefault: { providerId: "gemini", modelId: "gemini-embedding-2-preview", updatedAt: "2026-10-14T00:00:00Z" },
  })),
}));

vi.mock("./embedding-index", () => ({
  getActiveReindexJob: vi.fn(async () => null),
  getKbIndexContext: vi.fn(async () => ({
    kbId: "kb-1",
    orgId: "org-1",
    collection: "kb_one",
    desiredIndex: "standard",
  })),
}));

vi.mock("./reindex", () => {
  class ReindexError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) {
      super(message);
    }
  }
  return { ReindexError, startReindex: vi.fn(async () => ({})) };
});

vi.mock("@/modules/platform-health/core/incidents", () => ({
  recordRuntimeIncident: vi.fn(async () => undefined),
}));

import { getPlatformAIRegistry } from "@/modules/ai-governance/core/registry-db";
import { getActiveReindexJob, getKbIndexContext } from "./embedding-index";
import { ReindexError, startReindex } from "./reindex";
import { recordRuntimeIncident } from "@/modules/platform-health/core/incidents";
import { EmbeddingBackboneBrokenError, selfHealBrokenCollectionEmbedding } from "./embedding-selfheal";

const openaiConfig: ProviderConfig = {
  provider: "openai",
  apiKey: "sk-proj-dead",
  embeddingModel: "text-embedding-3-small",
  embeddingDimension: 1536,
};

const deadKeyError = new Error(
  "401 Incorrect API key provided: sk-proj-***B6YA. You can find your API key at https://platform.openai.com/account/api-keys.",
);

async function heal(error: unknown = deadKeyError, providerConfig: ProviderConfig = openaiConfig) {
  return selfHealBrokenCollectionEmbedding({
    kbId: "kb-1",
    collectionName: "kb_one",
    providerConfig,
    error,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveReindexJob).mockResolvedValue(null);
  vi.mocked(getKbIndexContext).mockResolvedValue({
    kbId: "kb-1", orgId: "org-1", collection: "kb_one", desiredIndex: "standard",
  });
  vi.mocked(getPlatformAIRegistry).mockResolvedValue({
    embeddingDefault: { providerId: "gemini", modelId: "gemini-embedding-2-preview", updatedAt: "2026-10-14T00:00:00Z" },
  } as Awaited<ReturnType<typeof getPlatformAIRegistry>>);
});

describe("selfHealBrokenCollectionEmbedding", () => {
  it("enqueues a re-index to the platform default on a dead collection credential", async () => {
    const healed = await heal();
    expect(healed).toBeInstanceOf(EmbeddingBackboneBrokenError);
    expect(startReindex).toHaveBeenCalledWith({ kbId: "kb-1", index: "standard", userId: null });
    expect(healed?.message).toContain("OpenAI");
    expect(healed?.message).toContain("gemini-embedding-2-preview");
    expect(healed?.message).toContain("re-index");
    // The migration is reported as a platform incident for the admin banner.
    expect(recordRuntimeIncident).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ai-embedding-migration:kb-1", severity: "warning" }),
    );
  });

  it("preserves the original vendor error as the healed error's cause", async () => {
    const healed = await heal();
    expect((healed as { cause?: unknown })?.cause).toBe(deadKeyError);
  });

  it("ignores non-credential failures (network hiccups stay untouched)", async () => {
    const healed = await heal(new Error("fetch failed: socket hang up"));
    expect(healed).toBeNull();
    expect(startReindex).not.toHaveBeenCalled();
  });

  it("does not self-heal when the failing provider IS the platform default", async () => {
    vi.mocked(getPlatformAIRegistry).mockResolvedValue({
      embeddingDefault: { providerId: "openai", modelId: "text-embedding-3-small", updatedAt: "2026-10-14T00:00:00Z" },
    } as Awaited<ReturnType<typeof getPlatformAIRegistry>>);
    const healed = await heal();
    expect(healed).toBeNull();
    expect(startReindex).not.toHaveBeenCalled();
  });

  it("reports an already-running job instead of enqueueing a second one", async () => {
    vi.mocked(getActiveReindexJob).mockResolvedValue({
      id: "job-1", kbId: "kb-1", sourceCollection: "kb_one", targetCollection: "kb_one__std_abc",
      targetIndex: "standard", provider: "gemini", model: "gemini-embedding-2-preview", dimension: 3072,
      status: "running", cursor: null, pointsTotal: 120, pointsDone: 40, errorMessage: null,
      createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:01:00Z", completedAt: null,
    });
    const healed = await heal();
    expect(startReindex).not.toHaveBeenCalled();
    expect(healed?.message).toContain("already in progress");
    expect(healed?.message).toContain("40/120");
  });

  it("treats ALREADY_INDEXED / REINDEX_RUNNING races as covered", async () => {
    vi.mocked(startReindex).mockRejectedValueOnce(new ReindexError("A re-index is already running", 409, "REINDEX_RUNNING"));
    const healed = await heal();
    expect(healed?.message).toContain("already queued or running");
    expect(recordRuntimeIncident).not.toHaveBeenCalled();
  });

  it("never migrates multilingual (TEI) knowledge bases", async () => {
    vi.mocked(getKbIndexContext).mockResolvedValue({
      kbId: "kb-1", orgId: "org-1", collection: "kb_one", desiredIndex: "multilingual",
    });
    const healed = await heal();
    expect(healed).toBeNull();
    expect(startReindex).not.toHaveBeenCalled();
  });
});
