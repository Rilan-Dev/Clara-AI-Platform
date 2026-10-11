import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const queryMock = vi.fn();
const requireAuthMock = vi.fn();
const requireSuperAdminMock = vi.fn();
const recordPlatformMcpAuditMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db/migrate", () => ({
  ensureMigrated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: requireAuthMock,
  requireSuperAdmin: requireSuperAdminMock,
}));

vi.mock("@/modules/mcp", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/mcp")>();
  return {
    ...original,
    recordPlatformMcpAudit: recordPlatformMcpAuditMock,
  };
});

const CURRENT_SETTINGS = {
  mcp_enabled: true,
  emergency_disabled: false,
  security_policy: {
    requireHttps: true,
    blockPrivateNetworks: true,
    maxRedirects: 0,
    requestTimeoutMs: 15000,
    tlsVerify: true,
  },
  platform_catalog_enabled: false,
  clara_hosted_enabled: false,
  updated_at: new Date("2026-10-01T00:00:00Z"),
  updated_by: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ user: { id: "admin-1", isSuperAdmin: true } });
  requireSuperAdminMock.mockResolvedValue(undefined);
  queryMock.mockResolvedValue([CURRENT_SETTINGS]);
});

function put(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/platform/mcp-settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(): NextRequest {
  return new NextRequest("http://localhost/api/platform/mcp-settings");
}

async function handlers() {
  return import("./route");
}

describe("GET /api/platform/mcp-settings", () => {
  it("returns mapped settings for a super admin", async () => {
    const { GET } = await handlers();
    const response = await GET(get());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.settings.mcpEnabled).toBe(true);
    expect(data.settings.securityPolicy.requireHttps).toBe(true);
  });

  it("rejects non-super-admin callers", async () => {
    requireSuperAdminMock.mockRejectedValue(
      Object.assign(new Error("forbidden"), { status: 403 }),
    );
    const { GET } = await handlers();
    const response = await GET(get());
    expect(response.status >= 400).toBe(true);
  });
});

describe("PUT /api/platform/mcp-settings — confirmation guards", () => {
  it("requires typed confirmation for platform-wide disablement", async () => {
    const { PUT } = await handlers();
    const response = await PUT(put({ mcpEnabled: false }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe("CONFIRMATION_REQUIRED");
    expect(data.error).toContain("DISABLE-MCP");
    // Nothing was written.
    expect(queryMock).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE mcp_platform_settings"),
      expect.anything(),
    );
  });

  it("requires typed confirmation for emergency disablement", async () => {
    const { PUT } = await handlers();
    const response = await PUT(put({ emergencyDisabled: true }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe("CONFIRMATION_REQUIRED");
    expect(data.error).toContain("EMERGENCY-DISABLE");
  });

  it("applies emergency disablement with the right confirmation", async () => {
    const { PUT } = await handlers();
    const response = await PUT(
      put({ emergencyDisabled: true, confirmation: "EMERGENCY-DISABLE" }),
    );
    expect(response.status).toBe(200);
    const updateCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE mcp_platform_settings"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]?.[1]).toBe(true); // emergency_disabled = true
    // The high-impact change is audited.
    expect(recordPlatformMcpAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "platform.emergency_disabled" }),
    );
  });

  it("applies ordinary settings without confirmation and audits the diff", async () => {
    const { PUT } = await handlers();
    const response = await PUT(put({ platformCatalogEnabled: true }));
    expect(response.status).toBe(200);
    expect(recordPlatformMcpAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "platform.settings_updated",
        details: expect.objectContaining({
          changes: expect.objectContaining({
            platformCatalogEnabled: { before: false, after: true },
          }),
        }),
      }),
    );
  });

  it("rejects attempts to disable TLS verification", async () => {
    const { PUT } = await handlers();
    const response = await PUT(
      put({ securityPolicy: { tlsVerify: false } }),
    );
    // tlsVerify is normalized back to true; the request is still valid.
    expect(response.status).toBe(200);
    const updateCall = queryMock.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE mcp_platform_settings"),
    );
    const policy = JSON.parse(String(updateCall?.[1]?.[2]));
    expect(policy.tlsVerify).toBe(true);
  });

  it("rejects invalid numeric policy values", async () => {
    const { PUT } = await handlers();
    const response = await PUT(
      put({ securityPolicy: { maxRedirects: 99 } }),
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid MCP settings");
    expect(Array.isArray(data.issues)).toBe(true);
  });
});
