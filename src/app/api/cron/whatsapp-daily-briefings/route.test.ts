import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { ensureMigrated } from "@/lib/db/migrate";
import { query } from "@/lib/db";

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "test-encryption-key-that-is-long-enough-123456" }));
vi.mock("@/modules/integrations/whatsapp-briefing", () => ({
  buildWhatsAppDailySummary: vi.fn(() => "test summary"),
  getWhatsAppMetaSendErrorCode: vi.fn(() => "META_HTTP_500"),
}));
vi.mock("@/modules/integrations/whatsapp-message-status", () => ({
  advanceWhatsAppMessageStatus: vi.fn((current: string) => current),
}));

const queryMock = vi.mocked(query);
const savedEnv = {
  cron: process.env.CRON_SECRET,
  template: process.env.WHATSAPP_DAILY_BRIEFING_TEMPLATE_NAME,
  language: process.env.WHATSAPP_DAILY_BRIEFING_TEMPLATE_LANGUAGE,
};

function request(authorized = true): NextRequest {
  return new NextRequest("https://clara.example/api/cron/whatsapp-daily-briefings", {
    headers: authorized ? { authorization: "Bearer test-cron-secret" } : {},
  });
}

describe("WhatsApp daily briefing cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WHATSAPP_DAILY_BRIEFING_TEMPLATE_NAME = "clara_daily_briefing";
    process.env.WHATSAPP_DAILY_BRIEFING_TEMPLATE_LANGUAGE = "en_US";
    vi.mocked(ensureMigrated).mockResolvedValue(undefined);
    queryMock.mockResolvedValue([] as never);
  });

  afterEach(() => {
    if (savedEnv.cron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = savedEnv.cron;
    if (savedEnv.template === undefined) delete process.env.WHATSAPP_DAILY_BRIEFING_TEMPLATE_NAME;
    else process.env.WHATSAPP_DAILY_BRIEFING_TEMPLATE_NAME = savedEnv.template;
    if (savedEnv.language === undefined) delete process.env.WHATSAPP_DAILY_BRIEFING_TEMPLATE_LANGUAGE;
    else process.env.WHATSAPP_DAILY_BRIEFING_TEMPLATE_LANGUAGE = savedEnv.language;
  });

  it("rejects calls without the cron secret", async () => {
    const response = await GET(request(false));
    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("quarantines stale ambiguous sends without making them retryable", async () => {
    queryMock.mockResolvedValueOnce([] as never);
    queryMock.mockResolvedValueOnce([{ id: "ambiguous-run" }] as never);
    queryMock.mockResolvedValueOnce([] as never);

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, ambiguous: 1, scanned: 0 });
    const reconcileSql = String(queryMock.mock.calls[1][0]);
    expect(reconcileSql).toContain("status = 'sending'");
    expect(reconcileSql).toContain("provider_message_id IS NULL");
    expect(reconcileSql).toContain("SEND_OUTCOME_UNKNOWN");
    expect(reconcileSql).toContain("GREATEST(attempt_count, 3)");
    expect(reconcileSql).toContain("interval '30 minutes'");
  });
});
