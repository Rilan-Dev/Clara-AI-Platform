import { describe, expect, it } from "vitest";
import { getOAuthSetupGuide } from "./oauth-setup-guides";

describe("provider OAuth setup guides", () => {
  it("provides official Google setup guidance for Google integrations", () => {
    expect(getOAuthSetupGuide("gmail")).toMatchObject({
      url: "https://console.cloud.google.com/apis/credentials",
      label: "Google Cloud Console",
    });
    expect(getOAuthSetupGuide("google_calendar")?.note).toContain("Authorized redirect URIs");
  });

  it("provides provider-specific guidance for supported non-Google OAuth apps", () => {
    expect(getOAuthSetupGuide("microsoft_outlook")?.url).toBe("https://entra.microsoft.com/");
    expect(getOAuthSetupGuide("hubspot")?.url).toBe("https://developers.hubspot.com/");
    expect(getOAuthSetupGuide("zoho_crm")?.note).toContain("data center");
  });

  it("returns no guessed provider-console URL for unknown integrations", () => {
    expect(getOAuthSetupGuide("unlisted_provider")).toBeNull();
  });
});
