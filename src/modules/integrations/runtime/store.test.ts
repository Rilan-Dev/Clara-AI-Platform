import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: queryMock,
}));

import { PostgresStore } from "@/modules/integrations/runtime/store";

describe("integration PostgresStore tenant isolation", () => {
  beforeEach(() => queryMock.mockReset());

  it("binds FLOW keys to organisation and user", async () => {
    queryMock.mockResolvedValueOnce([{ value: { ok: true } }]);
    const store = new PostgresStore("user-1", "org-1", "agent-1");

    await store.get("connection-state", "FLOW");

    expect(queryMock).toHaveBeenCalledWith(
      "SELECT value FROM integration_store WHERE scope_key=$1 AND org_id=$2",
      ["flow:org-1:user-1:connection-state", "org-1"],
    );
  });

  it("requires organisation scope for deletes", async () => {
    queryMock.mockResolvedValueOnce([]);
    const store = new PostgresStore("user-1", "org-1", "agent-1");

    await store.delete("connection-state", "FLOW");

    expect(queryMock).toHaveBeenCalledWith(
      "DELETE FROM integration_store WHERE scope_key=$1 AND org_id=$2",
      ["flow:org-1:user-1:connection-state", "org-1"],
    );
  });
});
