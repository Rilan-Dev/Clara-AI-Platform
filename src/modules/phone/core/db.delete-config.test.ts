import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ pool: { query: mocks.query } }));
vi.mock("@/modules/events/outbox-db", () => ({ insertOutboxEvent: vi.fn() }));

import { deletePhoneConfig } from "./db";

describe("atomic KB-scoped phone configuration deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses both the config ID and the authorized KB ID in one delete query", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await expect(deletePhoneConfig("config-owned", "kb-owned")).resolves.toBe(true);

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM phone_call_configs WHERE id = \$1 AND kb_id = \$2/),
      ["config-owned", "kb-owned"],
    );
  });

  it("reports a missing/foreign config without permitting a global ID-only deletion", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(deletePhoneConfig("config-foreign", "kb-owned")).resolves.toBe(false);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("AND kb_id = $2"),
      ["config-foreign", "kb-owned"],
    );
  });

  it("does not report success when the deletion result has no affected rows", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: null, rows: [] });
    await expect(deletePhoneConfig("config-missing", "kb-owned")).resolves.toBe(false);
  });

  it("propagates DB failures instead of reporting successful deletion", async () => {
    mocks.query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(deletePhoneConfig("config-owned", "kb-owned"))
      .rejects.toThrow("database unavailable");
  });
});
