import { describe, expect, it } from "vitest";
import { advanceWhatsAppMessageStatus } from "./whatsapp-message-status";

describe("WhatsApp delivery status transitions", () => {
  it("does not regress delivered/read messages on late provider updates", () => {
    expect(advanceWhatsAppMessageStatus("delivered", "sent")).toBe("delivered");
    expect(advanceWhatsAppMessageStatus("read", "delivered")).toBe("read");
    expect(advanceWhatsAppMessageStatus("delivered", "unknown")).toBe("delivered");
  });

  it("keeps terminal failure/deletion states from being overwritten by late events", () => {
    expect(advanceWhatsAppMessageStatus("failed", "sent")).toBe("failed");
    expect(advanceWhatsAppMessageStatus("deleted", "read")).toBe("deleted");
  });

  it("accepts forward delivery progress", () => {
    expect(advanceWhatsAppMessageStatus("sent", "delivered")).toBe("delivered");
    expect(advanceWhatsAppMessageStatus("delivered", "read")).toBe("read");
    expect(advanceWhatsAppMessageStatus("unknown", "sent")).toBe("sent");
  });
});
