import { describe, expect, it } from "vitest";
import { buildWhatsAppDailySummary, isValidE164Phone } from "./whatsapp-briefing";

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
});
