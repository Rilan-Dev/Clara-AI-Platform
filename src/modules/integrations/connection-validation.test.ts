import { describe, expect, it } from "vitest";
import { validateConnectionCredentials } from "./connection-validation";

describe("validateConnectionCredentials", () => {
  it("rejects OAuth client configuration without a user access token", () => {
    expect(validateConnectionCredentials("oauth2", {
      client_id: "client-id",
      client_secret: "client-secret",
    })).toContain("access token");
  });

  it("accepts OAuth token data produced by the consent callback", () => {
    expect(validateConnectionCredentials("oauth2", {
      access_token: "access-token",
      refresh_token: "refresh-token",
      client_id: "client-id",
      client_secret: "client-secret",
      token_url: "https://provider.example/token",
      claimed_at: 1,
      data: {},
    })).toBeNull();
  });

  it("requires both basic-auth values", () => {
    expect(validateConnectionCredentials("basic_auth", { username: "user" })).toContain("username and password");
    expect(validateConnectionCredentials("basic_auth", { username: "user", password: "pass" })).toBeNull();
  });

  it("validates required custom-auth fields on the server", () => {
    const fields = [{ name: "apiKey", displayName: "API key", type: "secret" as const, required: true }];
    expect(validateConnectionCredentials("custom_auth", {}, fields)).toContain("API key");
    expect(validateConnectionCredentials("custom_auth", { apiKey: "secret" }, fields)).toBeNull();
  });

  it("rejects credential writes for integrations that require no credentials", () => {
    expect(validateConnectionCredentials("none", {})).toContain("does not accept");
  });
});
