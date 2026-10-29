import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCollection: vi.fn(),
  count: vi.fn(),
  scroll: vi.fn(),
  createCollection: vi.fn(),
  upsert: vi.fn(),
  copyCollectionEmbedding: vi.fn(),
}));

vi.mock("./vector-store", () => ({
  getQdrantClient: () => ({
    getCollection: mocks.getCollection,
    count: mocks.count,
    scroll: mocks.scroll,
    createCollection: mocks.createCollection,
    upsert: mocks.upsert,
  }),
  ensureCollectionExists: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/embedding-index", () => ({
  copyCollectionEmbedding: mocks.copyCollectionEmbedding,
  getActiveReindexJob: vi.fn(),
  getCollectionEmbedding: vi.fn(),
  getKbIndexContext: vi.fn(),
  providerConfigFor: vi.fn(),
  resolveWriteEmbedding: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({
  logUsageEvent: vi.fn(),
}));

import { cloneKbCollection } from "./vector-store-kb";

describe("published KB snapshots reject cross-tenant point contamination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCollection.mockResolvedValue({ config: { params: { vectors: { size: 1536, distance: "Cosine" } } } });
    mocks.count.mockResolvedValue({ count: 2 });
    mocks.scroll.mockResolvedValue({ points: [], next_page_offset: null });
    mocks.createCollection.mockResolvedValue(true);
    mocks.upsert.mockResolvedValue({ status: "completed" });
    mocks.copyCollectionEmbedding.mockResolvedValue(undefined);
  });

  it("rejects a mixed-ownership source before making any deployment snapshot", async () => {
    mocks.count.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 2 });
    await expect(cloneKbCollection("live", "pub", "kb-1"))
      .rejects.toThrow("missing this KB's ownership marker");
    expect(mocks.createCollection).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.copyCollectionEmbedding).not.toHaveBeenCalled();
  });

  it("copies only KB-scoped points into the immutable snapshot", async () => {
    mocks.scroll.mockResolvedValueOnce({
      points: [{ id: "point-1", vector: [0.5], payload: { kbId: "kb-1", documentId: "document-1" } }],
      next_page_offset: null,
    });
    await cloneKbCollection("live", "pub", "kb-1");
    const ownershipFilter = { must: [{ key: "kbId", match: { value: "kb-1" } }] };
    expect(mocks.count).toHaveBeenCalledWith("live", { exact: true, filter: ownershipFilter });
    expect(mocks.scroll).toHaveBeenCalledWith("live", expect.objectContaining({
      filter: ownershipFilter, with_vector: true, with_payload: true,
    }));
    expect(mocks.upsert).toHaveBeenCalledWith("pub", {
      wait: true,
      points: [{ id: "point-1", vector: [0.5], payload: { kbId: "kb-1", documentId: "document-1" } }],
    });
    expect(mocks.copyCollectionEmbedding).toHaveBeenCalledWith("live", "pub");
  });

  it("does not create a snapshot when Qdrant ownership validation is unavailable", async () => {
    mocks.count.mockRejectedValueOnce(new Error("Qdrant read timed out"));
    await expect(cloneKbCollection("live", "pub", "kb-1"))
      .rejects.toThrow("Qdrant read timed out");
    expect(mocks.createCollection).not.toHaveBeenCalled();
  });
});
