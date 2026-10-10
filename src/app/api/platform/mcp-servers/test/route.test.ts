import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const queryMock = vi.fn();
const probeMock = vi.fn();
vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db", () => ({ query: queryMock }));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "test-encryption-key" }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
  requireSuperAdmin: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/modules/ai-platform-core/mcp-streamable-http-resolver", () => ({
  probeStreamableHttpServer: probeMock,
}));
vi.mock("@/modules/ai-platform-core/mcp-oauth", () => ({
  parseMcpPlatformCredential: vi.fn(() => null),
  resolveMcpAccessToken: vi.fn(),
}));

describe("platform MCP handshake test route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue([{
      endpoint_url: "https://mcp.example.com/mcp",
      auth_mode: "bearer",
      platform_credential: null,
    }]);
  });

  it("returns 400 for missing stored bearer credential without attempting an upstream handshake", async () => {
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/platform/mcp-servers/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serverId: "6c6b8a7f-e32f-4bba-8506-85eac3cca707" }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      probe: {
        ok: false,
        errorCode: "MCP_NO_PLATFORM_CREDENTIAL",
      },
    });
    expect(probeMock).not.toHaveBeenCalled();
  });
});
