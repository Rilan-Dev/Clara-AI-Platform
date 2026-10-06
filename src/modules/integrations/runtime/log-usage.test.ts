import { describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/lib/db", () => ({ query }));
vi.mock("./credential-vault.js", () => ({ credentialVault: {} }));
vi.mock("../registry/index.js", () => ({ getIntegration: vi.fn() }));
vi.mock("./runner-fetch.js", () => ({ assertSafeEgressUrl: vi.fn() }));

import { logUsage } from "./runner-helpers.js";

describe("integration usage telemetry", () => {
  it("writes tenant and agent scope using the I-2 control-plane schema", async () => {
    query.mockResolvedValue([]);

    await logUsage({
      orgId: "org-1",
      agentId: "agent-1",
      userId: "user-1",
      integrationId: "slack",
      actionName: "send_message",
      success: true,
      durationMs: 42,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [template, orgId, agentId, userId, integrationId, actionName, success, durationMs, errorMessage] = query.mock.calls[0];
    expect(template.join(" ")).toContain("org_id, agent_id, user_id, integration_id, action_name");
    expect(template.join(" ")).not.toContain("workspace_id");
    expect([orgId, agentId, userId, integrationId, actionName, success, durationMs, errorMessage])
      .toEqual(["org-1", "agent-1", "user-1", "slack", "send_message", true, 42, null]);
  });
});
