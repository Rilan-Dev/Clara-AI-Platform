/**
 * Regression: a Qdrant delete failure must not be reported as a successful
 * document-chunk deletion. The caller retains the document database record on
 * rejection, so administrators can retry and the source remains auditable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPayloadIndex: vi.fn(),
  deletePoints: vi.fn(),
  getCollectionEmbedding: vi.fn(),
  getActiveReindexJob: vi.fn(),
}));

vi.mock("./vector-store", () => ({
  getQdrantClient: () => ({
    createPayloadIndex: mocks.createPayloadIndex,
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

  it("completes normally when the collection confirms the deletion", async () => {
    await expect(
      deleteDocumentChunks("kb-delete-success", "doc-3"),
    ).resolves.toBeUndefined();

    expect(mocks.deletePoints).toHaveBeenCalledTimes(1);
  });
});
