import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db", () => ({
  execute: mocks.execute,
  query: vi.fn(),
  queryOne: vi.fn(),
}));

import { batchSetUrlInclusion } from "./scrape-sessions-db";

describe("KB-scoped scrape URL batch toggles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(2);
  });

  it("binds authorized KB id and all URL ids into the same SQL mutation", async () => {
    const count = await batchSetUrlInclusion(
      "kb-authorized", ["url-1", "url-2"], true,
    );
    expect(count).toBe(2);
    expect(mocks.execute).toHaveBeenCalledTimes(1);

    const [sql, params] = mocks.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("UPDATE scrape_urls SET included = $1, status = $2");
    expect(sql).toContain("id IN ($4, $5)");
    expect(sql).toContain("session_id IN (SELECT id FROM scrape_sessions WHERE kb_id = $3)");
    expect(sql).toContain("status NOT IN ('scraping', 'completed')");
    expect(params).toEqual([true, "pending", "kb-authorized", "url-1", "url-2"]);
  });

  it("keeps exclude operations equally KB-scoped", async () => {
    await batchSetUrlInclusion("kb-authorized", ["url-foreign"], false);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("kb_id = $3"),
      [false, "excluded", "kb-authorized", "url-foreign"],
    );
  });

  it("does not execute empty batches", async () => {
    expect(await batchSetUrlInclusion("kb-authorized", [], true)).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("propagates failures instead of reporting unauthorized mutations as success", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("database error"));
    await expect(batchSetUrlInclusion("kb-authorized", ["url-1"], true))
      .rejects.toThrow("database error");
  });
});
