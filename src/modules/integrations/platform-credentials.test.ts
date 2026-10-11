import { describe, expect, it } from "vitest";
import {
  isPlatformConfigured,
  platformCredentialFields,
  requiresPlatformCredentials,
  requiresPlatformOAuthApp,
  validatePlatformCredentialInput,
} from "./platform-credentials";
import type { IntegrationDefinition } from "./types";

function def(overrides: Partial<IntegrationDefinition>): IntegrationDefinition {
  return {
    id: "test",
    piecePackage: "@activepieces/piece-test",
    displayName: "Test",
    description: "Test integration",
    logoUrl: "https://cdn.activepieces.com/pieces/test.png",
    category: "productivity",
    tags: [],
    authType: "secret_text",
    actions: ["create_thing"],
    tier: "built_in",
    requiresOAuthApp: false,
    supportsUserProvidedCredentials: true,
    ...overrides,
  };
}

describe("platformCredentialFields", () => {
  it("derives a single secret field for secret_text", () => {
    expect(platformCredentialFields(def({ authType: "secret_text" }))).toEqual([
      { name: "api_key", displayName: "API key / access token", type: "secret", required: true },
    ]);
  });

  it("derives username + password for basic_auth", () => {
    expect(platformCredentialFields(def({ authType: "basic_auth" }))).toEqual([
      { name: "username", displayName: "Username", type: "text", required: true },
      { name: "password", displayName: "Password", type: "secret", required: true },
    ]);
  });

  it("prefers the registry's customAuthFields when declared", () => {
    const fields = [
      { name: "account", displayName: "Account", type: "text" as const, required: true },
      { name: "username", displayName: "Username", type: "text" as const, required: true },
    ];
    expect(platformCredentialFields(def({ authType: "custom_auth", customAuthFields: fields }))).toEqual(fields);
  });
});

describe("isPlatformConfigured", () => {
  it("requires an OAuth app for oauth2 + requiresOAuthApp", () => {
    const d = def({ authType: "oauth2", requiresOAuthApp: true });
    expect(isPlatformConfigured(d, { hasOAuthApp: false, hasCredentials: true })).toBe(false);
    expect(isPlatformConfigured(d, { hasOAuthApp: true, hasCredentials: false })).toBe(true);
  });

  it("requires platform credentials for secret_text / basic_auth / custom_auth", () => {
    expect(isPlatformConfigured(def({ authType: "secret_text" }), { hasOAuthApp: true, hasCredentials: false })).toBe(false);
    expect(isPlatformConfigured(def({ authType: "secret_text" }), { hasOAuthApp: false, hasCredentials: true })).toBe(true);
    expect(isPlatformConfigured(def({ authType: "custom_auth" }), { hasOAuthApp: false, hasCredentials: true })).toBe(true);
    expect(isPlatformConfigured(def({ authType: "basic_auth" }), { hasOAuthApp: false, hasCredentials: true })).toBe(true);
  });

  it("treats none and org-managed oauth2 as always configured", () => {
    expect(isPlatformConfigured(def({ authType: "none" }), { hasOAuthApp: false, hasCredentials: false })).toBe(true);
    expect(isPlatformConfigured(def({ authType: "oauth2", requiresOAuthApp: false }), { hasOAuthApp: false, hasCredentials: false })).toBe(true);
  });
});

describe("validatePlatformCredentialInput", () => {
  it("rejects non-object payloads", () => {
    const result = validatePlatformCredentialInput(def({ authType: "secret_text" }), "nope");
    expect("error" in result && result.error).toContain("credentials object");
  });

  it("reports missing required fields by display name", () => {
    const result = validatePlatformCredentialInput(def({ authType: "secret_text" }), {});
    expect("error" in result && result.error).toContain("API key / access token");
  });

  it("trims and returns values for a valid payload", () => {
    const result = validatePlatformCredentialInput(def({ authType: "secret_text" }), { api_key: "  tok  " });
    expect(result).toEqual({ values: { api_key: "tok" } });
  });

  it("enforces required custom fields", () => {
    const d = def({
      authType: "custom_auth",
      customAuthFields: [
        { name: "account", displayName: "Account", type: "text", required: true },
        { name: "role", displayName: "Role", type: "text", required: false },
      ],
    });
    const bad = validatePlatformCredentialInput(d, { account: "" });
    expect("error" in bad && bad.error).toContain("Account");
    const good = validatePlatformCredentialInput(d, { account: "acme", role: "admin" });
    expect(good).toEqual({ values: { account: "acme", role: "admin" } });
  });

  it("rejects oversized values", () => {
    const result = validatePlatformCredentialInput(def({ authType: "secret_text" }), { api_key: "x".repeat(9000) });
    expect("error" in result && result.error).toContain("too long");
  });

  it("rejects payloads for integrations without platform credentials", () => {
    const result = validatePlatformCredentialInput(def({ authType: "none" }), { any: "thing" });
    expect("error" in result && result.error).toContain("does not use platform-managed credentials");
  });
});

describe("auth-type predicates", () => {
  it("requiresPlatformCredentials is true only for non-OAuth credential types", () => {
    expect(requiresPlatformCredentials(def({ authType: "secret_text" }))).toBe(true);
    expect(requiresPlatformCredentials(def({ authType: "basic_auth" }))).toBe(true);
    expect(requiresPlatformCredentials(def({ authType: "custom_auth" }))).toBe(true);
    expect(requiresPlatformCredentials(def({ authType: "oauth2" }))).toBe(false);
    expect(requiresPlatformCredentials(def({ authType: "none" }))).toBe(false);
  });

  it("requiresPlatformOAuthApp is true only for oauth2 + requiresOAuthApp", () => {
    expect(requiresPlatformOAuthApp(def({ authType: "oauth2", requiresOAuthApp: true }))).toBe(true);
    expect(requiresPlatformOAuthApp(def({ authType: "oauth2", requiresOAuthApp: false }))).toBe(false);
    expect(requiresPlatformOAuthApp(def({ authType: "secret_text" }))).toBe(false);
  });
});
