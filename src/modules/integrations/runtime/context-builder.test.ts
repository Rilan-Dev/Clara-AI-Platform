import { describe, expect, it } from "vitest";
import { buildActionContext } from "./context-builder.js";

describe("buildActionContext", () => {
  it("does not fabricate project identity from the tenant when projectId is absent", () => {
    const context = buildActionContext({
      auth: undefined,
      props: {},
      userId: "user-1",
      workspaceId: "org-1",
      agentId: "agent-1",
    });

    const project = context.project as { id?: string };
    expect(project.id).toBeUndefined();
  });

  it("preserves an explicitly supplied project identity", () => {
    const context = buildActionContext({
      auth: undefined,
      props: {},
      userId: "user-1",
      workspaceId: "org-1",
      agentId: "agent-1",
      projectId: "project-1",
    });

    const project = context.project as { id?: string };
    expect(project.id).toBe("project-1");
  });
});
