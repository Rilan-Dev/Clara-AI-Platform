import { z } from "zod";
import {
  isMcpToolAllowlisted,
  buildMcpToolDefinition,
  isMcpEnabled,
  mcpToolName,
  resolveMcpToolDefinition,
  type McpToolResolver,
} from "./mcp-tool-bridge";
import { createExecutionContext } from "./execution-context";
import { createToolRuntime } from "./tool-registry";

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

const context = createExecutionContext({
  orgId: "org-1",
  kbId: "kb-1",
  agentId: "agent-1",
  userId: "user-1",
  sessionId: "session-1",
  surface: "chat",
});

function createRuntime() {
  return createToolRuntime({
    authorizationAdapter: {
      async authorize() {
        return { allowed: true };
      },
    },
  });
}

describe("MCP tool bridge", () => {
  it("creates deterministic bounded tool names", () => {
    expect(mcpToolName("demo", "lookup")).toHaveLength(64);
    expect(mcpToolName("demo", "a".repeat(200))).toHaveLength(64);
    expect(mcpToolName("a-b", "lookup")).not.toBe(
      mcpToolName("a_b", "lookup"),
    );
  });

  it("fails closed for an explicitly empty surface allowlist", () => {
    expect(() =>
      buildMcpToolDefinition(
        { ...descriptor, allowedSurfaces: [] },
        policy,
        {} as McpToolResolver,
      ),
    ).toThrow("no allowed Clara surface");
  });

  it("fails closed for tools outside the allowlist", () => {
    expect(
      isMcpToolAllowlisted(
        { ...descriptor, name: "delete" },
        policy,
      ),
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

  it("preserves the caller execution context through resolver invocation", async () => {
    let receivedContext: unknown;
    const resolver: McpToolResolver = {
      async resolve() {
        return descriptor;
      },
      async invoke(_descriptor, input, received) {
        receivedContext = received;
        expect(input).toEqual({ id: "abc" });
        return { ok: true };
      },
    };

    const tool = buildMcpToolDefinition(descriptor, policy, resolver);
    const runtime = createRuntime();
    runtime.registerTool(tool);

    const result = await runtime.invoke(tool.name, { id: "abc" }, context);
    expect(result.ok).toBe(true);
    expect(receivedContext).toBe(context);
  });

  it("rejects invalid input through the Unified Tool Runtime schema boundary", async () => {
    const resolver: McpToolResolver = {
      async resolve() {
        return descriptor;
      },
      async invoke() {
        throw new Error("resolver must not execute for invalid input");
      },
    };

    const tool = buildMcpToolDefinition(descriptor, policy, resolver);
    const runtime = createRuntime();
    runtime.registerTool(tool);

    const result = await runtime.invoke(tool.name, { id: "" }, context);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGUMENTS" },
    });
  });

  it("rejects a resolver descriptor that changes the allowlisted identity", async () => {
    const resolver: McpToolResolver = {
      async resolve() {
        return { ...descriptor, name: "different-tool" };
      },
      async invoke() {
        return { ok: true };
      },
    };

    await expect(
      resolveMcpToolDefinition(
        { serverId: "demo", toolName: "lookup", context },
        policy,
        resolver,
      ),
    ).resolves.toBeNull();
  });

  it("fails closed when resolver discovery is unavailable", async () => {
    const resolver: McpToolResolver = {
      async resolve() {
        throw new Error("transport unavailable");
      },
      async invoke() {
        return { ok: true };
      },
    };

    await expect(
      resolveMcpToolDefinition(
        { serverId: "demo", toolName: "lookup", context },
        policy,
        resolver,
      ),
    ).resolves.toBeNull();
  });

  it("snapshots allowlist and descriptor identity against post-registration mutation", async () => {
    const mutablePolicy = {
      allowedServers: ["demo"],
      allowedTools: ["lookup"],
    };
    const mutableDescriptor = { ...descriptor };

    let receivedName = "";
    const resolver: McpToolResolver = {
      async resolve() {
        return mutableDescriptor;
      },
      async invoke(boundDescriptor) {
        receivedName = boundDescriptor.name;
        return { ok: true };
      },
    };

    const tool = buildMcpToolDefinition(
      mutableDescriptor,
      mutablePolicy,
      resolver,
    );
    const runtime = createRuntime();
    runtime.registerTool(tool);

    mutablePolicy.allowedTools.length = 0;
    mutableDescriptor.name = "delete";

    const result = await runtime.invoke(tool.name, { id: "abc" }, context);
    expect(result).toMatchObject({ ok: true, data: { ok: true } });
    expect(receivedName).toBe("lookup");
  });

  it("binds resolved capabilities to the resolution context", async () => {
    const resolver: McpToolResolver = {
      async resolve() {
        return descriptor;
      },
      async invoke() {
        return { ok: true };
      },
    };

    const tool = await resolveMcpToolDefinition(
      { serverId: "demo", toolName: "lookup", context },
      policy,
      resolver,
    );
    expect(tool).not.toBeNull();

    const otherContext = createExecutionContext({
      orgId: "org-2",
      kbId: "kb-2",
      agentId: "agent-2",
      userId: "user-2",
      sessionId: "session-2",
      surface: "chat",
    });

    const runtime = createRuntime();
    runtime.registerTool(tool!);
    const result = await runtime.invoke(tool!.name, { id: "abc" }, otherContext);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "TENANT_SCOPE_VIOLATION" },
    });
  });

  it("rejects a resolver descriptor that changes the allowlisted server", async () => {
    const resolver: McpToolResolver = {
      async resolve() {
        return { ...descriptor, serverId: "other-server" };
      },
      async invoke() {
        return { ok: true };
      },
    };

    await expect(
      resolveMcpToolDefinition(
        { serverId: "demo", toolName: "lookup", context },
        policy,
        resolver,
      ),
    ).resolves.toBeNull();
  });
});
