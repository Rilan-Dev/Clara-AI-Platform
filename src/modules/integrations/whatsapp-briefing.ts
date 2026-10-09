export type BriefingMessage = { from_phone: string | null; body: string | null; message_type: string };

export function isValidE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function buildWhatsAppDailySummary(date: string, messages: BriefingMessage[], totalCount = messages.length): string {
  const header = `Clara daily WhatsApp briefing · ${date}\n${totalCount} inbound message(s) in the last 24 hours.`;
  if (messages.length === 0) return `${header}\nNo new inbound messages were received.`.slice(0, 950);
  const lines = messages.slice(0, 24).reverse().map((message) => {
    const sender = message.from_phone || "Unknown contact";
    const excerpt = (message.body || `[${message.message_type} message]`).replace(/\s+/g, " ").trim().slice(0, 120);
    return `• ${sender}: ${excerpt}`;
  });
  const omitted = Math.max(0, totalCount - lines.length);
  return `${header}\n${lines.join("\n")}${omitted > 0 ? `\n…and ${omitted} earlier message(s).` : ""}`.slice(0, 950);
}


export function getWhatsAppMetaSendErrorCode(status: number, result: unknown): string {
  const error = result && typeof result === "object" && "error" in result
    ? (result as { error?: { code?: unknown } }).error : undefined;
  if (status === 401 || status === 403 || error?.code === 190 || error?.code === 102) {
    return "META_AUTH_OR_PERMISSION_REJECTED";
  }
  return `META_HTTP_${status}`;
}
