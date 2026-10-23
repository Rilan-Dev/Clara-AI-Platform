import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  requireAuth: vi.fn(),
  requireAgentPermission: vi.fn(),
  getAgentById: vi.fn(),
  queryOne: vi.fn(),
  withTransaction: vi.fn(),
  createApiKey: vi.fn(),
  transactionQuery: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireAgentPermission: mocks.requireAgentPermission,
}));
vi.mock("@/modules/organisations/core/db", () => ({ getAgentById: mocks.getAgentById }));
vi.mock("@/lib/db", () => ({
  queryOne: mocks.queryOne,
  withTransaction: mocks.withTransaction,
}));
vi.mock("@/modules/embed/core/api-keys-db", () => ({ createApiKey: mocks.createApiKey }));

import { POST } from "./route";

const req = () => new NextRequest("https://clara.example.test/api/agents/agent-1/explore-link", { method: "POST" });
const params = { params: Promise.resolve({ agentId: "agent-1" }) };
const client = { query: mocks.transactionQuery };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CLARA_ENV", "development");
  vi.stubEnv("CLARA_FEATURE_EMBEDDABLE_WIDGET", "true");
  mocks.ensureMigrated.mockResolvedValue(undefined);
  mocks.requireAuth.mockResolvedValue({ user: { id: "editor-1" } });
  mocks.requireAgentPermission.mockResolvedValue(undefined);
  mocks.getAgentById.mockResolvedValue({ id: "agent-1", orgId: "org-1" });
  mocks.queryOne.mockResolvedValue({ id: "kb-1", name: "Knowledge base" });
  mocks.transactionQuery.mockResolvedValue({ rows: [{ id: "kb-1" }] });
  mocks.withTransaction.mockImplementation(async (fn: (connection: typeof client) => Promise<unknown>) => fn(client));
  mocks.createApiKey.mockResolvedValue({ rawKey: "clr_one-time-key", key: { id: "key-2" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("published explore-link embed key lifecycle", () => {
  it("rejects production key minting before agent/KB reads or mutation", async () => {
    vi.stubEnv("CLARA_ENV", "production");
    vi.stubEnv("CLARA_FEATURE_EMBEDDABLE_WIDGET", "false");
    const result = await POST(req(), params);
    expect(result.status).toBe(404);
    expect(await result.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(mocks.requireAgentPermission).toHaveBeenCalledWith(
      expect.anything(), "agent-1", "project:update",
    );
    expect(mocks.getAgentById).not.toHaveBeenCalled();
    expect(mocks.queryOne).not.toHaveBeenCalled();
    expect(mocks.withTransaction).not.toHaveBeenCalled();
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("rotates keys in one transaction on an enabled development deployment", async () => {
    const result = await POST(req(), params);
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body).toMatchObject({
      kbId: "kb-1",
      key: "clr_one-time-key",
      widgetUrl: expect.stringContaining("/embed/widget?key=clr_one-time-key"),
      voiceUrl: expect.stringContaining("/embed/voice?key=clr_one-time-key"),
    });
    expect(mocks.withTransaction).toHaveBeenCalledOnce();
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringMatching(/FOR UPDATE/),
      ["kb-1", "agent-1"],
    );
    expect(mocks.transactionQuery).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE api_keys SET is_active = FALSE/),
      ["kb-1", "Published explore link"],
    );
    expect(mocks.createApiKey).toHaveBeenCalledWith(
      { kbId: "kb-1", orgId: "org-1", name: "Published explore link", createdBy: "editor-1" },
      client,
    );
    const sqlCalls = mocks.transactionQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqlCalls.findIndex((sql) => sql.includes("FOR UPDATE"))).toBeLessThan(
      sqlCalls.findIndex((sql) => sql.includes("UPDATE api_keys")),
    );
  });

  it("never writes a new key when KB ownership/active lock cannot be acquired", async () => {
    mocks.transactionQuery.mockResolvedValueOnce({ rows: [] });
    const response = await POST(req(), params);
    expect(response.status).toBe(404);
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("does not leak SQL/provider errors through failed rotation responses", async () => {
    mocks.createApiKey.mockRejectedValueOnce(new Error("SQL constraint failed: internal-schema private-token"));
    const result = await POST(req(), params);
    expect(result.status).toBe(500);
    const text = await result.text();
    expect(text).toContain("Failed to generate explore link");
    expect(text).not.toContain("internal-schema");
    expect(text).not.toContain("private-token");
    expect(mocks.withTransaction).toHaveBeenCalledOnce();
  });

  it("preserves the existing agent authorization boundary before minting", async () => {
    mocks.requireAgentPermission.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const result = await POST(req(), params);
    expect(result.status).toBe(403);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });
});
