import { z } from "zod";
import { afterEach, beforeEach, vi } from "vitest";
import {
  isMcpToolAllowlisted,
  buildMcpToolDefinition,
  buildMcpToolRuntime,
  isMcpEnabled,
  mcpToolName,
  resolveMcpToolDefinition,
  type McpToolResolver,
} from "./mcp-tool-bridge";
import { createExecutionContext } from "./execution-context";
import { createToolRuntime } from "./tool-registry";

const policy = {
  allowedServers: ["demo"],
  allowedToolPairs: [{ serverId: "demo", toolName: "lookup" }],
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
  beforeEach(() => {
    vi.stubEnv("CLARA_ENV", "development");
    vi.stubEnv("ENABLE_MCP", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("creates deterministic bounded tool names", () => {
    // Short identities stay short; the bound is an upper limit of 63
    // (55-char base slice + '_' + ≤7-char collision hash: a uint32 in
    // base-36 can never exceed 7 digits).
    expect(mcpToolName("demo", "lookup").length).toBeLessThanOrEqual(63);
    expect(mcpToolName("demo", "a".repeat(200))).toHaveLength(63);
    expect(mcpToolName("demo", "lookup")).toBe(mcpToolName("demo", "lookup"));
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
        context,
      ),
    ).toThrow("no allowed Clara surface");
  });

  it("fails closed for malformed surface allowlists", () => {
    expect(() =>
      buildMcpToolDefinition(
        {
          ...descriptor,
          allowedSurfaces: ["chat", "invalid" as never],
        },
        policy,
        {} as McpToolResolver,
        context,
      ),
    ).toThrow("no allowed Clara surface");
  });

  it("fails closed for a malformed policy object at the public builder boundary", () => {
    expect(() =>
      buildMcpToolDefinition(
        descriptor,
        null as never,
        {} as McpToolResolver,
        context,
      ),
    ).toThrow("MCP allowlist policy is malformed");
  });

  it("fails closed for a malformed resolver at the public builder boundary", () => {
    expect(() =>
      buildMcpToolDefinition(
        descriptor,
        policy,
        { resolve: "not-a-function", invoke: "not-a-function" } as never,
        context,
      ),
    ).toThrow("MCP resolver is malformed");
  });

  it("fails closed for a runtime-invalid input schema", () => {
    expect(() =>
      buildMcpToolDefinition(
        {
          ...descriptor,
          inputSchema: { safeParse: "not-a-function" } as never,
        },
        policy,
        {} as McpToolResolver,
        context,
      ),
    ).toThrow("input schema is malformed");
  });

  it("fails closed when an external descriptor supplies a non-array surface allowlist", () => {
    expect(() =>
      buildMcpToolDefinition(
        {
          ...descriptor,
          allowedSurfaces: "chat" as never,
        },
        policy,
        {} as McpToolResolver,
        context,
      ),
    ).toThrow("surface allowlist is malformed");
  });

  it("treats malformed policy data as unauthorized in static inspection", () => {
    expect(
      isMcpToolAllowlisted(
        descriptor,
        {
          allowedServers: "demo" as never,
          allowedToolPairs: [],
        },
      ),
    ).toBe(false);
  });

  it("requires the exact server/tool allowlist pairing", () => {
    const crossProductPolicy = {
      allowedServers: ["demo", "admin"],
      allowedToolPairs: [{ serverId: "demo", toolName: "lookup" }],
    };

    expect(
      isMcpToolAllowlisted(
        { ...descriptor, serverId: "admin" },
        crossProductPolicy,
      ),
    ).toBe(false);
    expect(
      isMcpToolAllowlisted(
        { ...descriptor, name: "delete" },
        crossProductPolicy,
      ),
    ).toBe(false);
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
        context,
      ),
    ).toThrow("not allowlisted");
  });

  it("blocks a previously registered MCP capability after ENABLE_MCP is turned off", async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const resolver: McpToolResolver = {
      async resolve() { return descriptor; },
      invoke,
    };
    const tool = buildMcpToolDefinition(descriptor, policy, resolver, context);
    const runtime = createRuntime();
    runtime.registerTool(tool);

    // The instance was registered while MCP was enabled; an operational
    // rollback of the independent rollout flag must stop its old handle too.
    vi.stubEnv("ENABLE_MCP", "false");

    const result = await runtime.invoke(tool.name, { id: "abc" }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "TENANT_SCOPE_VIOLATION" } });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("allows already registered MCP tools only when both rollout controls remain enabled", async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const resolver: McpToolResolver = {
      async resolve() { return descriptor; },
      invoke,
    };
    const tool = buildMcpToolDefinition(descriptor, policy, resolver, context);
    const runtime = createRuntime();
    runtime.registerTool(tool);

    const result = await runtime.invoke(tool.name, { id: "abc" }, context);
    expect(result.ok).toBe(true);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("blocks an already registered MCP capability when its deployment disables integrations", async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const resolver: McpToolResolver = {
      async resolve() { return descriptor; },
      invoke,
    };
    const tool = buildMcpToolDefinition(descriptor, policy, resolver, context);
    const runtime = createRuntime();
    runtime.registerTool(tool);
    vi.stubEnv("CLARA_ENV", "production");

    const result = await runtime.invoke(tool.name, { id: "abc" }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "TENANT_SCOPE_VIOLATION" } });
    expect(invoke).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("honors the default-off flag", () => {
    expect(isMcpEnabled({ ENABLE_MCP: undefined })).toBe(false);
    expect(isMcpEnabled({ ENABLE_MCP: "false" })).toBe(false);
    expect(isMcpEnabled({ CLARA_ENV: "development", ENABLE_MCP: "true" })).toBe(true);
    expect(isMcpEnabled({ CLARA_ENV: "production", ENABLE_MCP: "true" })).toBe(false);
  });

  it("keeps the runtime builder default-off", async () => {
    vi.stubEnv("ENABLE_MCP", "false");
    const resolver: McpToolResolver = {
      async resolve() {
        return descriptor;
      },
      async invoke() {
        return { ok: true };
      },
    };

    await expect(
      buildMcpToolRuntime(
        context,
        [{ serverId: "demo", toolName: "lookup", context }],
        policy,
        resolver,
      ),
    ).resolves.toBeNull();
    vi.unstubAllEnvs();
  });

  it("fails closed for a malformed resolver before registration iteration", async () => {
    vi.stubEnv("ENABLE_MCP", "true");

    const runtime = await buildMcpToolRuntime(
      context,
      [],
      policy,
      { resolve: "not-a-function", invoke: "not-a-function" } as never,
    );

    expect(runtime).toBeNull();
    vi.unstubAllEnvs();
  });

  it("registers resolved MCP capabilities in the Unified Tool Runtime when enabled", async () => {
    vi.stubEnv("ENABLE_MCP", "true");
    const resolver: McpToolResolver = {
      async resolve() {
        return descriptor;
      },
      async invoke() {
        return { ok: true };
      },
    };

    const runtime = await buildMcpToolRuntime(
      context,
      [{ serverId: "demo", toolName: "lookup", context }],
      policy,
      resolver,
    );

    expect(runtime).not.toBeNull();
    expect(runtime?.listTools()).toHaveLength(1);
    expect(runtime?.listTools()[0]?.name).toBe(mcpToolName("demo", "lookup"));
    vi.unstubAllEnvs();
  });

  it("composes MCP tools into a fresh Unified Tool Runtime without dropping existing Clara tools", async () => {
    vi.stubEnv("ENABLE_MCP", "true");
    const baseRuntime = createRuntime();
    baseRuntime.registerTool({
      name: "base_tool",
      description: "Existing request-scoped tool",
      inputSchema: z.object({}),
      authorization: {
        allowedSurfaces: ["chat"],
        requiredPermission: null,
        requiredCapability: null,
        requireUserId: true,
        requireSessionId: false,
      },
      async execute() { return { preserved: true }; },
    });
    const resolver: McpToolResolver = {
      async resolve() { return descriptor; },
      async invoke() { return { mcp: true }; },
    };

    const runtime = await buildMcpToolRuntime(
      context,
      [{ serverId: "demo", toolName: "lookup", context }],
      policy,
      resolver,
      baseRuntime,
    );

    expect(runtime?.listTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["base_tool", mcpToolName("demo", "lookup")]),
    );
    const baseOutcome = await runtime!.invoke("base_tool", {}, context);
    expect(baseOutcome.ok).toBe(true);
    expect((baseOutcome as { ok: true; data: { preserved: boolean } }).data).toEqual({ preserved: true });
    vi.unstubAllEnvs();
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

    const tool = buildMcpToolDefinition(descriptor, policy, resolver, context);
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

    const tool = buildMcpToolDefinition(descriptor, policy, resolver, context);
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

  it("skips a request with an invalid execution context during runtime registration", async () => {
    vi.stubEnv("ENABLE_MCP", "true");
    const resolver: McpToolResolver = {
      async resolve() {
        return descriptor;
      },
      async invoke() {
        return { ok: true };
      },
    };

    const invalidContext = { ...context, tenantId: "" } as never;
    const runtime = await buildMcpToolRuntime(
      context,
      [{ serverId: "demo", toolName: "lookup", context: invalidContext }],
      policy,
      resolver,
    );

    expect(runtime).not.toBeNull();
    expect(runtime?.listTools()).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it("fails closed when the resolver mutates fields inside the authorized context", async () => {
    const resolver: McpToolResolver = {
      async resolve(request) {
        const mutableContext = request.context as typeof request.context & {
          tenantId: string;
          userId: string;
        };
        mutableContext.tenantId = "tenant-attacker";
        mutableContext.userId = "user-attacker";
        return {
          ...descriptor,
          serverId: "demo",
          name: "lookup",
        };
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

  it("fails closed when the resolver mutates the authorized request identity", async () => {
    const resolver: McpToolResolver = {
      async resolve(request) {
        const mutableRequest = request as {
          serverId: string;
          toolName: string;
          context: typeof request.context;
        };
        mutableRequest.serverId = "admin";
        mutableRequest.toolName = "delete";
        mutableRequest.context = createExecutionContext({
          orgId: "org-2",
          kbId: "kb-2",
          agentId: "agent-2",
          userId: "user-2",
          sessionId: "session-2",
          surface: "chat",
        });
        return {
          ...descriptor,
          serverId: "admin",
          name: "delete",
        };
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

  it("skips a resolver descriptor with an invalid surface policy", async () => {
    const resolver: McpToolResolver = {
      async resolve() {
        return { ...descriptor, allowedSurfaces: [] };
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

  it("passes a frozen resolution request to the resolver", async () => {
    let receivedRequest: unknown;
    const resolver: McpToolResolver = {
      async resolve(request) {
        receivedRequest = request;
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
    expect(receivedRequest).toBeDefined();
    expect(Object.isFrozen(receivedRequest)).toBe(true);
  });

  it("snapshots requireUserId policy before awaiting the external resolver", async () => {
    const mutablePolicy = {
      allowedServers: ["demo"],
      allowedToolPairs: [{ serverId: "demo", toolName: "lookup" }],
      requireUserId: true,
    };
    const resolver: McpToolResolver = {
      async resolve() {
        // Simulate a host-owned mutable policy being changed while resolution
        // is in progress. The registered capability must retain the initial
        // stricter authorization requirement.
        mutablePolicy.requireUserId = false;
        return descriptor;
      },
      async invoke() {
        return { ok: true };
      },
    };

    const tool = await resolveMcpToolDefinition(
      { serverId: "demo", toolName: "lookup", context },
      mutablePolicy,
      resolver,
    );

    expect(tool).not.toBeNull();
    expect(tool?.authorization.requireUserId).toBe(true);
  });

  it("fails closed for a malformed requireUserId policy", () => {
    expect(
      isMcpToolAllowlisted(
        descriptor,
        {
          ...policy,
          requireUserId: "yes" as never,
        },
      ),
    ).toBe(false);
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
      allowedToolPairs: [{ serverId: "demo", toolName: "lookup" }],
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
      context,
    );
    const runtime = createRuntime();
    runtime.registerTool(tool);

    mutablePolicy.allowedToolPairs.length = 0;
    mutableDescriptor.name = "delete";

    const result = await runtime.invoke(tool.name, { id: "abc" }, context);
    expect(result).toMatchObject({ ok: true, data: { ok: true } });
    expect(receivedName).toBe("lookup");
  });

  it("fails closed when the execution context is not a provenance-verified frozen instance", () => {
    // Execution contexts are created by createExecutionContext and frozen;
    // a plain mutable clone must never be accepted as a resolution context,
    // because post-registration identity drift would be unbounded.
    const mutableContext = {
      ...context,
    };
    const resolver: McpToolResolver = {
      async resolve() {
        return descriptor;
      },
      async invoke() {
        return { ok: true };
      },
    };

    expect(() =>
      buildMcpToolDefinition(
        descriptor,
        policy,
        resolver,
        mutableContext as unknown as Parameters<typeof buildMcpToolDefinition>[3],
      ),
    ).toThrow();
  });

  it("binds immutable resolution identity when the caller mutates its context object", async () => {
    const resolver: McpToolResolver = {
      async resolve() {
        return descriptor;
      },
      async invoke() {
        return { ok: true };
      },
    };

    const tool = buildMcpToolDefinition(
      descriptor,
      policy,
      resolver,
      context,
    );
    const runtime = createRuntime();
    runtime.registerTool(tool);

    // The context is frozen: a caller cannot rewrite tenant identity after
    // registration, and execution still binds to the original context.
    expect(() => {
      (context as { userId?: string }).userId = "user-2";
    }).toThrow();

    const result = await runtime.invoke(tool.name, { id: "abc" }, context);
    expect(result).toMatchObject({
      ok: true,
      data: { ok: true },
    });
  });

  it("binds the resolver invocation method at registration time", async () => {
    const resolver: McpToolResolver = {
      async resolve() {
        return descriptor;
      },
      async invoke() {
        return { ok: true };
      },
    };

    const tool = buildMcpToolDefinition(descriptor, policy, resolver, context);
    const runtime = createRuntime();
    runtime.registerTool(tool);

    resolver.invoke = async () => {
      throw new Error("replaced resolver must not execute");
    };

    const result = await runtime.invoke(tool.name, { id: "abc" }, context);
    expect(result).toMatchObject({ ok: true, data: { ok: true } });
  });

  it("skips a resolver capability that cannot pass runtime registration", async () => {
    vi.stubEnv("ENABLE_MCP", "true");
    const resolver: McpToolResolver = {
      async resolve() {
        return {
          ...descriptor,
          inputSchema: {} as z.ZodType<unknown>,
        };
      },
      async invoke() {
        return { ok: true };
      },
    };

    const runtime = await buildMcpToolRuntime(
      context,
      [{ serverId: "demo", toolName: "lookup", context }],
      policy,
      resolver,
    );

    expect(runtime).not.toBeNull();
    expect(runtime?.listTools()).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it("does not poison a later identical capability after a registration rejection", async () => {
    vi.stubEnv("ENABLE_MCP", "true");
    let resolveCount = 0;
    const resolver: McpToolResolver = {
      async resolve() {
        resolveCount += 1;
        return resolveCount === 1
          ? { ...descriptor, description: "x".repeat(1001) }
          : descriptor;
      },
      async invoke() {
        return { ok: true };
      },
    };

    const runtime = await buildMcpToolRuntime(
      context,
      [
        { serverId: "demo", toolName: "lookup", context },
        { serverId: "demo", toolName: "lookup", context },
      ],
      policy,
      resolver,
    );

    expect(resolveCount).toBe(2);
    expect(runtime?.listTools()).toHaveLength(1);
    vi.unstubAllEnvs();
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

  it("rejects an equivalent-looking but different execution-context object", async () => {
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

    const equivalentContext = createExecutionContext({
      orgId: context.tenantId,
      kbId: context.kbId,
      agentId: context.agentId,
      userId: context.userId,
      sessionId: context.sessionId,
      surface: context.surface,
      correlationId: context.correlationId,
      metadata: context.metadata,
    });

    const runtime = createRuntime();
    runtime.registerTool(tool!);
    const result = await runtime.invoke(
      tool!.name,
      { id: "abc" },
      equivalentContext,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "TENANT_SCOPE_VIOLATION" },
    });
  });

  it("rejects same-tenant execution with a different caller identity", async () => {
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

    const otherUserContext = createExecutionContext({
      orgId: context.tenantId,
      kbId: context.kbId,
      agentId: context.agentId,
      userId: "user-2",
      sessionId: context.sessionId,
      surface: context.surface,
    });

    const runtime = createRuntime();
    runtime.registerTool(tool!);
    const result = await runtime.invoke(
      tool!.name,
      { id: "abc" },
      otherUserContext,
    );

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
