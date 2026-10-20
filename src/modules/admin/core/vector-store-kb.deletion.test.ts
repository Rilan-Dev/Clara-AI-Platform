/**
 * Regression: a Qdrant delete failure must not be reported as a successful
 * document-chunk deletion. The caller retains the document database record on
 * rejection, so administrators can retry and the source remains auditable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPayloadIndex: vi.fn(),
  getCollection: vi.fn(),
  deletePoints: vi.fn(),
  getCollectionEmbedding: vi.fn(),
  getActiveReindexJob: vi.fn(),
}));

vi.mock("./vector-store", () => ({
  getQdrantClient: () => ({
    createPayloadIndex: mocks.createPayloadIndex,
    getCollection: mocks.getCollection,
    delete: mocks.deletePoints,
  }),
  ensureCollectionExists: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/embedding-index", () => ({
  copyCollectionEmbedding: vi.fn(),
  getActiveReindexJob: mocks.getActiveReindexJob,
  getCollectionEmbedding: mocks.getCollectionEmbedding,
  getKbIndexContext: vi.fn(),
  providerConfigFor: vi.fn(),
  resolveWriteEmbedding: vi.fn(),
}));
vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({
  logUsageEvent: vi.fn(),
}));

import { deleteDocumentChunks } from "./vector-store-kb";

describe("deleteDocumentChunks fail-closed behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPayloadIndex.mockResolvedValue(undefined);
    mocks.getCollection.mockResolvedValue({ config: { params: { vectors: { size: 3 } } } });
    mocks.deletePoints.mockResolvedValue({ status: "completed" });
    mocks.getCollectionEmbedding.mockResolvedValue(null);
    mocks.getActiveReindexJob.mockResolvedValue(null);
  });

  it("propagates Qdrant delete errors instead of silently confirming success", async () => {
    mocks.deletePoints.mockRejectedValueOnce(new Error("Qdrant unavailable"));

    await expect(
      deleteDocumentChunks("kb-delete-failure", "doc-1"),
    ).rejects.toThrow("Qdrant unavailable");

    expect(mocks.deletePoints).toHaveBeenCalledWith("kb-delete-failure", {
      wait: true,
      filter: { must: [{ key: "documentId", match: { value: "doc-1" } }] },
    });
  });

  it("propagates index-creation failures without attempting an unindexed deletion", async () => {
    mocks.createPayloadIndex.mockRejectedValueOnce(new Error("index unavailable"));

    await expect(
      deleteDocumentChunks("kb-index-failure", "doc-2"),
    ).rejects.toThrow("index unavailable");
    expect(mocks.deletePoints).not.toHaveBeenCalled();
  });

  it("permits deletion of a document whose Qdrant collection never existed", async () => {
    mocks.createPayloadIndex.mockRejectedValueOnce(new Error("index failed: no collection"));
    mocks.getCollection.mockRejectedValueOnce(
      Object.assign(new Error("Not found: Collection \"kb-never-created\" doesn't exist!"), { status: 404 }),
    );

    await expect(
      deleteDocumentChunks("kb-never-created", "doc-unindexed"),
    ).resolves.toBeUndefined();

    expect(mocks.getCollection).toHaveBeenCalledWith("kb-never-created");
    expect(mocks.deletePoints).not.toHaveBeenCalled();
  });

  it("does not confuse a Qdrant outage with a missing collection", async () => {
    mocks.createPayloadIndex.mockRejectedValueOnce(new Error("Qdrant timeout"));
    mocks.getCollection.mockRejectedValueOnce(Object.assign(new Error("Service unavailable"), { status: 503 }));

    await expect(
      deleteDocumentChunks("kb-outage", "doc-4"),
    ).rejects.toThrow("Qdrant timeout");
    expect(mocks.deletePoints).not.toHaveBeenCalled();
  });

  it("completes normally when the collection confirms the deletion", async () => {
    await expect(
      deleteDocumentChunks("kb-delete-success", "doc-3"),
    ).resolves.toBeUndefined();

    expect(mocks.deletePoints).toHaveBeenCalledTimes(1);
  });
});
