import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireSuperAdmin: vi.fn(),
  listDocuments: vi.fn(),
  getDocumentById: vi.fn(),
  embedQuery: vi.fn(),
  searchSimilarDocuments: vi.fn(),
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("@/modules/admin/core", () => ({
  listDocuments: mocks.listDocuments,
  getDocumentById: mocks.getDocumentById,
  embedQuery: mocks.embedQuery,
  searchSimilarDocuments: mocks.searchSimilarDocuments,
}));

import { getDocuments } from "./documents";
import { getPolicies, getPolicyById } from "./policies";
import { postDocumentOverview } from "@/modules/assistant/api/documents";

const request = (path: string, body?: unknown) =>
  new NextRequest("http://localhost" + path, body === undefined
    ? { method: "GET" }
    : {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

describe("legacy document_catalog platform boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: "platform-admin", isSuperAdmin: true } });
    mocks.requireSuperAdmin.mockResolvedValue(undefined);
    mocks.listDocuments.mockResolvedValue([{ id: "legacy-doc", title: "Global catalog" }]);
    mocks.getDocumentById.mockResolvedValue({
      id: "legacy-doc",
      title: "Global catalog",
      collectionName: "legacy_docs",
      sourceType: "cli-file",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    mocks.embedQuery.mockResolvedValue([0.1, 0.2]);
    mocks.searchSimilarDocuments.mockResolvedValue([]);
  });

  it("rejects anonymous document catalog listing before querying the catalog", async () => {
    mocks.requireAuth.mockRejectedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );

    const response = await getDocuments(request("/api/documents"));

    expect(response.status).toBe(401);
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });

  it("rejects non-admin policy catalogs", async () => {
    mocks.requireSuperAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await getPolicies(request("/api/policies"));

    expect(response.status).toBe(403);
    expect(mocks.listDocuments).not.toHaveBeenCalled();
  });

  it("rejects non-admin policy ID lookup", async () => {
    mocks.requireSuperAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await getPolicyById(
      request("/api/policies/legacy-doc"),
      { params: Promise.resolve({ id: "legacy-doc" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.getDocumentById).not.toHaveBeenCalled();
  });

  it("rejects unauthorized overview before embedding or retrieving document content", async () => {
    mocks.requireSuperAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await postDocumentOverview(
      request("/api/documents/overview", { documentId: "legacy-doc" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.getDocumentById).not.toHaveBeenCalled();
    expect(mocks.embedQuery).not.toHaveBeenCalled();
  });

  it("preserves legitimate platform-admin document listing", async () => {
    const response = await getDocuments(request("/api/documents"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      documents: [{ id: "legacy-doc", title: "Global catalog" }],
    });
    expect(mocks.requireSuperAdmin).toHaveBeenCalledOnce();
  });

  it("preserves legitimate platform-admin document overview", async () => {
    const response = await postDocumentOverview(
      request("/api/documents/overview", { documentId: "legacy-doc" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.getDocumentById).toHaveBeenCalledWith("legacy-doc");
    expect(mocks.searchSimilarDocuments).toHaveBeenCalledWith(
      "legacy_docs", [0.1, 0.2], 5,
    );
  });
});
