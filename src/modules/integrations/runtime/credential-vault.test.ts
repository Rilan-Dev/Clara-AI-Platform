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
      "UPDATE integration_connections SET status=$1,updated_at=now() WHERE id=$2 AND org_id=$3 AND status='active'",
      ["expired", "connection-1", "org-1"],
    );
  });
});
