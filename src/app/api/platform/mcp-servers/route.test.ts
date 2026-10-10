import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const queryMock = vi.fn();
vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db", () => ({ query: queryMock, withTransaction: vi.fn(async (fn) => fn({ query: queryMock })) }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: "admin-1" } }),
  requireSuperAdmin: vi.fn().mockResolvedValue(undefined),
}));
describe("platform MCP registry validation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects non-HTTPS and private-address endpoints before writing configuration", async () => {
    const { POST } = await import("./route");
    for (const endpointUrl of ["http://mcp.example.com/mcp", "https://127.0.0.1/mcp", "https://localhost/mcp", "https://169.254.169.254/latest/meta-data", "https://[::1]/mcp", "https://2130706433/mcp"]) {
      const response = await POST(new NextRequest("http://localhost/api/platform/mcp-servers", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ serverKey:"unsafe-server",displayName:"Unsafe server",endpointUrl,authMode:"none" }),
      }));
      expect(response.status).toBe(400);
    }
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("rejects unsupported transport types and embed surfaces in platform tool approvals", async () => {
    const { POST } = await import("./route");
    const unsupportedTransport = await POST(new NextRequest("http://localhost/api/platform/mcp-servers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serverKey:"server-two",displayName:"Server Two",endpointUrl:"https://mcp.example.com/mcp",
        transportType:"stdio",authMode:"none",
      }),
    }));
    expect(unsupportedTransport.status).toBe(400);
    const unsupportedSurface = await POST(new NextRequest("http://localhost/api/platform/mcp-servers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serverKey:"server-three",displayName:"Server Three",endpointUrl:"https://mcp.example.com/mcp",
        transportType:"streamable_http",authMode:"none",
        tools:[{name:"dangerous_tool",approved:true,allowedSurfaces:["embed"]}],
      }),
    }));
    expect(unsupportedSurface.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });});
