import { z } from "zod";
import {
  authorizeMcpTool,
  buildMcpToolDefinition,
  isMcpEnabled,
  mcpToolName,
  type McpToolResolver,
} from "./mcp-tool-bridge";

const policy = {
  allowedServers: ["demo"],
  allowedTools: ["lookup"],
};

const descriptor = {
  serverId: "demo",
  name: "lookup",
  description: "Lookup a record",
  inputSchema: z.object({ id: z.string().min(1) }),
};

describe("MCP tool bridge", () => {
  it("creates deterministic bounded tool names", () => {
    expect(mcpToolName("demo", "lookup")).toBe("mcp_demo_lookup");
    expect(mcpToolName("demo", "a".repeat(200))).toHaveLength(64);
  });

  it("fails closed for tools outside the allowlist", () => {
    expect(
      authorizeMcpTool(
        { ...descriptor, name: "delete" },
        policy,
      ).allowed,
    ).toBe(false);
    expect(() =>
      buildMcpToolDefinition(
        { ...descriptor, name: "delete" },
        policy,
        {} as McpToolResolver,
      ),
    ).toThrow("not allowlisted");
  });

  it("honors the default-off flag", () => {
    expect(isMcpEnabled({ ENABLE_MCP: undefined })).toBe(false);
    expect(isMcpEnabled({ ENABLE_MCP: "false" })).toBe(false);
    expect(isMcpEnabled({ ENABLE_MCP: "true" })).toBe(true);
  });

  it("delegates through the injected resolver without owning transport", async () => {
    const calls: string[] = [];
    const resolver: McpToolResolver = {
      async resolve() {
        return descriptor;
      },
      async invoke(_descriptor, input, context) {
        calls.push(`${context.tenantId}:${JSON.stringify(input)}`);
        return { ok: true };
      },
    };

    const tool = buildMcpToolDefinition(descriptor, policy, resolver);
    expect(tool.name).toBe("mcp_demo_lookup");
    expect(calls).toEqual([]);
  });
});
