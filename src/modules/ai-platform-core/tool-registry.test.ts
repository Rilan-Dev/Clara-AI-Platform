import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createExecutionContext } from "./execution-context";
import {
  ToolRegistrationError,
  UnknownToolError,
  createToolRuntime,
  type ToolRuntime,
} from "./tool-registry";
import { ToolExecutionError } from "./tool-contracts";
import type {
  ToolAuthorizationAdapter,
  ToolAuthorizationRequest,
  ToolDefinition,
  ToolMeteringRecord,
  ToolStreamingEvent,
} from "./tool-contracts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const KB_A = "kb-aaaaaaaa";

const allowAllAdapter: ToolAuthorizationAdapter = {
  async authorize() {
    return { allowed: true };
  },
};

function contextFor(tenantId: string, surface: "chat" | "realtime" | "embed" = "realtime") {
  return createExecutionContext({
    orgId: tenantId,
    kbId: KB_A,
    userId: "user-1",
    agentId: "agent-1",
    sessionId: "session-1",
    surface,
    correlationId: "corr-1",
  });
}

function echoTool(overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: "echo_tool",
    description: "Echoes its input back — a deterministic test tool.",
    inputSchema: z.object({ message: z.string().min(1) }).strip(),
    authorization: { allowedSurfaces: ["realtime", "embed"] },
    execute: vi.fn(async (input: unknown) => ({ echo: (input as { message: string }).message })),
    ...overrides,
  };
}

function runtimeWith(overrides?: {
  authorizationAdapter?: ToolAuthorizationAdapter;
  meteringHook?: { onInvocation: (record: ToolMeteringRecord) => void | Promise<void> };
  eventSink?: (event: ToolStreamingEvent) => void;
}): ToolRuntime {
  return createToolRuntime({
    authorizationAdapter: overrides?.authorizationAdapter ?? allowAllAdapter,
    ...(overrides?.meteringHook !== undefined ? { meteringHook: overrides.meteringHook } : {}),
    ...(overrides?.eventSink !== undefined ? { eventSink: overrides.eventSink } : {}),
  });
}

// ─── Registry: registration, duplicate handling, listing, lookup ─────────────

describe("tool registry — registration", () => {
  it("registers a valid tool and exposes it through has/get/list", () => {
    const runtime = runtimeWith();
    const tool = echoTool();
    runtime.registerTool(tool);

    expect(runtime.hasTool("echo_tool")).toBe(true);
    expect(runtime.getTool("echo_tool").name).toBe("echo_tool");
    expect(runtime.listTools()).toHaveLength(1);
    expect(runtime.listTools()[0]).toMatchObject({
      name: "echo_tool",
      description: tool.description,
      allowedSurfaces: ["realtime", "embed"],
    });
    expect(typeof runtime.listTools()[0].inputSchema.safeParse).toBe("function");
  });

  it("rejects duplicate registration deterministically and preserves the live tool", () => {
    const runtime = runtimeWith();
    const first = echoTool();
    const second = echoTool({ description: "hostile replacement" });
    runtime.registerTool(first);

    expect(() => runtime.registerTool(second)).toThrow(ToolRegistrationError);
    const rejection = (() => {
      try {
        runtime.registerTool(second);
      } catch (err) {
        return err as ToolRegistrationError;
      }
      return null;
    })();
    expect(rejection?.code).toBe("ALREADY_REGISTERED");

    // Registry untouched: the live tool is the FIRST one; the rejected
    // definition was not committed or frozen.
    expect(runtime.listTools()).toHaveLength(1);
    expect(runtime.getTool("echo_tool").description).toBe(first.description);
    expect(Object.isFrozen(second)).toBe(false);
  });

  it("fails closed at construction without a host authorization adapter", () => {
    expect(() => createToolRuntime({} as never)).toThrow(ToolRegistrationError);
    expect(
      () =>
        createToolRuntime({
          authorizationAdapter: { authorize: "not-a-function" } as unknown as ToolAuthorizationAdapter,
        }),
    ).toThrow(/authorization/i);
  });
});

describe("tool registry — invalid definitions rejected (fail at registration, not at action time)", () => {
  const cases: Array<{ label: string; def: unknown }> = [
    { label: "non-object", def: null },
    { label: "bad name (uppercase)", def: echoTool({ name: "EchoTool" }) },
    { label: "bad name (too short)", def: echoTool({ name: "ab" }) },
    { label: "bad name (leading digit)", def: echoTool({ name: "1tool" }) },
    { label: "blank description", def: echoTool({ description: "   " }) },
    { label: "missing inputSchema", def: { ...echoTool(), inputSchema: undefined } },
    { label: "non-zod schema", def: { ...echoTool(), inputSchema: { safeParse: 42 } } },
    { label: "schema whose safeParse throws", def: { ...echoTool(), inputSchema: { safeParse: () => { throw new Error("boom"); } } } },
    { label: "missing execute", def: { ...echoTool(), execute: undefined } },
    { label: "empty allowedSurfaces", def: echoTool({ authorization: { allowedSurfaces: [] } }) },
    { label: "invalid surface value", def: echoTool({ authorization: { allowedSurfaces: ["admin" as never] } }) },
    { label: "invalid requiredCapability", def: echoTool({ authorization: { allowedSurfaces: ["chat"], requiredCapability: "telepathy" as never } }) },
    { label: "invalid requiredPermission type", def: echoTool({ authorization: { allowedSurfaces: ["chat"], requiredPermission: 7 as never } }) },
  ];

  for (const { label, def } of cases) {
    it(`rejects: ${label}`, () => {
      const runtime = runtimeWith();
      expect(() => runtime.registerTool(def as ToolDefinition)).toThrow(ToolRegistrationError);
      expect(runtime.listTools()).toHaveLength(0);
      expect(runtime.hasTool("echo_tool")).toBe(false);
    });
  }
});

describe("tool registry — committed definitions are frozen; zod schemas stay live", () => {
  it("freezes the committed definition and its policy (mutation attempts cannot alter it)", () => {
    const runtime = runtimeWith();
    const tool = echoTool();
    runtime.registerTool(tool);

    const committed = runtime.getTool("echo_tool");
    expect(Object.isFrozen(committed)).toBe(true);
    expect(Object.isFrozen(committed.authorization)).toBe(true);
    expect(Object.isFrozen(committed.authorization.allowedSurfaces)).toBe(true);

    // The caller's original object is NOT the committed one (the registry
    // commits its own frozen copy) — hostile mutation of the original
    // reference cannot alter the committed policy.
    expect(committed).not.toBe(tool);
    const hostile = tool as unknown as Record<string, unknown>;
    const hostilePolicy = hostile.authorization as Record<string, unknown>;
    expect(() => {
      (committed as unknown as Record<string, unknown>).description = "hacked";
    }).toThrow(TypeError);
    expect(committed.description).toBe(tool.description);
    void hostilePolicy;
  });

  it("keeps the committed zod schema operational after registration (schemas are deliberately not frozen)", async () => {
    const runtime = runtimeWith();
    runtime.registerTool(echoTool());

    // First invocation proves safeParse worked post-commit…
    const first = await runtime.invoke("echo_tool", { message: "one" }, contextFor(TENANT_A));
    expect(first.ok).toBe(true);
    // …and a SECOND invocation proves lazily-written zod internal caches did
    // not break parsing (the regression guard for the no-schema-freeze rule).
    const second = await runtime.invoke("echo_tool", { message: "two" }, contextFor(TENANT_A));
    expect(second.ok).toBe(true);
    expect((second as { data: { echo: string } }).data.echo).toBe("two");
  });
});

// ─── Invocation lifecycle ─────────────────────────────────────────────────────

describe("tool invocation — the mandatory execution context", () => {
  it("rejects a missing/null context (INVALID_CONTEXT)", async () => {
    const runtime = runtimeWith();
    runtime.registerTool(echoTool());

    for (const invalid of [undefined, null, {}, "context"]) {
      const outcome = await runtime.invoke("echo_tool", { message: "hi" }, invalid as never);
      expect(outcome.ok).toBe(false);
      expect((outcome as { error: { code: string } }).error.code).toBe("INVALID_CONTEXT");
    }
  });

  it("rejects forged frozen structural lookalikes (the Phase 7-A provenance boundary)", async () => {
    const runtime = runtimeWith();
    runtime.registerTool(echoTool());

    const forged = Object.freeze({
      tenantId: TENANT_A,
      kbId: KB_A,
      userId: "user-1",
      surface: "realtime",
    });
    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, forged as never);
    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code: string } }).error.code).toBe("INVALID_CONTEXT");

    // A re-frozen spread-copy of a REAL context is rejected too —
    // provenance is identity-based, not structural.
    const real = contextFor(TENANT_A);
    const copy = Object.freeze({ ...real });
    const outcome2 = await runtime.invoke("echo_tool", { message: "hi" }, copy as never);
    expect(outcome2.ok).toBe(false);
    expect((outcome2 as { error: { code: string } }).error.code).toBe("INVALID_CONTEXT");
  });

  it("fails closed on missing required identity fields declared by the tool", async () => {
    const runtime = runtimeWith();
    runtime.registerTool(
      echoTool({ authorization: { allowedSurfaces: ["realtime"], requireUserId: true, requireSessionId: true } }),
    );

    const withoutIdentity = createExecutionContext({ orgId: TENANT_A, kbId: KB_A, surface: "realtime" });
    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, withoutIdentity);
    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code: string } }).error.code).toBe("MISSING_CONTEXT_IDENTITY");
  });
});

describe("tool invocation — the allowlist and authorization stages", () => {
  it("rejects an unknown tool (UNKNOWN_TOOL) — no implicit fallback", async () => {
    const runtime = runtimeWith();
    runtime.registerTool(echoTool());

    const outcome = await runtime.invoke("nonexistent_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code: string } }).error.code).toBe("UNKNOWN_TOOL");
    expect((outcome as { error: { message: string } }).error.message).toContain("nonexistent_tool");
  });

  it("getTool throws UnknownToolError for unknown names (controlled failure)", () => {
    const runtime = runtimeWith();
    runtime.registerTool(echoTool());
    expect(() => runtime.getTool("nope")).toThrow(UnknownToolError);
    expect(() => runtime.getTool("nope")).toThrow(/fails closed/);
  });

  it("rejects an unauthorized surface (UNAUTHORIZED_SURFACE) — deterministic, before any host I/O", async () => {
    const authorize = vi.fn(async () => ({ allowed: true as const }));
    const runtime = runtimeWith({ authorizationAdapter: { authorize } });
    runtime.registerTool(echoTool()); // allowedSurfaces: realtime, embed

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A, "chat"));
    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code: string } }).error.code).toBe("UNAUTHORIZED_SURFACE");
    // The host adapter was never consulted — the surface check is structural.
    expect(authorize).not.toHaveBeenCalled();
  });

  it("rejects on an insufficient plan entitlement (PLAN_NOT_ENTITLED)", async () => {
    const runtime = runtimeWith({
      authorizationAdapter: {
        async authorize() {
          return {
            allowed: false,
            code: "PLAN_NOT_ENTITLED",
            message: "The Free plan does not include realtime voice.",
          };
        },
      },
    });
    runtime.registerTool(echoTool());

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code: string } }).error.code).toBe("PLAN_NOT_ENTITLED");
  });

  it("rejects on an unauthorized role (UNAUTHORIZED_ROLE)", async () => {
    const runtime = runtimeWith({
      authorizationAdapter: {
        async authorize() {
          return {
            allowed: false,
            code: "UNAUTHORIZED_ROLE",
            message: "Forbidden — requires permission: kb:read.",
          };
        },
      },
    });
    runtime.registerTool(echoTool());

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code: string } }).error.code).toBe("UNAUTHORIZED_ROLE");
  });

  it("rejects when the authorization adapter itself fails (AUTHORIZATION_UNAVAILABLE — fail closed)", async () => {
    const runtime = runtimeWith({
      authorizationAdapter: {
        async authorize() {
          throw new Error("entitlement database unreachable");
        },
      },
    });
    runtime.registerTool(echoTool());

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code: string } }).error.code).toBe("AUTHORIZATION_UNAVAILABLE");
  });

  it("passes the tool name, the committed policy, and the caller's context to the adapter", async () => {
    const seenRequests: ToolAuthorizationRequest[] = [];
    const authorize = vi.fn(async (request: ToolAuthorizationRequest) => {
      seenRequests.push(request);
      return { allowed: true as const };
    });
    const runtime = runtimeWith({ authorizationAdapter: { authorize } });
    runtime.registerTool(echoTool());

    const ctx = contextFor(TENANT_A);
    await runtime.invoke("echo_tool", { message: "hi" }, ctx);

    expect(authorize).toHaveBeenCalledTimes(1);
    const request = seenRequests[0];
    expect(request.toolName).toBe("echo_tool");
    expect(request.policy.allowedSurfaces).toEqual(["realtime", "embed"]);
    expect(request.context).toBe(ctx); // the exact frozen caller context
  });
});

describe("tool invocation — zod input validation", () => {
  it("rejects invalid arguments with normalized issue details (INVALID_ARGUMENTS)", async () => {
    const runtime = runtimeWith();
    runtime.registerTool(echoTool());

    const outcome = await runtime.invoke("echo_tool", { message: "" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(false);
    const failure = outcome as unknown as { error: { code: string; details: { issues: Array<{ path: string; code: string }> } } };
    expect(failure.error.code).toBe("INVALID_ARGUMENTS");
    expect(failure.error.details.issues[0].path).toBe("message");

    const missing = await runtime.invoke("echo_tool", {}, contextFor(TENANT_A));
    expect((missing as { error: { code: string } }).error.code).toBe("INVALID_ARGUMENTS");

    const wrongType = await runtime.invoke("echo_tool", { message: 42 }, contextFor(TENANT_A));
    expect((wrongType as { error: { code: string } }).error.code).toBe("INVALID_ARGUMENTS");

    const notAnObject = await runtime.invoke("echo_tool", "just-a-string", contextFor(TENANT_A));
    expect((notAnObject as { error: { code: string } }).error.code).toBe("INVALID_ARGUMENTS");
  });

  it("passes only zod-validated (transformed/stripped) input to execute()", async () => {
    const execute = vi.fn(async (input: unknown) => (input as Record<string, unknown>).message);
    const runtime = runtimeWith();
    runtime.registerTool(
      echoTool({
        inputSchema: z.object({ message: z.string().trim(), extra: z.string().optional() }).strip(),
        execute,
      }),
    );

    const outcome = await runtime.invoke(
      "echo_tool",
      { message: "  padded  ", rogue: "stripped-by-zod" },
      contextFor(TENANT_A),
    );
    expect(outcome.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toEqual({ message: "padded" }); // trimmed + stripped
  });
});

describe("tool invocation — result and typed-error normalization", () => {
  it("normalizes a successful execution into a frozen ToolResult envelope", async () => {
    const runtime = runtimeWith();
    runtime.registerTool(echoTool());

    const outcome = await runtime.invoke("echo_tool", { message: "hello" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(true);
    const success = outcome as { ok: true; toolName: string; data: { echo: string } };
    expect(success.toolName).toBe("echo_tool");
    expect(success.data).toEqual({ echo: "hello" });
    expect(Object.isFrozen(success)).toBe(true);
  });

  it("normalizes a thrown execution error into a typed EXECUTION_FAILED failure", async () => {
    const runtime = runtimeWith();
    runtime.registerTool(
      echoTool({
        execute: async () => {
          throw new Error("retrieval exploded");
        },
      }),
    );

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(false);
    const failure = outcome as { error: { code: string; message: string } };
    expect(failure.error.code).toBe("EXECUTION_FAILED");
    expect(failure.error.message).toContain("retrieval exploded");
    expect(Object.isFrozen(failure)).toBe(true);
    expect(Object.isFrozen(failure.error)).toBe(true);
  });

  it("normalizes a self-reported typed failure (ToolExecutionError) from the tool", async () => {
    const runtime = runtimeWith();
    runtime.registerTool(
      echoTool({
        execute: async () => {
          throw new ToolExecutionError("PLAN_NOT_ENTITLED", "domain refusal: plan lacks the capability");
        },
      }),
    );

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(false);
    const failure = outcome as { error: { code: string; message: string } };
    expect(failure.error.code).toBe("PLAN_NOT_ENTITLED");
    expect(failure.error.message).toBe("domain refusal: plan lacks the capability");
  });

  it("carries ToolExecutionError details into the typed failure", async () => {
    const runtime = runtimeWith();
    runtime.registerTool(
      echoTool({
        execute: async () => {
          throw new ToolExecutionError("EXECUTION_FAILED", "refused", { reason: "policy" });
        },
      }),
    );

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));
    expect((outcome as unknown as { error: { details: { reason: string } } }).error.details.reason).toBe("policy");
  });

  it("preserves a domain outcome object byte-for-byte as the data payload — no ok-shape collision", async () => {
    // The incumbent GroundingOutcome shape ({ ok: true, result, warning }) is
    // a DOMAIN payload, not an envelope: the runtime must never re-interpret
    // a tool's `ok` field.
    const domainOutcome = { ok: true, result: { context: "[S1] evidence" }, warning: null };
    const runtime = runtimeWith();
    runtime.registerTool(echoTool({ execute: async () => domainOutcome }));

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(true);
    expect((outcome as { data: unknown }).data).toBe(domainOutcome); // identical reference, untouched

    const domainFailure = { ok: false, status: 402, error: "plan_limit_exceeded" };
    runtime.registerTool(
      echoTool({
        name: "domain_fail_tool",
        execute: async () => domainFailure,
      }),
    );
    const outcome2 = await runtime.invoke("domain_fail_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome2.ok).toBe(true); // the TOOL executed; the domain failure is its payload
    expect((outcome2 as { data: unknown }).data).toBe(domainFailure);
  });
});

// ─── Tenant isolation ────────────────────────────────────────────────────────

describe("tool invocation — tenant isolation", () => {
  it("executes scoped to the caller's context — the tool sees ONLY the caller's tenant", async () => {
    const seenContexts: unknown[] = [];
    const runtime = runtimeWith();
    runtime.registerTool(
      echoTool({
        execute: async (_input: unknown, context: unknown) => {
          seenContexts.push(context);
          return (context as { tenantId: string }).tenantId;
        },
      }),
    );

    const outcomeA = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A, "realtime"));
    const outcomeB = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_B, "realtime"));

    expect((outcomeA as { data: unknown }).data).toBe(TENANT_A);
    expect((outcomeB as { data: unknown }).data).toBe(TENANT_B);
    // Each invocation received the exact frozen context of ITS caller.
    expect((seenContexts[0] as { tenantId: string; kbId: string }).tenantId).toBe(TENANT_A);
    expect((seenContexts[1] as { tenantId: string }).tenantId).toBe(TENANT_B);
    expect(Object.isFrozen(seenContexts[0])).toBe(true);
  });
});

// ─── Metering hook ───────────────────────────────────────────────────────────

describe("tool invocation — the usage-metering hook", () => {
  it("invokes the metering hook with the correctly scoped record on success", async () => {
    const records: ToolMeteringRecord[] = [];
    const runtime = runtimeWith({ meteringHook: { onInvocation: (record) => { records.push(record); } } });
    runtime.registerTool(echoTool());

    await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A, "embed"));

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.toolName).toBe("echo_tool");
    expect(record.tenantId).toBe(TENANT_A);
    expect(record.kbId).toBe(KB_A);
    expect(record.agentId).toBe("agent-1");
    expect(record.userId).toBe("user-1");
    expect(record.sessionId).toBe("session-1");
    expect(record.surface).toBe("embed");
    expect(record.outcome).toBe("ok");
    expect(record.errorCode).toBeUndefined();
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    expect(record.correlationId).toBe("corr-1");
    expect(typeof record.invocationId).toBe("string");
    expect(record.invocationId.length).toBeGreaterThan(0);
  });

  it("invokes the metering hook exactly once per invocation attempt — including refusals (error classification)", async () => {
    const records: ToolMeteringRecord[] = [];
    const runtime = runtimeWith({ meteringHook: { onInvocation: (record) => { records.push(record); } } });
    runtime.registerTool(echoTool());

    await runtime.invoke("nonexistent_tool", {}, contextFor(TENANT_A)); // UNKNOWN_TOOL
    await runtime.invoke("echo_tool", { message: "" }, contextFor(TENANT_A)); // INVALID_ARGUMENTS
    await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A, "chat")); // UNAUTHORIZED_SURFACE

    expect(records).toHaveLength(3);
    expect(records.map((r) => r.errorCode)).toEqual([
      "UNKNOWN_TOOL",
      "INVALID_ARGUMENTS",
      "UNAUTHORIZED_SURFACE",
    ]);
    expect(records.every((r) => r.outcome === "error")).toBe(true);
    expect(records.every((r) => r.tenantId === TENANT_A && r.kbId === KB_A)).toBe(true);
  });

  it("never breaks the invocation when the metering hook fails", async () => {
    const runtime = runtimeWith({
      meteringHook: {
        onInvocation: () => {
          throw new Error("metering sink down");
        },
      },
    });
    runtime.registerTool(echoTool());

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(true); // the metered pipeline is unaffected
  });

  it("rejects an invalid context BEFORE tenant-scoped metering — no untrusted tenant data reaches the metering hook (F-7B-02 regression)", async () => {
    const records: ToolMeteringRecord[] = [];
    const runtime = runtimeWith({ meteringHook: { onInvocation: (record) => { records.push(record); } } });
    runtime.registerTool(echoTool());

    // A forged frozen structural lookalike carrying HOSTILE tenant data —
    // rejected by the Phase 7-A provenance boundary, and the rejection
    // happens BEFORE any tenant-scoped metering record is constructed.
    const forged = Object.freeze({
      tenantId: "attacker-tenant",
      kbId: "attacker-kb",
      userId: "attacker-user",
      sessionId: "attacker-session",
      surface: "realtime",
    });
    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, forged as never);
    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code: string } }).error.code).toBe("INVALID_CONTEXT");

    // Missing / null / non-object contexts fail the same way.
    for (const invalid of [undefined, null, "context", {}]) {
      const rejected = await runtime.invoke("echo_tool", { message: "hi" }, invalid as never);
      expect((rejected as { error: { code: string } }).error.code).toBe("INVALID_CONTEXT");
    }

    // The tenant-scoped metering hook was NEVER invoked for any of the
    // rejected attempts — no untrusted tenant data was passed into metering.
    expect(records).toHaveLength(0);
  });
});

// ─── Streaming tool-event contract (types + emission only — NO provider tool calling) ──

describe("tool invocation — the normalized streaming tool-event contract", () => {
  it("emits a paired started → succeeded event sequence with the contract shape", async () => {
    const events: ToolStreamingEvent[] = [];
    const runtime = runtimeWith({ eventSink: (event) => { events.push(event); } });
    runtime.registerTool(echoTool());

    await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));

    expect(events).toHaveLength(2);
    const started = events[0];
    expect(started?.type).toBe("tool_call_started");
    if (started && started.type === "tool_call_started") {
      expect(started.toolName).toBe("echo_tool");
      expect(started.correlationId).toBe("corr-1");
      expect(typeof started.invocationId).toBe("string");
      expect(typeof started.startedAt).toBe("string");
      expect(Number.isNaN(Date.parse(started.startedAt))).toBe(false);
    }
    // Tenant identifiers never appear in event payloads (transport-facing contract).
    expect(JSON.stringify(events)).not.toContain(TENANT_A);

    const succeeded = events[1];
    expect(succeeded?.type).toBe("tool_call_succeeded");
    if (succeeded && succeeded.type === "tool_call_succeeded") {
      expect(succeeded.invocationId).toBe(started && started.type === "tool_call_started" ? started.invocationId : undefined);
      expect(succeeded.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(Date.parse(succeeded.finishedAt))).toBe(false);
    }
  });

  it("emits a paired started → failed event sequence with the typed error payload", async () => {
    const events: ToolStreamingEvent[] = [];
    const runtime = runtimeWith({ eventSink: (event) => { events.push(event); } });
    runtime.registerTool(
      echoTool({
        execute: async () => {
          throw new Error("boom");
        },
      }),
    );

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(false);
    expect(events).toHaveLength(2);
    const failed = events[1];
    expect(failed?.type).toBe("tool_call_failed");
    if (failed && failed.type === "tool_call_failed") {
      expect(failed.error.code).toBe("EXECUTION_FAILED");
      expect(failed.error.message).toContain("boom");
      expect(failed.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("emits NO events for pre-execution refusals (no tool call happened)", async () => {
    const events: ToolStreamingEvent[] = [];
    const runtime = runtimeWith({ eventSink: (event) => { events.push(event); } });
    runtime.registerTool(echoTool());

    await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A, "chat")); // surface refusal
    await runtime.invoke("nonexistent_tool", {}, contextFor(TENANT_A)); // allowlist refusal
    await runtime.invoke("echo_tool", {}, contextFor(TENANT_A)); // schema refusal

    expect(events).toHaveLength(0);
  });

  it("never breaks the invocation when the event sink fails", async () => {
    const runtime = runtimeWith({
      eventSink: () => {
        throw new Error("sink exploded");
      },
    });
    runtime.registerTool(echoTool());

    const outcome = await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A));
    expect(outcome.ok).toBe(true);
  });

  it("supports a per-invocation event sink alongside the runtime sink", async () => {
    const runtimeEvents: ToolStreamingEvent[] = [];
    const invocationEvents: ToolStreamingEvent[] = [];
    const runtime = runtimeWith({ eventSink: (event) => { runtimeEvents.push(event); } });
    runtime.registerTool(echoTool());

    await runtime.invoke("echo_tool", { message: "hi" }, contextFor(TENANT_A), {
      eventSink: (event) => { invocationEvents.push(event); },
    });

    expect(runtimeEvents).toHaveLength(2);
    expect(invocationEvents).toHaveLength(2);
    expect(invocationEvents[0].invocationId).toBe(runtimeEvents[0].invocationId);
  });
});
