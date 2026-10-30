import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const calls = vi.hoisted(() => ({ delegated: vi.fn() }));
vi.mock("@/app/api/embed/chat/route", () => ({
  POST: calls.delegated,
}));

import { POST } from "./route";

function request(authorization?: string) {
  return new NextRequest("https://clara.example.test/api/public/chat", {
    method: "POST",
    headers: authorization ? { authorization } : {},
    body: JSON.stringify({ kbId: "kb-test", messages: [{ role: "user", content: "Hello" }] }),
  });
}

describe("published chat transport routing", () => {
  beforeEach(() => {
    calls.delegated.mockReset();
    calls.delegated.mockResolvedValue(
      new NextResponse('{"type":"done"}\n', {
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    );
  });

  it("rejects unauthenticated, workspace and external widget credentials without forwarding", async () => {
    for (const authorization of [undefined, "Bearer workspace-token", "Bearer clr_widget-key", "Bearer pub_v2.bad.sig"]) {
      const result = await POST(request(authorization));
      expect(result.status).toBe(401);
    }
    expect(calls.delegated).not.toHaveBeenCalled();
  });

  it("forwards the original published-session request to the validating stream handler", async () => {
    const req = request("Bearer pub_v1.payload.signature");
    const result = await POST(req);
    expect(result.headers.get("content-type")).toContain("application/x-ndjson");
    expect(await result.text()).toContain('"type":"done"');
    expect(calls.delegated).toHaveBeenCalledOnce();
    expect(calls.delegated).toHaveBeenCalledWith(req);
  });

  it("does not treat this prefix-routing test as signed-session authentication", async () => {
    const req = request("Bearer pub_v1.not-a-valid-hmac.signature");
    await POST(req);
    // Handler is intentionally delegated; validateEmbedRequest remains
    // responsible for HMAC, expiry, deployment, KB and quota enforcement.
    expect(calls.delegated).toHaveBeenCalledWith(req);
  });
});
