import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireSuperAdmin: vi.fn(),
  loadWebPage: vi.fn(),
  chunkText: vi.fn(),
  ensureCollectionExists: vi.fn(),
  upsertDocuments: vi.fn(),
  addDocumentRecord: vi.fn(),
  generateCollectionName: vi.fn(),
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdmin: mocks.requireSuperAdmin,
}));

vi.mock("@/modules/admin/core", () => ({
  chunkText: mocks.chunkText,
  parseDocumentFromBuffer: vi.fn(),
  loadWebPage: mocks.loadWebPage,
  addDocumentRecord: mocks.addDocumentRecord,
  generateCollectionName: mocks.generateCollectionName,
  ensureCollectionExists: mocks.ensureCollectionExists,
  upsertDocuments: mocks.upsertDocuments,
}));

import { postIngest } from "./ingest";

function request(): NextRequest {
  const data = new FormData();
  data.set("url", "https://example.com/guide");
  return new NextRequest("http://localhost/api/ingest", { method: "POST", body: data });
}

describe("legacy global Qdrant ingest authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: "platform-admin", isSuperAdmin: true } });
    mocks.requireSuperAdmin.mockResolvedValue(undefined);
    mocks.loadWebPage.mockResolvedValue({
      title: "Sample guide",
      url: "https://example.com/guide",
      text: "Complete description of a user-provided resource",
      metadata: {},
    });
    mocks.chunkText.mockReturnValue(["Complete description of a user-provided resource"]);
    mocks.generateCollectionName.mockReturnValue("sample_guide_123");
    mocks.ensureCollectionExists.mockResolvedValue(undefined);
    mocks.upsertDocuments.mockResolvedValue(undefined);
    mocks.addDocumentRecord.mockResolvedValue({ id: "doc-1", title: "Sample guide" });
  });

  it("rejects anonymous requests before fetching a supplied URL", async () => {
    mocks.requireAuth.mockRejectedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );

    const response = await postIngest(request());

    expect(response.status).toBe(401);
    expect(mocks.requireSuperAdmin).not.toHaveBeenCalled();
    expect(mocks.loadWebPage).not.toHaveBeenCalled();
    expect(mocks.upsertDocuments).not.toHaveBeenCalled();
  });

  it("rejects tenant users even if they have valid tokens", async () => {
    mocks.requireSuperAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await postIngest(request());

    expect(response.status).toBe(403);
    expect(mocks.loadWebPage).not.toHaveBeenCalled();
    expect(mocks.ensureCollectionExists).not.toHaveBeenCalled();
  });

  it("allows platform administrators to use the existing ingestion pipeline", async () => {
    const response = await postIngest(request());

    expect(response.status).toBe(200);
    expect(mocks.requireSuperAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ isSuperAdmin: true }) }),
    );
    expect(mocks.loadWebPage).toHaveBeenCalledWith("https://example.com/guide");
    expect(mocks.ensureCollectionExists).toHaveBeenCalledWith("sample_guide_123");
    expect(mocks.upsertDocuments).toHaveBeenCalledWith("sample_guide_123", [
      expect.objectContaining({ text: "Complete description of a user-provided resource" }),
    ]);
    expect((await response.json()).document).toEqual({ id: "doc-1", title: "Sample guide" });
  });
});
