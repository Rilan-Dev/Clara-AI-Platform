import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { constantTimeEquals, verifyMetaWebhookSignature, whatsappEventKey, whatsappOpaqueEventKey } from "./whatsapp-webhook";

describe("WhatsApp webhook security helpers", () => {
  const secret = "test-meta-app-secret";

  it("accepts the HMAC for the exact raw request body", () => {
    const raw = '{"object":"whatsapp_business_account","entry":[]}';
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    expect(verifyMetaWebhookSignature(raw, signature, secret)).toBe(true);
  });

  it("rejects a changed body, malformed header, or absent secret", () => {
    const raw = '{"entry":[]}';
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    expect(verifyMetaWebhookSignature(raw + " ", signature, secret)).toBe(false);
    expect(verifyMetaWebhookSignature(raw, "sha256=not-hex", secret)).toBe(false);
    expect(verifyMetaWebhookSignature(raw, signature, "")).toBe(false);
    expect(verifyMetaWebhookSignature(raw, null, secret)).toBe(false);
  });

  it("compares secrets without accepting different-length values", () => {
    expect(constantTimeEquals("same", "same")).toBe(true);
    expect(constantTimeEquals("same", "sam")).toBe(false);
  });

  it("builds stable idempotency keys while separating delivery transitions", () => {
    const base = { id: "wamid.123", status: "delivered", timestamp: "100" };
    expect(whatsappEventKey("status", base)).toBe(whatsappEventKey("status", base));
    expect(whatsappEventKey("status", base)).not.toBe(whatsappEventKey("status", { ...base, status: "read" }));
    expect(whatsappOpaqueEventKey('{"x":1}')).toBe(whatsappOpaqueEventKey('{"x":1}'));
  });
});
