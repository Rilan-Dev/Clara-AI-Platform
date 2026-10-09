import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "test-encryption-key-that-is-long-enough-123456" }));

const queryMock = vi.mocked(query);
const originalCronSecret = process.env.CRON_SECRET;

function request(authorized = true): NextRequest {
  return new NextRequest("https://clara.example/api/cron/whatsapp-connection-health", {
    headers: authorized ? { authorization: "Bearer test-cron-secret" } : {},
  });
}

describe("WhatsApp scheduled connection health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    vi.mocked(ensureMigrated).mockResolvedValue(undefined);
    queryMock.mockResolvedValue([] as never);
  });

  afterEach(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    vi.unstubAllGlobals();
  });

  it("rejects requests without the cron secret before querying the database", async () => {
    const response = await GET(request(false));
    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("marks expired connections unhealthy and disables briefing eligibility", async () => {
    queryMock.mockResolvedValueOnce([{ id: "expired-connection" }] as never);
    queryMock.mockResolvedValueOnce([] as never);

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ expired: 1, checked: 0 });
    expect(String(queryMock.mock.calls[0][0])).toContain("access_token_expires_at <= now()");
    expect(String(queryMock.mock.calls[0][0])).toContain("daily_briefing_enabled = false");
    expect(String(queryMock.mock.calls[0][0])).toContain("TOKEN_EXPIRED");
  });

  it("marks provider-rejected access unhealthy without retrying delivery", async () => {
    queryMock.mockResolvedValueOnce([] as never);
    queryMock.mockResolvedValueOnce([{
      id: "connection-1",
      waba_id: "waba-1",
      access_token: "secret-token",
    }] as never);
    queryMock.mockResolvedValueOnce([] as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 190, message: "invalid token" } }), { status: 400 }),
    ));

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ checked: 1, rejected: 1, unavailable: 0 });
    expect(String(queryMock.mock.calls[2][0])).toContain("status = 'error'");
    expect(String(queryMock.mock.calls[2][0])).toContain("daily_briefing_enabled = false");
    expect(String(queryMock.mock.calls[2][0])).toContain("META_AUTH_OR_PERMISSION_REJECTED");
  });

  it("does not revoke a connection on transient Graph API failures", async () => {
    queryMock.mockResolvedValueOnce([] as never);
    queryMock.mockResolvedValueOnce([{
      id: "connection-2",
      waba_id: "waba-2",
      access_token: "secret-token",
    }] as never);
    queryMock.mockResolvedValueOnce([] as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 4, message: "rate limit" } }), { status: 429 }),
    ));

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ checked: 1, rejected: 0, unavailable: 1 });
    expect(String(queryMock.mock.calls[2][0])).not.toContain("status = 'error'");
  });
});
