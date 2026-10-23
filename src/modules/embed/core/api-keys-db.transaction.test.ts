import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ pool: { query: mocks.poolQuery } }));

import { createApiKey } from "./api-keys-db";

function dbRow() {
  return {
    id: "key-1",
    kb_id: "kb-1",
    org_id: "org-1",
    name: "Published explore link",
    key_prefix: "clr_sample",
    is_active: true,
    allowed_origins: [],
    rate_limit_per_hour: 500,
    design_edit_enabled: false,
    created_by: "editor-1",
    created_at: new Date().toISOString(),
    last_used_at: null,
  };
}
const options = {
  kbId: "kb-1", orgId: "org-1",
  name: "Published explore link", createdBy: "editor-1",
};

describe("embed API key insertion transaction support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockResolvedValue({ rows: [dbRow()] });
    mocks.clientQuery.mockResolvedValue({ rows: [dbRow()] });
  });

  it("uses the exact caller-owned transaction client, never the independent pool", async () => {
    const client = { query: mocks.clientQuery } as unknown as PoolClient;
    const created = await createApiKey(options, client);
    expect(created.key.id).toBe("key-1");
    expect(created.rawKey).toMatch(/^clr_[a-f0-9]{48}$/);
    expect(mocks.clientQuery).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO api_keys/),
      expect.arrayContaining(["kb-1", "org-1", "Published explore link", "editor-1"]),
    );
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("preserves the public createApiKey default-pool behavior for other callers", async () => {
    await createApiKey(options);
    expect(mocks.poolQuery).toHaveBeenCalledOnce();
    expect(mocks.clientQuery).not.toHaveBeenCalled();
  });

  it("propagates insertion failures so the owning transaction can roll back", async () => {
    mocks.clientQuery.mockRejectedValueOnce(new Error("insertion failed"));
    await expect(
      createApiKey(options, { query: mocks.clientQuery } as unknown as PoolClient),
    ).rejects.toThrow("insertion failed");
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
});
