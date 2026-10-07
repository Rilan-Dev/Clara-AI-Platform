import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/lib/db", () => ({ query }));
vi.mock("@/lib/secrets", () => ({ ENCRYPTION_KEY: "test-key" }));

import { credentialVault } from "./credential-vault.js";

describe("credentialVault.updateStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([]);
  });

  it("only transitions an active connection", async () => {
    await credentialVault.updateStatus("connection-1", "org-1", "expired");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id=$2 AND org_id=$3 AND status='active'"),
      ["expired", "connection-1", "org-1", null, null],
    );
  });

  it("supports scoped status transitions", async () => {
    await credentialVault.updateStatus("connection-1", "org-1", "expired", "user-1", "agent-1");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("($4::uuid IS NULL OR user_id=$4 OR user_id IS NULL)"),
      ["expired", "connection-1", "org-1", "user-1", "agent-1"],
    );
  });

  it("uses an optimistic claimed_at guard for credential refresh writes", async () => {
    await credentialVault.updateCredentials(
      "connection-1",
      "org-1",
      { access_token: "new-token" },
      "user-1",
      "agent-1",
      12345,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("::jsonb ->> 'claimed_at'"),
      [
        JSON.stringify({ access_token: "new-token" }),
        "test-key",
        "connection-1",
        "org-1",
        "user-1",
        "agent-1",
        12345,
      ],
    );
  });
});
