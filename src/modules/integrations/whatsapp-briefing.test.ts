import { describe, expect, it } from "vitest";
import { buildWhatsAppDailySummary, classifyWhatsAppGraphHealth, getWhatsAppMetaSendErrorCode, isValidE164Phone } from "./whatsapp-briefing";

describe("WhatsApp briefing safeguards", () => {
  it("accepts only E.164 recipient numbers", () => {
    expect(isValidE164Phone("+14155550123")).toBe(true);
    expect(isValidE164Phone("14155550123")).toBe(false);
    expect(isValidE164Phone("+0123456789")).toBe(false);
    expect(isValidE164Phone("+123")).toBe(false);
  });

  it("builds a bounded digest and reports the actual message count", () => {
    const messages = [
      { from_phone: "+14155550111", body: "  Please call tomorrow.  ", message_type: "text" },
      { from_phone: "+14155550111", body: null, message_type: "image" },
    ];
    const summary = buildWhatsAppDailySummary("2026-10-09", messages, 47);
    expect(summary).toContain("47 inbound message(s)");
    expect(summary).toContain("Please call tomorrow.");
    expect(summary).toContain("[image message]");
    expect(summary).toContain("45 earlier message(s)");
    expect(summary.length).toBeLessThanOrEqual(950);
  });

  it("creates a truthful empty-day digest", () => {
    expect(buildWhatsAppDailySummary("2026-10-09", [], 0)).toContain("No new inbound messages");
  });
  it("classifies Meta authentication failures before storing the run error code", () => {
    expect(getWhatsAppMetaSendErrorCode(401, null)).toBe("META_AUTH_OR_PERMISSION_REJECTED");
    expect(getWhatsAppMetaSendErrorCode(403, { error: { code: 10 } })).toBe("META_AUTH_OR_PERMISSION_REJECTED");
    expect(getWhatsAppMetaSendErrorCode(400, { error: { code: 200 } })).toBe("META_AUTH_OR_PERMISSION_REJECTED");
    expect(getWhatsAppMetaSendErrorCode(400, { error: { code: 190 } })).toBe("META_AUTH_OR_PERMISSION_REJECTED");
    expect(getWhatsAppMetaSendErrorCode(500, null)).toBe("META_HTTP_500");
  });

  it("distinguishes revoked permissions from transient Graph API failures", () => {
    expect(classifyWhatsAppGraphHealth(200, { id: "123" })).toBe("healthy");
    expect(classifyWhatsAppGraphHealth(200, { data: [] })).toBe("unavailable");
    expect(classifyWhatsAppGraphHealth(400, { error: { code: 190 } })).toBe("rejected");
    expect(classifyWhatsAppGraphHealth(400, { error: { code: 10 } })).toBe("rejected");
    expect(classifyWhatsAppGraphHealth(429, { error: { code: 4 } })).toBe("unavailable");
    expect(classifyWhatsAppGraphHealth(503, null)).toBe("unavailable");
  });
});
