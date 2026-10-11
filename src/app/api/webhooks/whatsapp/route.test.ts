import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { ensureMigrated } from "@/lib/db/migrate";
import { withTransaction } from "@/lib/db";

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: vi.fn() }));
vi.mock("@/lib/db", () => ({ withTransaction: vi.fn() }));

const txMock = vi.mocked(withTransaction);

describe("WhatsApp webhook route idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.META_APP_SECRET = "test-meta-secret";
    vi.mocked(ensureMigrated).mockResolvedValue(undefined);
  });

  it("acknowledges a duplicate webhook retry without repeating message persistence", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "connection-1", org_id: "org-1", agent_id: "agent-1", display_phone_number: "+14155550100" }] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
    };
    txMock.mockImplementation(async (callback) => callback(client as never));

    const raw = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "phone-1" },
        messages: [{ id: "wamid.duplicate", from: "14155550123", timestamp: "1791500000", type: "text", text: { body: "hello" } }],
      } }] }],
    });
    const signature = `sha256=${createHmac("sha256", process.env.META_APP_SECRET!).update(raw).digest("hex")}`;
    const makeRequest = () => new NextRequest("https://clara.example/api/webhooks/whatsapp", {
      method: "POST", headers: { "x-hub-signature-256": signature, "content-type": "application/json" }, body: raw,
    });

    const first = await POST(makeRequest());
    const second = await POST(makeRequest());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(txMock).toHaveBeenCalledTimes(2);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(String(client.query.mock.calls[1][0])).toContain("ON CONFLICT(event_key) DO NOTHING");
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO whatsapp_messages"))).toBe(false);
  });
});
