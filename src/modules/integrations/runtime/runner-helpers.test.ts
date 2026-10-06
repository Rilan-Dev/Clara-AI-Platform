import { beforeEach, describe, expect, it, vi } from "vitest";

const credentialGet = vi.fn();
const query = vi.fn();
const assertSafeEgressUrl = vi.fn();

vi.mock("./credential-vault.js", () => ({
  credentialVault: { get: credentialGet },
}));

vi.mock("./runner-fetch.js", () => ({
  assertSafeEgressUrl,
}));

vi.mock("../registry/index.js", () => ({
  getIntegration: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query,
}));

describe("custom integration credential scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("scopes the Supabase Management credential lookup to the executing agent", async () => {
    credentialGet.mockResolvedValue({
      credentials: { access_token: "management-token" },
    });
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { customActions } = await import("./runner-helpers.js");

    const result = await customActions.supabase.execute_sql.run(
      {
        userId: "user-1",
        workspaceId: "org-1",
        agentId: "agent-1",
        integrationId: "supabase",
        actionName: "execute_sql",
        projectId: "project-1",
        props: {
          sql: "select 1",
        },
      },
      {
        url: "https://project-1.supabase.co",
      },
    );

    expect(result).toEqual({ ok: true });
    expect(credentialGet).toHaveBeenCalledWith(
      "user-1",
      "supabase-mgmt",
      "org-1",
      "agent-1",
    );
  });
});
