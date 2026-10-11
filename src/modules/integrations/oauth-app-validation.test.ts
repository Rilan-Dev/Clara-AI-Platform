import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeScopes, validateRedirectUri } from "./oauth-app-validation";

describe("platform OAuth app configuration validation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires HTTPS outside local development", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(validateRedirectUri("http://localhost/callback")).toContain("HTTPS");
    expect(validateRedirectUri("https://clara.example/api/integrations/oauth/callback")).toBeNull();
  });

  it("allows loopback HTTP only in non-production environments", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(validateRedirectUri("http://localhost:3000/api/integrations/oauth/callback")).toBeNull();
    expect(validateRedirectUri("http://127.0.0.1:3000/api/integrations/oauth/callback")).toBeNull();
    expect(validateRedirectUri("http://evil.example/api/integrations/oauth/callback")).toContain("HTTPS");
  });

  it("rejects relative, credential-bearing, and fragment-bearing redirect URIs", () => {
    expect(validateRedirectUri("/api/integrations/oauth/callback")).toContain("absolute URL");
    expect(validateRedirectUri("https://clara.example/api/oauth/callback")).toContain("canonical Clara callback");
    expect(validateRedirectUri("https://your-domain/api/integrations/oauth/callback")).toContain("placeholder");
    expect(validateRedirectUri("https://clara.example/api/integrations/oauth/callback?next=/")).toContain("query string");
    expect(validateRedirectUri("https://user:pass@example.com/callback")).toContain("credentials");
    expect(validateRedirectUri("https://example.com/callback#fragment")).toContain("fragment");
  });

  it("deduplicates scopes and rejects malformed or oversized scope lists", () => {
    expect(normalizeScopes(["mail.read", " mail.read ", "", "mail.write"])).toEqual([
      "mail.read",
      "mail.write",
    ]);
    expect(normalizeScopes("mail.read")).toBeNull();
    expect(normalizeScopes(Array.from({ length: 101 }, (_, i) => `scope.${i}`))).toBeNull();
    expect(normalizeScopes(["x".repeat(201)])).toBeNull();
  });
});
