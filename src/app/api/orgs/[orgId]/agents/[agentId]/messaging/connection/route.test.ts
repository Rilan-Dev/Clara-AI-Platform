import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";
import { requireAgentPermission, requireAuth } from "@/modules/auth/core/rbac";

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "test-encryption-key-that-is-long-enough-123456" }));
vi.mock("@/lib/public-origin", () => ({ resolvePublicOrigin: vi.fn(() => "https://clara.example") }));
vi.mock("@/modules/auth/core/rbac", () => ({ requireAgentPermission: vi.fn(), requireAuth: vi.fn() }));

const queryMock = vi.mocked(query);
const authMock = vi.mocked(requireAuth);
const permissionMock = vi.mocked(requireAgentPermission);
const orgId = "10000000-0000-0000-0000-000000000001";
const agentId = "20000000-0000-0000-0000-000000000002";
const authContext = {
  user: { id: "30000000-0000-0000-0000-000000000003", isSuperAdmin: false, status: "active" },
  session: { id: "test-session" },
};

function request(body: unknown): NextRequest {
  return new NextRequest(`https://clara.example/api/orgs/${orgId}/agents/${agentId}/messaging/connection`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("WhatsApp connection authorization and briefing gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureMigrated).mockResolvedValue(undefined);
    authMock.mockResolvedValue(authContext as never);
    permissionMock.mockResolvedValue({ orgId } as never);
    queryMock.mockResolvedValue([] as never);
  });

  it("fails closed when no active verified connection can enable briefing", async () => {
    const response = await POST(request({ action: "enable-briefing" }), {
      params: Promise.resolve({ orgId, agentId }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Daily briefings require an active verified phone and an opted-in recipient." });
    expect(queryMock).toHaveBeenCalledTimes(2);
    const gateSql = String(queryMock.mock.calls[1][0]);
    expect(gateSql).toContain("webhook_verified = true");
    expect(gateSql).toContain("briefing_recipient_opt_in_at IS NOT NULL");
    expect(gateSql).toContain("access_token_expires_at > now()");
  });

  it("rejects a cross-organisation agent scope before querying connection data", async () => {
    permissionMock.mockResolvedValue({ orgId: "40000000-0000-0000-0000-000000000004" } as never);
    const response = await POST(request({ action: "enable-briefing" }), {
      params: Promise.resolve({ orgId, agentId }),
    });
    expect(response.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("requires a valid recipient and explicit opt-in before storing briefing consent", async () => {
    const response = await POST(request({ action: "save-briefing-recipient", recipientPhone: "not-a-phone", optIn: false }), {
      params: Promise.resolve({ orgId, agentId }),
    });
    expect(response.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
