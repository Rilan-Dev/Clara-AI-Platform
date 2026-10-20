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

import { deleteDocumentChunks, deleteChunk } from "./vector-store-kb";

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

  it("rejects when the live delete succeeds but the reindex mirror fails", async () => {
    mocks.getActiveReindexJob.mockResolvedValueOnce({
      sourceCollection: "kb-live-reindex",
      targetCollection: "kb-reindex-target",
    });
    mocks.deletePoints
      .mockResolvedValueOnce({ status: "completed" })
      .mockRejectedValueOnce(new Error("reindex target unavailable"));

    await expect(
      deleteDocumentChunks("kb-live-reindex", "doc-5", "kb-5"),
    ).rejects.toThrow("reindex target unavailable");

    expect(mocks.deletePoints).toHaveBeenNthCalledWith(1, "kb-live-reindex", {
      wait: true,
      filter: { must: [{ key: "documentId", match: { value: "doc-5" } }] },
    });
    expect(mocks.deletePoints).toHaveBeenNthCalledWith(2, "kb-reindex-target", {
      wait: true,
      filter: { must: [{ key: "documentId", match: { value: "doc-5" } }] },
    });
  });

  it("also removes reindex target chunks when the live collection never existed", async () => {
    mocks.createPayloadIndex.mockRejectedValueOnce(new Error("live collection missing"));
    mocks.getCollection.mockRejectedValueOnce(
      Object.assign(new Error("Not found: Collection \"kb-missing-live\" doesn't exist"), { status: 404 }),
    );
    mocks.getActiveReindexJob.mockResolvedValueOnce({
      sourceCollection: "kb-missing-live",
      targetCollection: "kb-existing-target",
    });

    await expect(
      deleteDocumentChunks("kb-missing-live", "doc-6", "kb-6"),
    ).resolves.toBeUndefined();

    expect(mocks.deletePoints).toHaveBeenCalledWith("kb-existing-target", {
      wait: true,
      filter: { must: [{ key: "documentId", match: { value: "doc-6" } }] },
    });
  });

  it("completes normally when the collection confirms the deletion", async () => {
    await expect(
      deleteDocumentChunks("kb-delete-success", "doc-3"),
    ).resolves.toBeUndefined();

    expect(mocks.deletePoints).toHaveBeenCalledTimes(1);
  });
});


describe("deleteChunk single-point reindex consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deletePoints.mockResolvedValue({ status: "completed" });
    mocks.getActiveReindexJob.mockResolvedValue(null);
    mocks.getCollectionEmbedding.mockResolvedValue(null);
  });

  it("deletes from the live KB when no reindex job exists", async () => {
    await expect(deleteChunk("kb-live", "point-1", "kb-trusted")).resolves.toBeUndefined();

    expect(mocks.getActiveReindexJob).toHaveBeenCalledWith("kb-trusted");
    expect(mocks.deletePoints).toHaveBeenCalledTimes(1);
    expect(mocks.deletePoints).toHaveBeenCalledWith("kb-live", {
      wait: true,
      points: ["point-1"],
    });
    expect(mocks.getCollectionEmbedding).not.toHaveBeenCalled();
  });

  it("deletes the active target before confirming live-point deletion", async () => {
    mocks.getActiveReindexJob.mockResolvedValueOnce({
      sourceCollection: "kb-live",
      targetCollection: "kb-reindex-target",
    });

    await expect(deleteChunk("kb-live", "point-2", "kb-trusted")).resolves.toBeUndefined();

    expect(mocks.deletePoints).toHaveBeenNthCalledWith(1, "kb-reindex-target", {
      wait: true, points: ["point-2"],
    });
    expect(mocks.deletePoints).toHaveBeenNthCalledWith(2, "kb-live", {
      wait: true, points: ["point-2"],
    });
  });

  it("rejects a failed mirror delete while leaving the live point untouched", async () => {
    mocks.getActiveReindexJob.mockResolvedValueOnce({
      sourceCollection: "kb-live",
      targetCollection: "kb-reindex-target",
    });
    mocks.deletePoints.mockRejectedValueOnce(new Error("target Qdrant unavailable"));

    await expect(deleteChunk("kb-live", "point-3", "kb-trusted"))
      .rejects.toThrow("target Qdrant unavailable");

    expect(mocks.deletePoints).toHaveBeenCalledTimes(1);
    expect(mocks.deletePoints).not.toHaveBeenCalledWith("kb-live", expect.anything());
  });

  it("rejects a reindex lookup failure instead of skipping potential mirror deletion", async () => {
    mocks.getActiveReindexJob.mockRejectedValueOnce(new Error("reindex database unavailable"));

    await expect(deleteChunk("kb-live", "point-4", "kb-trusted"))
      .rejects.toThrow("reindex database unavailable");

    expect(mocks.deletePoints).not.toHaveBeenCalled();
  });

  it("propagates live Qdrant deletion failure after successfully clearing the target", async () => {
    mocks.getActiveReindexJob.mockResolvedValueOnce({
      sourceCollection: "kb-live",
      targetCollection: "kb-reindex-target",
    });
    mocks.deletePoints.mockResolvedValueOnce({ status: "completed" })
      .mockRejectedValueOnce(new Error("live Qdrant unavailable"));

    await expect(deleteChunk("kb-live", "point-5", "kb-trusted"))
      .rejects.toThrow("live Qdrant unavailable");

    expect(mocks.deletePoints).toHaveBeenCalledTimes(2);
  });
});
