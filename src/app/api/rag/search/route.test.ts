import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
  postRagSearch: vi.fn(),
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
}));
vi.mock("@/modules/assistant/api/rag", () => ({
  postRagSearch: mocks.postRagSearch,
}));

import { POST } from "./route";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/rag/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("authenticated direct RAG search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireKbPermission.mockResolvedValue(undefined);
    mocks.postRagSearch.mockImplementation(async (req: NextRequest) =>
      NextResponse.json({ forwarded: await req.json() }),
    );
  });

  it("refuses unauthenticated KB requests before retrieving any knowledge", async () => {
    mocks.requireAuth.mockRejectedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );

    const response = await POST(request({ kbId: "kb-private", query: "secret" }));

    expect(response.status).toBe(401);
    expect(mocks.requireKbPermission).not.toHaveBeenCalled();
    expect(mocks.postRagSearch).not.toHaveBeenCalled();
  });

  it("refuses another tenant's KB when membership/permission is denied", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(request({ kbId: "kb-other-org", query: "secret" }));

    expect(response.status).toBe(403);
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(
      expect.anything(), "kb-other-org", "kb:read",
    );
    expect(mocks.postRagSearch).not.toHaveBeenCalled();
  });

  it("passes an authorized request unchanged to shared grounding", async () => {
    const body = { kbId: "kb-allowed", documentId: "doc-in-kb", query: "question" };
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ forwarded: body });
    expect(mocks.requireKbPermission).toHaveBeenCalledTimes(1);
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(
      expect.anything(), "kb-allowed", "kb:read",
    );
  });

  it("requires update permission before exposing unpublished draft knowledge", async () => {
    const response = await POST(
      request({ kbId: "kb-allowed", scope: "draft", query: "unpublished" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireKbPermission.mock.calls.map((args: unknown[]) => args[2]))
      .toEqual(["kb:read", "kb:update"]);
  });

  it("rejects draft reads without edit permission before retrieval", async () => {
    mocks.requireKbPermission
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      );

    const response = await POST(
      request({ kbId: "kb-allowed", scope: "draft", query: "unpublished" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.postRagSearch).not.toHaveBeenCalled();
  });

  it("rejects unscoped legacy document-only retrieval", async () => {
    const response = await POST(request({ documentId: "catalog-id", query: "secret" }));

    expect(response.status).toBe(400);
    expect(mocks.postRagSearch).not.toHaveBeenCalled();
    expect(mocks.requireAuth).not.toHaveBeenCalled();
  });
});
