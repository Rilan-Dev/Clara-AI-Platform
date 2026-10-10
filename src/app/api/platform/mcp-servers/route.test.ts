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
    for (const endpointUrl of ["http://mcp.example.com/mcp", "https://127.0.0.1/mcp", "https://localhost/mcp", "https://169.254.169.254/latest/meta-data", "https://[::1]/mcp", "https://2130706433/mcp", "https://mcp.example.com/mcp?token=secret"]) {
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
  });
  it("rejects unknown auth modes, short bearer tokens, and bearer tokens on oauth servers", async () => {
    const { POST } = await import("./route");
    for (const body of [
      { serverKey:"server-four",displayName:"S4",endpointUrl:"https://mcp.example.com/mcp",authMode:"basic" },
      { serverKey:"server-five",displayName:"S5",endpointUrl:"https://mcp.example.com/mcp",authMode:"bearer",bearerToken:"short" },
      { serverKey:"server-six",displayName:"S6",endpointUrl:"https://mcp.example.com/mcp",authMode:"oauth",bearerToken:"token-1234567890" },
    ]) {
      const response = await POST(new NextRequest("http://localhost/api/platform/mcp-servers", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(400);
    }
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("registers oauth servers without a platform credential and stores bearer tokens encrypted", async () => {
    const { POST } = await import("./route");
    queryMock.mockResolvedValue({ rows: [{ id: "server-oauth-1" }] });
    const oauth = await POST(new NextRequest("http://localhost/api/platform/mcp-servers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ serverKey:"notion-mcp",displayName:"Notion tools",endpointUrl:"https://mcp.notion.com/mcp",authMode:"oauth" }),
    }));
    expect(oauth.status).toBe(201);
    const oauthInsert = queryMock.mock.calls.at(-1)![0] as string;
    expect(oauthInsert).toContain("platform_credentials_encrypted");
    // OAuth mode stores no credential until the admin signs in.
    expect(queryMock.mock.calls.at(-1)![1]).toContain(null);

    const bearer = await POST(new NextRequest("http://localhost/api/platform/mcp-servers", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ serverKey:"n8n-mcp",displayName:"Automation tools",endpointUrl:"https://n8n.example.com/mcp-server/http",authMode:"bearer",bearerToken:"n8n-api-key-123456" }),
    }));
    expect(bearer.status).toBe(201);
    const bearerInsert = queryMock.mock.calls.at(-1)![0] as string;
    expect(bearerInsert).toContain("pgp_sym_encrypt");
    expect(queryMock.mock.calls.at(-1)![1]).toContain(JSON.stringify({ type: "bearer", bearerToken: "n8n-api-key-123456" }));
  });
});
