import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  query: vi.fn(),
  requireAuth: vi.fn(),
  requireSuperAdmin: vi.fn(),
  verifyQueryEventChain: vi.fn(),
}));
vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({
  verifyQueryEventChain: mocks.verifyQueryEventChain,
}));

import { GET as listAudit } from "./route";
import { GET as exportAudit } from "./export/route";
import { GET as verifyAudit } from "./verify/route";

const orgId = "7edaf8bd-9acd-44ac-83e5-62dd4cd8043e";
const req = (path: string, query = "") =>
  new NextRequest("https://clara.example.test/api/analytics/audit" + path + query);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureMigrated.mockResolvedValue(undefined);
  mocks.requireAuth.mockResolvedValue({ user: { id: "platform-admin" } });
  mocks.requireSuperAdmin.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue([]);
  mocks.verifyQueryEventChain.mockResolvedValue([{ rowsVerified: 3, breaks: [] }]);
});

describe("platform audit request scope integrity", () => {
  it.each([
    ["list", listAudit, ""],
    ["CSV export", exportAudit, "/export"],
    ["chain verification", verifyAudit, "/verify"],
  ] as const)("rejects malformed organisation filter on %s without accessing records", async (_, handler, path) => {
    const response = await handler(req(path, "?orgId=bad-tenant-id"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_AUDIT_FILTER" });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.verifyQueryEventChain).not.toHaveBeenCalled();
  });

  it("does not silently widen an empty explicitly provided organisation scope", async () => {
    const response = await listAudit(req("", "?orgId="));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([
    "?limit=20xyz",
    "?limit=0",
    "?offset=-1",
    "?offset=200xyz",
    "?offset=9007199254740993",
    "?from=not-a-date",
    "?from=2026-10-24T00%3A00%3A00Z&to=2026-10-23T00%3A00%3A00Z",
  ])("rejects list filter %s before SQL", async (query) => {
    const response = await listAudit(req("", query));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each(["?limit=5xyz", "?from=not-a-date", "?orgId="])(
    "rejects malformed CSV filter %s before SQL", async (query) => {
      const response = await exportAudit(req("/export", query));
      expect(response.status).toBe(400);
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it("preserves a valid organisation scope and safe numeric SQL bound in list", async () => {
    const response = await listAudit(req("", `?orgId=${orgId}&limit=10&offset=20`));
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("qe.org_id = $3::uuid"),
      expect.arrayContaining([orgId]),
    );
    const queries = mocks.query.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(queries[0]).toContain("LIMIT 10 OFFSET 20");
    expect((await response.json()).meta).toMatchObject({ orgId, limit: 10, offset: 20 });
  });

  it("keeps the redacted export scoped to the requested organisation", async () => {
    const response = await exportAudit(req("/export", `?orgId=${orgId}&limit=100`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("qe.org_id = $3::uuid"),
      expect.arrayContaining([orgId]),
    );
  });

  it("exports user-originated Q&A as inert CSV text instead of executable spreadsheet formulas", async () => {
    mocks.query.mockResolvedValueOnce([{
      id: "event-1",
      created_at: "2026-10-23T14:00:00Z",
      org_name: "-HYPERLINK(\"https://evil.example\")",
      kb_name: "Policy",
      user_email: "person@example.com",
      surface: "widget",
      status: "completed",
      question: '=HYPERLINK("https://evil.example","click")',
      answer: "\t+cmd|' /C calc",
      model: "@SUM(1,2)",
      prompt_tokens: 8,
      completion_tokens: 12,
      cost_usd_micros: 100,
      latency_ms: 90,
      redactions: "[]",
      cancelled: false,
    }]);
    const response = await exportAudit(req("/export"));
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("'-HYPERLINK");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'\t+cmd");
    expect(csv).toContain("'@SUM");
    expect(csv).toContain("Policy");
    expect(csv).not.toContain(",,=HYPERLINK");
  });

  it("does not perform the all-organisations verification for a supplied UUID", async () => {
    const response = await verifyAudit(req("/verify", `?orgId=${orgId}`));
    expect(response.status).toBe(200);
    expect(mocks.verifyQueryEventChain).toHaveBeenCalledWith(orgId);
    expect((await response.json()).scope).toBe(orgId);
  });

  it("supports explicitly requested platform-wide verification without an org filter", async () => {
    const response = await verifyAudit(req("/verify"));
    expect(response.status).toBe(200);
    expect(mocks.verifyQueryEventChain).toHaveBeenCalledWith(undefined);
  });

  it.each([
    ["list", listAudit, ""],
    ["export", exportAudit, "/export"],
    ["verify", verifyAudit, "/verify"],
  ] as const)("preserves the super-admin barrier before filter validation on %s", async (_, handler, path) => {
    mocks.requireSuperAdmin.mockRejectedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const response = await handler(req(path, "?orgId=invalid"));
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.verifyQueryEventChain).not.toHaveBeenCalled();
  });
});
