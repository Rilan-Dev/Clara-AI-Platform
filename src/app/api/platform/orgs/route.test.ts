import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireSuperAdmin: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdmin: mocks.requireSuperAdmin,
}));

import { GET } from "./route";

function req(query = ""): NextRequest {
  return new NextRequest(`https://clara.example.test/api/platform/orgs${query}`);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureMigrated.mockResolvedValue(undefined);
  mocks.requireAuth.mockResolvedValue({ user: { id: "platform-admin" } });
  mocks.requireSuperAdmin.mockResolvedValue(undefined);
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes("COUNT(*)::int AS total FROM organisations") ? [{ total: 42 }] : []
  );
});

describe("super-admin organisation list pagination", () => {
  it("preserves ordinary pagination and accurate total pages", async () => {
    const response = await GET(req("?page=3&perPage=10"));
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("LIMIT $1 OFFSET $2"), [10, 20]);
    expect(await response.json()).toMatchObject({ page: 3, perPage: 10, total: 42, totalPages: 5 });
  });

  it.each([
    "?page=nonsense&perPage=nonsense",
    "?page=-1&perPage=-5",
    "?page=0&perPage=0",
    "?page=1.5&perPage=2.5",
    "?page=2junk&perPage=4junk",
    "?page=99999999999999999999999999&perPage=Infinity",
    "?page=&perPage=",
  ])("normalizes malformed pagination before sending DB bind values: %s", async (queryString) => {
    const response = await GET(req(queryString));
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), [20, 0]);
    expect(await response.json()).toMatchObject({ page: 1, perPage: 20, totalPages: 3 });
  });

  it("limits page size to 200 without losing the caller's page", async () => {
    const response = await GET(req("?page=4&perPage=999"));
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), [200, 600]);
    expect(await response.json()).toMatchObject({ page: 4, perPage: 200, totalPages: 1 });
  });

  it("prevents multiplication overflow reaching a PostgreSQL OFFSET bind", async () => {
    const response = await GET(req("?page=9007199254740991&perPage=200"));
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), [200, 0]);
    expect(await response.json()).toMatchObject({ page: 1, perPage: 200 });
  });

  it("preserves authentication failure and performs no organisation query", async () => {
    mocks.requireAuth.mockRejectedValue(new NextResponse("unauthorised", { status: 401 }));
    const response = await GET(req("?page=NaN"));
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
