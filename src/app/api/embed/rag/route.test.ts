import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  validateEmbedRequest: vi.fn(),
  postRagSearch: vi.fn(),
}));

vi.mock("@/modules/embed/core/validate-embed", () => ({
  validateEmbedRequest: mocks.validateEmbedRequest,
  buildCorsHeaders: vi.fn(() => ({ "Access-Control-Allow-Origin": "https://allowed.example" })),
  handlePreflight: vi.fn(() => new NextResponse(null, { status: 204 })),
}));
vi.mock("@/modules/assistant/api/rag", () => ({
  postRagSearch: mocks.postRagSearch,
}));

import { POST } from "./route";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/embed/rag", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://allowed.example",
    },
    body: JSON.stringify(body),
  });

describe("public embedded RAG authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateEmbedRequest.mockResolvedValue({
      ok: true,
      ctx: { kbId: "kb-published", allowedOrigins: ["https://allowed.example"] },
    });
    mocks.postRagSearch.mockImplementation(async (req: NextRequest) =>
      NextResponse.json({ forwarded: await req.json() }),
    );
  });

  it("ignores a public caller's foreign KB and unpublished draft selection", async () => {
    const response = await POST(
      request({
        kbId: "kb-other-tenant",
        scope: "draft",
        query: "what is unpublished?",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      forwarded: { kbId: "kb-published", scope: "live", query: "what is unpublished?" },
    });
    expect(mocks.postRagSearch).toHaveBeenCalledTimes(1);
    expect(mocks.postRagSearch.mock.calls[0][2]).toBe("audit-only");
  });

  it("uses published scope even if the caller does not specify a scope", async () => {
    const response = await POST(request({ query: "public knowledge" }));
    expect((await response.json()).forwarded).toEqual({
      query: "public knowledge",
      kbId: "kb-published",
      scope: "live",
    });
  });

  it("does not retrieve anything if the embed credential is invalid", async () => {
    mocks.validateEmbedRequest.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await POST(request({ kbId: "kb-other-tenant", scope: "draft" }));

    expect(response.status).toBe(401);
    expect(mocks.postRagSearch).not.toHaveBeenCalled();
  });
});
