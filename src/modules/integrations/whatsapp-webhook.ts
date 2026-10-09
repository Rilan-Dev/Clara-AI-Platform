import { createHmac, timingSafeEqual } from "node:crypto";

export function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!appSecret || !signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const supplied = signatureHeader.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return constantTimeEquals(expected, supplied.toLowerCase());
}

export function whatsappEventKey(kind: string, item: { id?: string; status?: string; timestamp?: string }): string {
  return createHmac("sha256", "clara-whatsapp-event-v1")
    .update([kind, item.id ?? "", item.status ?? "", item.timestamp ?? ""].join(":"))
    .digest("hex");
}

export function whatsappOpaqueEventKey(serializedEvent: string): string {
  return createHmac("sha256", "clara-whatsapp-event-v1").update(serializedEvent).digest("hex");
}
