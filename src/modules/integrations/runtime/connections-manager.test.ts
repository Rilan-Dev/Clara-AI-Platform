import { describe, expect, it, vi } from "vitest";

const credentialGet = vi.fn();
const assertAuthorized = vi.fn();

vi.mock("./credential-vault.js", () => ({
  credentialVault: { get: credentialGet },
}));

vi.mock("./execution-authorization.js", () => ({
  assertIntegrationExecutionAuthorized: assertAuthorized,
}));

describe("cross-integration connection access", () => {
  it("re-checks execution authorization before returning another integration's credentials", async () => {
    credentialGet.mockResolvedValue({ credentials: { apiKey: "secret" } });

    const { DoableConnectionsManager } = await import("./connections-manager.js");
    const manager = new DoableConnectionsManager("user-1", "org-1", "agent-1");

    const result = await manager.get("slack");

    expect(assertAuthorized).toHaveBeenCalledWith({
      integrationId: "slack",
      workspaceId: "org-1",
      agentId: "agent-1",
    });
    expect(credentialGet).toHaveBeenCalledWith("user-1", "slack", "org-1", "agent-1");
    expect(result).toEqual({ apiKey: "secret" });
  });

  it("fails closed without reading credentials when the integration is unauthorized", async () => {
    assertAuthorized.mockRejectedValue(new Error("not enabled for this agent"));

    const { DoableConnectionsManager } = await import("./connections-manager.js");
    const manager = new DoableConnectionsManager("user-1", "org-1", "agent-1");

    await expect(manager.get("slack")).rejects.toThrow("not enabled for this agent");
    expect(credentialGet).not.toHaveBeenCalled();
  });
});
