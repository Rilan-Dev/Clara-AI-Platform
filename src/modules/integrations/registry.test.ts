import { describe, expect, it } from "vitest";
import { getCategories, getIntegration, listIntegrations } from "@/modules/integrations/registry";

describe("Clara integration registry", () => {
  it("contains the Doable communication catalog reference entries", () => {
    expect(getIntegration("gmail")?.displayName).toBe("Gmail");
    expect(getIntegration("whatsapp")?.displayName).toBe("WhatsApp");
    expect(getIntegration("twilio")?.displayName).toBe("Twilio");
  });
  it("supports deterministic category and search discovery", () => {
    expect(listIntegrations({ category: "communication" }).length).toBeGreaterThan(0);
    expect(listIntegrations({ search: "gmail" }).map(x => x.id)).toContain("gmail");
  });
  it("reports category counts without exposing credentials", () => {
    expect(getCategories().some(x => x.category === "communication")).toBe(true);
    expect(JSON.stringify(listIntegrations())).not.toContain("credentials");
  });
});
