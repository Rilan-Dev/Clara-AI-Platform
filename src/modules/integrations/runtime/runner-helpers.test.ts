import { beforeEach, describe, expect, it, vi } from "vitest";

const credentialGet = vi.fn();
const hasActiveConnection = vi.fn();
const query = vi.fn();
const assertSafeEgressUrl = vi.fn();
const assertIntegrationExecutionAuthorized = vi.fn();

vi.mock("./credential-vault.js", () => ({
  credentialVault: { get: credentialGet, hasActiveConnection },
}));

vi.mock("./runner-fetch.js", () => ({
  assertSafeEgressUrl,
}));

vi.mock("./execution-authorization.js", () => ({
  assertIntegrationExecutionAuthorized,
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
    hasActiveConnection.mockResolvedValue(true);
    globalThis.fetch = vi.fn();
  });

  it("does not expose Supabase Management response bodies on failure", async () => {
    credentialGet.mockResolvedValue({
      credentials: { access_token: "management-secret-token" },
    });
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("provider echoed management-secret-token", {
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    const { customActions } = await import("./runner-helpers.js");

    let thrown: unknown;
    try {
      await customActions.supabase.execute_sql.run(
        {
          userId: "user-1",
          workspaceId: "org-1",
          agentId: "agent-1",
          integrationId: "supabase",
          actionName: "execute_sql",
          projectId: "project-1",
          props: { sql: "select 1" },
        },
        { url: "https://project-1.supabase.co" },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Supabase SQL execution failed (401)");
    expect((thrown as Error).message).not.toContain("management-secret-token");
  });

  it("does not expose Supabase PostgREST response bodies on failure", async () => {
    hasActiveConnection.mockResolvedValue(false);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("provider echoed service-key", {
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    const { customActions } = await import("./runner-helpers.js");

    let thrown: unknown;
    try {
      await customActions.supabase.execute_sql.run(
        {
          userId: "user-1",
          workspaceId: "org-1",
          agentId: "agent-1",
          integrationId: "supabase",
          actionName: "execute_sql",
          projectId: "project-1",
          props: { sql: "select 1" },
        },
        {
          url: "https://project-1.supabase.co",
          apiKey: "service-key",
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Raw SQL execution requires Supabase OAuth (Sign in with Supabase) so we can use the Management API. Alternatively, create a Postgres function named `exec_sql(query text)` in your Supabase project to enable SQL via the service role key. PostgREST rpc/exec_sql returned: 401");
    expect((thrown as Error).message).not.toContain("service-key");
  });

  it("uses the service-key fallback without requiring a Management connection", async () => {
    hasActiveConnection.mockResolvedValue(false);
    credentialGet.mockResolvedValue(null);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ rows: [{ id: 1 }] }), {
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
        props: { sql: "select 1" },
      },
      {
        url: "https://project-1.supabase.co",
        apiKey: "service-key",
      },
    );

    expect(result).toEqual({ rows: [{ id: 1 }] });
    expect(credentialGet).not.toHaveBeenCalled();
    expect(assertIntegrationExecutionAuthorized).not.toHaveBeenCalledWith({
      integrationId: "supabase-mgmt",
      workspaceId: "org-1",
      agentId: "agent-1",
    });
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
    expect(assertIntegrationExecutionAuthorized).toHaveBeenCalledWith({
      integrationId: "supabase-mgmt",
      workspaceId: "org-1",
      agentId: "agent-1",
    });
  });
});
