export type WhatsAppMessageStatus = "received" | "queued" | "sent" | "delivered" | "read" | "failed" | "deleted" | "unknown";

const VALID = new Set<WhatsAppMessageStatus>(["received", "queued", "sent", "delivered", "read", "failed", "deleted", "unknown"]);

export function advanceWhatsAppMessageStatus(currentValue: string, incomingValue: string): WhatsAppMessageStatus {
  const current = VALID.has(currentValue as WhatsAppMessageStatus) ? currentValue as WhatsAppMessageStatus : "unknown";
  const incoming = VALID.has(incomingValue as WhatsAppMessageStatus) ? incomingValue as WhatsAppMessageStatus : "unknown";
  if (current === "read" || current === "deleted" || current === "failed") return current;
  if (current === "delivered" && ["sent", "failed", "unknown"].includes(incoming)) return current;
  if (incoming === "unknown" && ["sent", "delivered"].includes(current)) return current;
  return incoming;
}
