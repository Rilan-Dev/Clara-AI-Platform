import { describe, expect, it, vi } from "vitest";

const storeCtor = vi.fn();
const connectionsCtor = vi.fn();

vi.mock("./store.js", () => ({
  PostgresStore: class {
    constructor(...args: unknown[]) {
      storeCtor(...args);
    }
  },
}));

vi.mock("./connections-manager.js", () => ({
  DoableConnectionsManager: class {
    constructor(...args: unknown[]) {
      connectionsCtor(...args);
    }
  },
}));

vi.mock("./files-service.js", () => ({
  DoableFilesService: class {},
}));

describe("buildActionContext scope propagation", () => {
  it("passes the explicit agent scope to store and connections manager", async () => {
    const { buildActionContext } = await import("./context-builder.js");

    buildActionContext({
      auth: undefined,
      props: {},
      userId: "user-1",
      workspaceId: "org-1",
      agentId: "agent-1",
      projectId: "project-1",
    });

    expect(storeCtor).toHaveBeenCalledWith("user-1", "org-1", "agent-1");
    expect(connectionsCtor).toHaveBeenCalledWith("user-1", "org-1", "agent-1");
  });
});
