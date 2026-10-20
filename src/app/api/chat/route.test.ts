import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  postChat: vi.fn(),
  requireAuth: vi.fn(),
  requireKbPermission: vi.fn(),
}));

vi.mock("@/modules/assistant/api/chat", () => ({ postChat: mocks.postChat }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireKbPermission: mocks.requireKbPermission,
}));

import { POST } from "./route";

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("workspace chat KB authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireKbPermission.mockResolvedValue(undefined);
    mocks.postChat.mockImplementation(async (req: NextRequest) =>
      NextResponse.json({ accepted: await req.json() }),
    );
  });

  it("refuses anonymous chat before model or retrieval is called", async () => {
    mocks.requireAuth.mockRejectedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );

    const response = await POST(request({ kbId: "kb-private", messages: [] }));
    expect(response.status).toBe(401);
    expect(mocks.postChat).not.toHaveBeenCalled();
  });

  it("refuses a different organization's knowledge base", async () => {
    mocks.requireKbPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(request({ kbId: "kb-other-org", messages: [] }));
    expect(response.status).toBe(403);
    expect(mocks.requireKbPermission).toHaveBeenCalledWith(
      expect.anything(), "kb-other-org", "kb:read",
    );
    expect(mocks.postChat).not.toHaveBeenCalled();
  });

  it("allows an authorized KB without consuming the streamed handler body", async () => {
    const body = { kbId: "kb-owned", messages: [{ role: "user", content: "hello" }] };
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: body });
    expect(mocks.postChat).toHaveBeenCalledTimes(1);
  });

  it("requires edit permission for unpublished draft chat", async () => {
    mocks.requireKbPermission.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(request({ kbId: "kb-owned", scope: "draft", messages: [] }));
    expect(response.status).toBe(403);
    expect(mocks.requireKbPermission.mock.calls.map((call: unknown[]) => call[2]))
      .toEqual(["kb:read", "kb:update"]);
    expect(mocks.postChat).not.toHaveBeenCalled();
  });

  it("rejects the unowned legacy document-catalog chat mode", async () => {
    const response = await POST(request({ documentId: "legacy-global", messages: [] }));
    expect(response.status).toBe(410);
    expect(mocks.postChat).not.toHaveBeenCalled();
    expect(mocks.requireAuth).not.toHaveBeenCalled();
  });
});
