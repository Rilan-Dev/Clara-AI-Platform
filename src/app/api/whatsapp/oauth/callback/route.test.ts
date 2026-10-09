import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "./route";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAgentPermission, requireAuth } from "@/modules/auth/core/rbac";

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "test-encryption-key-that-is-long-enough-123456" }));
vi.mock("@/modules/auth/core/rbac", () => ({ requireAgentPermission: vi.fn(), requireAuth: vi.fn() }));

const queryMock = vi.mocked(query);
const authMock = vi.mocked(requireAuth);
const permissionMock = vi.mocked(requireAgentPermission);
const orgId = "10000000-0000-0000-0000-000000000001";
const agentId = "20000000-0000-0000-0000-000000000002";
const userId = "30000000-0000-0000-0000-000000000003";
const authContext = {
  user: { id: userId, isSuperAdmin: false, status: "active" },
  session: { id: "test-session" },
};

function callback(state = "one-time-state"): NextRequest {
  return new NextRequest(`https://clara.example/api/whatsapp/oauth/callback?state=${encodeURIComponent(state)}&code=provider-code`);
}

describe("WhatsApp Meta OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureMigrated).mockResolvedValue(undefined);
    authMock.mockResolvedValue(authContext as never);
    permissionMock.mockResolvedValue({ orgId } as never);
    queryMock.mockResolvedValue([] as never);
  });

  it("rejects replayed, expired, or user-unbound state before contacting Meta", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const response = await GET(callback(),);
      expect(response.status).toBe(400);
      expect(queryMock).toHaveBeenCalledTimes(1);
      expect(permissionMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not consume state or exchange the code after agent permission is revoked", async () => {
    queryMock.mockResolvedValueOnce([{
      org_id: orgId, agent_id: agentId, user_id: userId,
      redirect_uri: "https://clara.example/api/whatsapp/oauth/callback",
    }] as never);
    permissionMock.mockRejectedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const response = await GET(callback());
      expect(response.status).toBe(403);
      expect(queryMock).toHaveBeenCalledTimes(1);
      expect(String(queryMock.mock.calls[0][0])).toContain("SELECT org_id, agent_id, user_id");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
