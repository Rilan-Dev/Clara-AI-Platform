import { beforeEach, describe, expect, it, vi } from "vitest";

const vault = {
  decrypt: vi.fn(),
  updateCredentials: vi.fn(),
  updateStatus: vi.fn(),
};

vi.mock("./credential-vault.js", () => ({ credentialVault: vault }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import { ensureTokenFresh } from "./runner-helpers.js";

describe("OAuth token refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not refresh a token that is still outside the refresh window", async () => {
    vault.decrypt.mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      claimed_at: Math.floor(Date.now() / 1000),
      token_url: "https://oauth.example.com/token",
      client_id: "client-id",
      client_secret: "client-secret",
      data: {},
    });

    await ensureTokenFresh("connection-1", "org-1", "oauth2");

    expect(fetch).not.toHaveBeenCalled();
    expect(vault.updateCredentials).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and persists the replacement tenant-scoped", async () => {
    const now = Math.floor(Date.now() / 1000);
    vault.decrypt.mockResolvedValue({
      access_token: "old-access",
      refresh_token: "old-refresh",
      expires_in: 60,
      claimed_at: now - 3600,
      token_url: "https://oauth.example.com/token",
      client_id: "client-id",
      client_secret: "client-secret",
      data: { provider: "example" },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
      token_type: "Bearer",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await ensureTokenFresh("connection-1", "org-1", "oauth2");

    expect(fetch).toHaveBeenCalledWith(
      "https://oauth.example.com/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );
    expect(vault.updateCredentials).toHaveBeenCalledWith(
      "connection-1",
      "org-1",
      expect.objectContaining({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      }),
    );
    expect(vault.updateStatus).not.toHaveBeenCalled();
  });

  it("marks the tenant-scoped connection expired on an invalid-grant response", async () => {
    vault.decrypt.mockResolvedValue({
      access_token: "old-access",
      refresh_token: "old-refresh",
      expires_in: 60,
      claimed_at: Math.floor(Date.now() / 1000) - 3600,
      token_url: "https://oauth.example.com/token",
      client_id: "client-id",
      client_secret: "client-secret",
      data: {},
    });
    vi.mocked(fetch).mockResolvedValue(new Response("invalid_grant", { status: 400 }));

    await expect(ensureTokenFresh("connection-1", "org-1", "oauth2"))
      .rejects.toThrow("OAuth token refresh failed (400)");

    expect(vault.updateStatus).toHaveBeenCalledWith("connection-1", "org-1", "expired");
  });

  it("rejects non-HTTPS token endpoints before making a request", async () => {
    vault.decrypt.mockResolvedValue({
      access_token: "old-access",
      refresh_token: "old-refresh",
      expires_in: 60,
      claimed_at: Math.floor(Date.now() / 1000) - 3600,
      token_url: "http://oauth.example.com/token",
      client_id: "client-id",
      client_secret: "client-secret",
      data: {},
    });

    await expect(ensureTokenFresh("connection-1", "org-1", "oauth2"))
      .rejects.toThrow("OAuth token endpoint must use HTTPS");

    expect(fetch).not.toHaveBeenCalled();
  });
});
