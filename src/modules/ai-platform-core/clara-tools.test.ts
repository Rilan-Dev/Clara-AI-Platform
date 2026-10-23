import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// ─── Hermetic boundaries ──────────────────────────────────────────────────────
// The rag_search tool's contract is WRAPPING the incumbent seam
// (claraRuntime.retrieve); the unit boundary is therefore clara-runtime
// itself. Mocking it keeps this suite hermetic (no DB / Qdrant / provider
// stack) and lets the tests assert EXACTLY which tenant context and options
// cross the tool boundary (the parity harness).
vi.mock("./clara-runtime", () => ({
  claraRuntime: {
    retrieve: vi.fn(async () => ({
      ok: true as const,
      result: {
        context: "[S1] Grounded evidence for the query",
        grounded: true,
        sources: [{ index: 1, id: "hit-1", title: "Doc", score: 0.91, snippet: "snippet", sourceType: "vector" }],
        graphSources: [],
        mode: "hybrid",
        kb: { id: "kb-aaaaaaaa", name: "KB", collection: "col" },
        binding: { tenantId: "11111111-1111-4111-8111-111111111111", agentId: null, kbId: "kb-aaaaaaaa", documentId: null, ragMode: "hybrid" },
        scope: {
          assistantName: "Clara",
          welcomeMessage: "Hi",
          knowledgeBaseName: "KB",
          knowledgeBaseDescription: null,
          documentCount: 1,
          documentTitles: ["Doc"],
        },
        intent: "knowledge",
        guidance: "Answer from the evidence.",
        responseLanguage: "en",
        latencyMs: 12,
      },
      warning: null,
    })),
  },
}));

// The Clara authorization adapter binds the EXISTING ai-governance
// entitlement resolver and the EXISTING auth org-access context — both are
// mocked here so the adapter's decision logic is unit-provable.
vi.mock("@/modules/ai-governance/core/entitlements-db", () => ({
  resolvePlanAIEntitlements: vi.fn(async (orgId: string) => ({
    planId: "pro",
    planName: "Pro",
    capabilities: { chat: true, voice_chat: true, realtime_voice: true },
    allowedProviders: { openai: true, gemini: true, sarvam: true, elevenlabs: true },
    modelExceptions: [],
    ...(orgId === "33333333-3333-4333-8333-333333333333"
      ? { planId: "free", planName: "Free", capabilities: { chat: true, voice_chat: false, realtime_voice: false } }
      : {}),
  })),
}));

vi.mock("@/modules/auth/core/db", () => ({
  getOrgAccessContext: vi.fn(async (orgId: string, _userId: string) => [
    {
      orgId,
      membership: { orgId, userId: _userId, role: orgId === "44444444-4444-4444-8444-444444444444" ? "viewer" : "admin" },
      permissions:
        orgId === "44444444-4444-4444-8444-444444444444"
          ? new Set() // viewer: no kb:read
          : new Set(["kb:read", "agent:update"]),
    },
  ]),
  // The default Clara metering hook binds to this EXISTING helper (the
  // org-scoped audit spine — the quota.denied discipline; F-7B-01). Mocked
  // so the tests prove the binding's exact write shape hermetically.
  writeAuditLog: vi.fn(async () => undefined),
}));

// The BILLING/query-event writers are mocked so the F-7B-01 tests can
// PROVE the default Clara metering binding never touches them — a
// rag_search tool invocation must not create a duplicate billing/query
// event (the owning turn owns the query accounting; admission: "external").
vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({
  logQueryEvent: vi.fn(async () => null),
  logUsageEvent: vi.fn(async () => undefined),
  finalizeQueryEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/quota-admission", () => ({
  admitQueryEvent: vi.fn(async () => ({
    admitted: true as const,
    eventId: null,
    warning: null,
    used: 0,
    limit: 0,
  })),
}));

import { claraRuntime } from "./clara-runtime";
import {
  RAG_SEARCH_TOOL_NAME,
  buildClaraToolAuthorizationAdapter,
  buildClaraToolMeteringHook,
  buildClaraToolRuntime,
  buildRagSearchTool,
  getClaraToolRuntime,
  invokeClaraTool,
  planCapabilityForSurface,
} from "./clara-tools";
import { createExecutionContext } from "./execution-context";
import type { ToolDefinition, ToolMeteringRecord } from "./tool-contracts";

const mockedRetrieve = vi.mocked(claraRuntime.retrieve);
const mockedEntitlements = vi.mocked(
  await import("@/modules/ai-governance/core/entitlements-db"),
).resolvePlanAIEntitlements;
const mockedWriteAuditLog = vi.mocked(
  await import("@/modules/auth/core/db"),
).writeAuditLog;
const mockedLogQueryEvent = vi.mocked(
  await import("@/modules/knowledge-bases/core/analytics-db"),
).logQueryEvent;
const mockedLogUsageEvent = vi.mocked(
  await import("@/modules/knowledge-bases/core/analytics-db"),
).logUsageEvent;
const mockedFinalizeQueryEvent = vi.mocked(
  await import("@/modules/knowledge-bases/core/analytics-db"),
).finalizeQueryEvent;
const mockedAdmitQueryEvent = vi.mocked(
  await import("@/lib/quota-admission"),
).admitQueryEvent;

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const TENANT_FREE = "33333333-3333-4333-8333-333333333333";
const TENANT_VIEWER = "44444444-4444-4444-8444-444444444444";
const KB_A = "kb-aaaaaaaa";

const ENTITLED_GROUNDING = {
  ok: true as const,
  result: { context: "[S1] evidence", grounded: true, sources: [], mode: "hybrid" },
  warning: null,
};

function realtimeContext(tenantId: string, overrides?: { kbId?: string; userId?: string; sessionId?: string }) {
  return createExecutionContext({
    orgId: tenantId,
    kbId: overrides?.kbId ?? KB_A,
    agentId: "agent-1",
    userId: overrides?.userId ?? "user-1",
    sessionId: overrides?.sessionId ?? "session-1",
    surface: "realtime",
  });
}

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  mockedRetrieve.mockClear();
  mockedEntitlements.mockClear();
  mockedWriteAuditLog.mockClear();
  mockedLogQueryEvent.mockClear();
  mockedLogUsageEvent.mockClear();
  mockedFinalizeQueryEvent.mockClear();
  mockedAdmitQueryEvent.mockClear();
  mockedRetrieve.mockResolvedValue(ENTITLED_GROUNDING as never);
  mockedWriteAuditLog.mockResolvedValue(undefined);
});

// ─── Registration ─────────────────────────────────────────────────────────────

describe("rag_search — registration on the Unified Tool Runtime", () => {
  it("registers rag_search on the Clara runtime and lists it for discovery", () => {
    const runtime = buildClaraToolRuntime();
    expect(runtime.hasTool(RAG_SEARCH_TOOL_NAME)).toBe(true);
    const listed = runtime.listTools();
    expect(listed.map((tool) => tool.name)).toEqual([RAG_SEARCH_TOOL_NAME]);
    expect(listed[0].allowedSurfaces).toEqual(["realtime", "embed"]);
    expect(listed[0].description).toContain("tenant-bound evidence");
    expect(typeof listed[0].inputSchema.safeParse).toBe("function");
  });

  it("the application singleton binds the Clara adapters exactly once", () => {
    const first = getClaraToolRuntime();
    const second = getClaraToolRuntime();
    expect(first).toBe(second);
    expect(first.hasTool(RAG_SEARCH_TOOL_NAME)).toBe(true);
  });

  it("rebuilds a cached production-off tool registry when dev integrations become available", () => {
    vi.stubEnv("CLARA_ENV", "production");
    vi.stubEnv("CLARA_FEATURE_INTEGRATIONS", "false");
    const disabled = getClaraToolRuntime();
    expect(disabled.listTools().map((tool) => tool.name)).toEqual([RAG_SEARCH_TOOL_NAME]);
    expect(getClaraToolRuntime()).toBe(disabled);

    vi.stubEnv("CLARA_ENV", "development");
    vi.stubEnv("CLARA_FEATURE_INTEGRATIONS", "true");
    const enabled = getClaraToolRuntime();
    expect(enabled).not.toBe(disabled);
    expect(enabled.hasTool(RAG_SEARCH_TOOL_NAME)).toBe(true);
    expect(enabled.hasTool("integration_availability")).toBe(true);
    expect(enabled.hasTool("integration_action")).toBe(true);
    expect(getClaraToolRuntime()).toBe(enabled);
  });

  it("drops the optional tool catalogue again when integrations are disabled", () => {
    vi.stubEnv("CLARA_ENV", "development");
    vi.stubEnv("CLARA_FEATURE_INTEGRATIONS", "true");
    const enabled = getClaraToolRuntime();
    expect(enabled.hasTool("integration_action")).toBe(true);

    vi.stubEnv("CLARA_ENV", "production");
    vi.stubEnv("CLARA_FEATURE_INTEGRATIONS", "false");
    const disabled = getClaraToolRuntime();
    expect(disabled).not.toBe(enabled);
    expect(disabled.listTools().map((tool) => tool.name)).toEqual([RAG_SEARCH_TOOL_NAME]);
    expect(getClaraToolRuntime()).toBe(disabled);
  });

  it("does not cross-wire two independent deployment configurations", () => {
    vi.stubEnv("CLARA_ENV", "production");
    vi.stubEnv("CLARA_FEATURE_INTEGRATIONS", "true");
    expect(getClaraToolRuntime().hasTool("integration_action")).toBe(true);

    vi.stubEnv("CLARA_FEATURE_INTEGRATIONS", "invalid-value");
    expect(getClaraToolRuntime().listTools().map((tool) => tool.name))
      .toEqual([RAG_SEARCH_TOOL_NAME]);
  });

  it("the tool definition declares the reviewed authorization policy", () => {
    const tool = buildRagSearchTool();
    expect(tool.name).toBe(RAG_SEARCH_TOOL_NAME);
    expect(tool.authorization).toMatchObject({
      allowedSurfaces: ["realtime", "embed"],
      requiredPermission: null,
      requiredCapability: null,
      requireUserId: false,
      requireSessionId: false,
    });
  });
});

// ─── Invocation, behavior parity, and tenant isolation ────────────────────────

describe("rag_search — invocation and behavior parity vs the direct implementation", () => {
  it("invokes through the registry and returns the incumbent GroundingOutcome byte-for-byte", async () => {
    const runtime = buildClaraToolRuntime();
    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "policy question" }, realtimeContext(TENANT_A));

    expect(outcome.ok).toBe(true);
    const success = outcome as { ok: true; toolName: string; data: typeof ENTITLED_GROUNDING };
    expect(success.toolName).toBe(RAG_SEARCH_TOOL_NAME);
    expect(success.data).toBe(ENTITLED_GROUNDING); // identical reference — no re-wrapping
  });

  it("carries the caller's tenant context through UNCHANGED (parity: orgId/agentId/kbId/userId/sessionId)", async () => {
    const runtime = buildClaraToolRuntime();
    await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_A));

    expect(mockedRetrieve).toHaveBeenCalledTimes(1);
    const [runtimeCtx, query, options] = mockedRetrieve.mock.calls[0];
    expect(runtimeCtx).toEqual({
      orgId: TENANT_A,
      agentId: "agent-1",
      kbId: KB_A,
      userId: "user-1",
      sessionId: "session-1",
    });
    expect(query).toBe("q");
    expect(options).toEqual({ ragMode: "hybrid", channel: "voice" });
  });

  it("passes the trimmed query and the payload ragMode exactly as the incumbent seam did", async () => {
    const runtime = buildClaraToolRuntime();
    await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "  padded query  " }, realtimeContext(TENANT_A));
    expect(mockedRetrieve.mock.calls[0][1]).toBe("padded query"); // trimmed, as before

    await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q2", ragMode: "classic" }, realtimeContext(TENANT_A));
    expect(mockedRetrieve.mock.calls[1][2]).toEqual({ ragMode: "classic", channel: "voice" });

    await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q3", ragMode: "agentic" }, realtimeContext(TENANT_A));
    expect(mockedRetrieve.mock.calls[2][2]).toEqual({ ragMode: "agentic", channel: "voice" });
  });

  it("strips unknown input keys exactly like the incumbent read-only-what-it-knows behavior", async () => {
    const runtime = buildClaraToolRuntime();
    const outcome = await runtime.invoke(
      RAG_SEARCH_TOOL_NAME,
      { query: "q", kbId: "other-kb", documentId: "doc-9", rouge: "field" },
      realtimeContext(TENANT_A),
    );
    expect(outcome.ok).toBe(true);
    // The KB binding still comes from the CALLER'S context — never the payload.
    expect(mockedRetrieve.mock.calls[0][0].kbId).toBe(KB_A);
  });

  it("scopes execution to the caller's tenant (tenant isolation)", async () => {
    const runtime = buildClaraToolRuntime();
    await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_A));
    await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_B));

    expect(mockedRetrieve.mock.calls[0][0].orgId).toBe(TENANT_A);
    expect(mockedRetrieve.mock.calls[1][0].orgId).toBe(TENANT_B);
    // Entitlement resolution is scoped to each caller's org.
    expect(mockedEntitlements.mock.calls[0][0]).toBe(TENANT_A);
    expect(mockedEntitlements.mock.calls[1][0]).toBe(TENANT_B);
  });

  it("preserves domain-level GroundingOutcome failures as valid tool outputs (the 402 contract)", async () => {
    const domainFailure = { ok: false as const, status: 402, error: "plan_limit_exceeded" };
    mockedRetrieve.mockResolvedValue(domainFailure as never);

    const runtime = buildClaraToolRuntime();
    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_A));

    // The TOOL executed; the quota denial is its domain payload, preserved.
    expect(outcome.ok).toBe(true);
    expect((outcome as { data: unknown }).data).toBe(domainFailure);
  });

  it("normalizes an underlying retrieval crash into a typed EXECUTION_FAILED failure", async () => {
    mockedRetrieve.mockRejectedValue(new Error("qdrant unreachable") as never);
    const runtime = buildClaraToolRuntime();

    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_A));
    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code: string; message: string } }).error.code).toBe("EXECUTION_FAILED");
    expect((outcome as { error: { message: string } }).error.message).toContain("qdrant unreachable");
  });
});

// ─── Authorization behavior ───────────────────────────────────────────────────

describe("rag_search — authorization behavior (fail-closed)", () => {
  it("rejects the chat surface — chat never exposed a tool surface (no broadened exposure)", async () => {
    const runtime = buildClaraToolRuntime();
    const chatCtx = createExecutionContext({ orgId: TENANT_A, kbId: KB_A, surface: "chat" });

    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, chatCtx);
    expect(outcome.ok).toBe(false);
    expect((outcome as { error: { code: string } }).error.code).toBe("UNAUTHORIZED_SURFACE");
    expect(mockedRetrieve).not.toHaveBeenCalled();
  });

  it("rejects an insufficient plan entitlement (realtime → realtime_voice)", async () => {
    const runtime = buildClaraToolRuntime();
    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_FREE));

    expect(outcome.ok).toBe(false);
    const failure = outcome as { error: { code: string; message: string } };
    expect(failure.error.code).toBe("PLAN_NOT_ENTITLED");
    expect(failure.error.message).toContain("realtime voice");
    expect(mockedRetrieve).not.toHaveBeenCalled();
  });

  it("rejects the embed surface when voice_chat is not entitled", async () => {
    const runtime = buildClaraToolRuntime();
    const embedCtx = createExecutionContext({ orgId: TENANT_FREE, kbId: KB_A, surface: "embed" });

    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, embedCtx);
    expect((outcome as { error: { code: string } }).error.code).toBe("PLAN_NOT_ENTITLED");
  });

  it("allows the embed surface when voice_chat is entitled", async () => {
    const runtime = buildClaraToolRuntime();
    const embedCtx = createExecutionContext({ orgId: TENANT_A, kbId: KB_A, surface: "embed" });

    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, embedCtx);
    expect(outcome.ok).toBe(true);
  });

  it("rejects invalid arguments (missing/blank query, invalid ragMode) with the typed failure", async () => {
    const runtime = buildClaraToolRuntime();
    const ctx = realtimeContext(TENANT_A);

    const missing = await runtime.invoke(RAG_SEARCH_TOOL_NAME, {}, ctx);
    expect((missing as { error: { code: string } }).error.code).toBe("INVALID_ARGUMENTS");

    const blank = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "   " }, ctx);
    expect((blank as { error: { code: string } }).error.code).toBe("INVALID_ARGUMENTS");

    const badMode = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q", ragMode: "bogus" }, ctx);
    expect((badMode as { error: { code: string } }).error.code).toBe("INVALID_ARGUMENTS");

    expect(mockedRetrieve).not.toHaveBeenCalled();
  });

  it("rejects forged (non-factory) execution contexts before anything runs", async () => {
    const runtime = buildClaraToolRuntime();
    const forged = Object.freeze({ tenantId: TENANT_A, kbId: KB_A, surface: "realtime" });

    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, forged as never);
    expect((outcome as { error: { code: string } }).error.code).toBe("INVALID_CONTEXT");
    expect(mockedRetrieve).not.toHaveBeenCalled();
    expect(mockedEntitlements).not.toHaveBeenCalled();
  });
});

// ─── The RBAC integration point (exercised via a permission-requiring tool) ──

describe("Clara authorization adapter — the RBAC integration point", () => {
  const permissionTool: ToolDefinition = {
    name: "admin_probe",
    description: "Test tool exercising the RBAC path.",
    inputSchema: z.object({}).strip(),
    authorization: { allowedSurfaces: ["chat"], requiredPermission: "kb:read" },
    execute: async () => ({ done: true }),
  };

  function runtimeWithPermissionTool() {
    const runtime = buildClaraToolRuntime();
    runtime.registerTool(permissionTool);
    return runtime;
  }

  it("allows when the caller holds the required permission", async () => {
    const runtime = runtimeWithPermissionTool();
    const ctx = createExecutionContext({
      orgId: TENANT_A,
      kbId: KB_A,
      userId: "user-1",
      surface: "chat",
    });
    const outcome = await runtime.invoke("admin_probe", {}, ctx);
    expect(outcome.ok).toBe(true);
  });

  it("rejects when the caller's role lacks the permission (UNAUTHORIZED_ROLE)", async () => {
    const runtime = runtimeWithPermissionTool();
    const ctx = createExecutionContext({
      orgId: TENANT_VIEWER,
      kbId: KB_A,
      userId: "user-1",
      surface: "chat",
    });
    const outcome = await runtime.invoke("admin_probe", {}, ctx);
    expect((outcome as { error: { code: string } }).error.code).toBe("UNAUTHORIZED_ROLE");
  });

  it("rejects when no user identity is present to check a role against (fail closed)", async () => {
    const runtime = runtimeWithPermissionTool();
    const ctx = createExecutionContext({ orgId: TENANT_A, kbId: KB_A, surface: "chat" });
    const outcome = await runtime.invoke("admin_probe", {}, ctx);
    expect((outcome as { error: { code: string } }).error.code).toBe("UNAUTHORIZED_ROLE");
  });

  it("resolves the surface → plan-capability mapping exactly as the incumbent voice axes do", () => {
    expect(planCapabilityForSurface("chat")).toBe("chat");
    expect(planCapabilityForSurface("realtime")).toBe("realtime_voice");
    expect(planCapabilityForSurface("embed")).toBe("voice_chat");
  });

  it("honors an explicit requiredCapability over the surface-derived one", async () => {
    const pinnedTool: ToolDefinition = {
      name: "chat_only_probe",
      description: "Pins the chat capability.",
      inputSchema: z.object({}).strip(),
      authorization: { allowedSurfaces: ["realtime"], requiredCapability: "chat" },
      execute: async () => ({ done: true }),
    };
    const runtime = buildClaraToolRuntime();
    runtime.registerTool(pinnedTool);

    // TENANT_FREE has chat: true but realtime_voice: false — the pinned
    // capability governs, so this must be ALLOWED.
    const outcome = await runtime.invoke("chat_only_probe", {}, realtimeContext(TENANT_FREE));
    expect(outcome.ok).toBe(true);
  });
});

// ─── Metering hook ────────────────────────────────────────────────────────────

describe("rag_search — the approved metering hook", () => {
  it("invokes the bound metering hook with the correctly scoped record", async () => {
    const records: ToolMeteringRecord[] = [];
    const runtime = buildClaraToolRuntime({
      meteringHook: { onInvocation: (record) => { records.push(record); } },
    });

    await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "metered query" }, realtimeContext(TENANT_A, { sessionId: "sess-42" }));

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.toolName).toBe(RAG_SEARCH_TOOL_NAME);
    expect(record.tenantId).toBe(TENANT_A);
    expect(record.kbId).toBe(KB_A);
    expect(record.agentId).toBe("agent-1");
    expect(record.userId).toBe("user-1");
    expect(record.sessionId).toBe("sess-42");
    expect(record.surface).toBe("realtime");
    expect(record.outcome).toBe("ok");
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("classifies authorization denials in the metering record (error + errorCode)", async () => {
    const records: ToolMeteringRecord[] = [];
    const runtime = buildClaraToolRuntime({
      meteringHook: { onInvocation: (record) => { records.push(record); } },
    });

    await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_FREE));
    expect(records).toHaveLength(1);
    expect(records[0].outcome).toBe("error");
    expect(records[0].errorCode).toBe("PLAN_NOT_ENTITLED");
    expect(records[0].tenantId).toBe(TENANT_FREE); // scoped to the DENIED caller
  });

  it("never breaks the invocation when the bound metering hook fails", async () => {
    const runtime = buildClaraToolRuntime({
      meteringHook: {
        onInvocation: () => {
          throw new Error("spine write failed");
        },
      },
    });
    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_A));
    expect(outcome.ok).toBe(true);
  });
});

// ─── The default Clara metering binding (F-7B-01 correction) ──────────────────

describe("rag_search — the default Clara metering binding on the existing org-scoped audit spine (F-7B-01)", () => {
  it("records each successful invocation on the existing audit spine via writeAuditLog with the caller-scoped record", async () => {
    const runtime = buildClaraToolRuntime();
    const outcome = await runtime.invoke(
      RAG_SEARCH_TOOL_NAME,
      { query: "metered query" },
      realtimeContext(TENANT_A, { sessionId: "sess-42" }),
    );

    expect(outcome.ok).toBe(true);
    expect(mockedWriteAuditLog).toHaveBeenCalledTimes(1);
    const input = mockedWriteAuditLog.mock.calls[0][0];
    // Org/tenant scoping preserved (M-3): the audit row is scoped to the
    // CALLER'S org, exactly as the existing audit spine requires.
    expect(input.orgId).toBe(TENANT_A);
    expect(input.userId).toBe("user-1");
    // The existing audit vocabulary: action / resourceType / resourceId.
    expect(input.action).toBe("tool.invoked");
    expect(input.resourceType).toBe("tool_invocation");
    expect(input.resourceId).toBe(RAG_SEARCH_TOOL_NAME);
    // KB identity preserved (M-5/§9-4) + the full metering record shape.
    expect(input.newData).toMatchObject({
      invocationId: expect.any(String) as string,
      toolName: RAG_SEARCH_TOOL_NAME,
      kbId: KB_A,
      agentId: "agent-1",
      sessionId: "sess-42",
      surface: "realtime",
      outcome: "ok",
      durationMs: expect.any(Number) as number,
    });
    expect((input.newData as Record<string, unknown>).errorCode).toBeUndefined();
  });

  it("preserves org/tenant identity and KB identity across callers (per-org audit scoping)", async () => {
    const runtime = buildClaraToolRuntime();
    await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_A, { kbId: "kb-aaaaaaaa" }));
    await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_B, { kbId: "kb-bbbbbbbb" }));

    expect(mockedWriteAuditLog).toHaveBeenCalledTimes(2);
    const [first, second] = mockedWriteAuditLog.mock.calls.map((call) => call[0]);
    expect(first.orgId).toBe(TENANT_A);
    expect((first.newData as Record<string, unknown>).kbId).toBe("kb-aaaaaaaa");
    expect(second.orgId).toBe(TENANT_B);
    expect((second.newData as Record<string, unknown>).kbId).toBe("kb-bbbbbbbb");
  });

  it("classifies authorization denials with the dedicated tool.denied audit action (the quota.denied discipline)", async () => {
    const runtime = buildClaraToolRuntime();

    // Plan-entitlement denial (realtime → realtime_voice not entitled).
    const denied = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_FREE));
    expect((denied as { error: { code: string } }).error.code).toBe("PLAN_NOT_ENTITLED");

    // Surface denial (chat never exposed a tool surface).
    const chatCtx = createExecutionContext({ orgId: TENANT_A, kbId: KB_A, surface: "chat" });
    const refused = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, chatCtx);
    expect((refused as { error: { code: string } }).error.code).toBe("UNAUTHORIZED_SURFACE");

    expect(mockedWriteAuditLog).toHaveBeenCalledTimes(2);
    const [entitlementDenial, surfaceDenial] = mockedWriteAuditLog.mock.calls.map((call) => call[0]);
    // The denial rows mirror the quota spine's quota.denied discipline…
    expect(entitlementDenial.action).toBe("tool.denied");
    expect(entitlementDenial.orgId).toBe(TENANT_FREE); // scoped to the DENIED caller
    expect(entitlementDenial.newData).toMatchObject({
      toolName: RAG_SEARCH_TOOL_NAME,
      outcome: "error",
      errorCode: "PLAN_NOT_ENTITLED",
    });
    expect(surfaceDenial.action).toBe("tool.denied");
    expect((surfaceDenial.newData as Record<string, unknown>).errorCode).toBe("UNAUTHORIZED_SURFACE");
    // …and the denied attempts never reached the retrieval implementation.
    expect(mockedRetrieve).not.toHaveBeenCalled();
  });

  it("never writes billing/query events — rag_search is not double-billed (the owning turn owns the query accounting)", async () => {
    const runtime = buildClaraToolRuntime();
    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_A));
    expect(outcome.ok).toBe(true);

    // The incumbent retrieval ran exactly once through the unchanged seam…
    expect(mockedRetrieve).toHaveBeenCalledTimes(1);
    // …the metering binding wrote exactly ONE org-scoped audit row…
    expect(mockedWriteAuditLog).toHaveBeenCalledTimes(1);
    // …and NONE of the billing/query-event writers were touched — no
    // second query_events row (which would consume the org's rolling-24h
    // quota), no usage_events row (whose closed kind vocabulary has no
    // tool-invocation kind and permits no schema change).
    expect(mockedLogQueryEvent).not.toHaveBeenCalled();
    expect(mockedFinalizeQueryEvent).not.toHaveBeenCalled();
    expect(mockedAdmitQueryEvent).not.toHaveBeenCalled();
    expect(mockedLogUsageEvent).not.toHaveBeenCalled();
  });

  it("does not meter invalid contexts — no untrusted tenant data reaches the audit spine (F-7B-02)", async () => {
    const runtime = buildClaraToolRuntime();
    const forged = Object.freeze({ tenantId: "attacker-tenant", kbId: "attacker-kb", surface: "realtime" });

    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, forged as never);
    expect((outcome as { error: { code: string } }).error.code).toBe("INVALID_CONTEXT");

    // Rejected BEFORE tenant-scoped metering: no audit row was constructed
    // from the untrusted context.
    expect(mockedWriteAuditLog).not.toHaveBeenCalled();
    expect(mockedRetrieve).not.toHaveBeenCalled();
  });

  it("never breaks the invocation when the audit-spine write itself fails", async () => {
    mockedWriteAuditLog.mockRejectedValue(new Error("audit insert failed") as never);
    const runtime = buildClaraToolRuntime();

    const outcome = await runtime.invoke(RAG_SEARCH_TOOL_NAME, { query: "q" }, realtimeContext(TENANT_A));
    // The metered pipeline is unaffected — the existing spine's
    // never-break-the-metered-pipeline discipline.
    expect(outcome.ok).toBe(true);
  });

  it("the hook is directly invocable with a caller-scoped record and writes exactly one audit row", async () => {
    const hook = buildClaraToolMeteringHook();
    const record: ToolMeteringRecord = {
      invocationId: "toolinv-test-1",
      toolName: RAG_SEARCH_TOOL_NAME,
      tenantId: TENANT_A,
      kbId: KB_A,
      agentId: "agent-1",
      userId: "user-1",
      sessionId: "session-1",
      surface: "embed",
      outcome: "error",
      errorCode: "EXECUTION_FAILED",
      durationMs: 7,
    };
    await hook.onInvocation(record);

    // Non-denial typed failures still record tool.invoked (only the
    // authorization-denial family records tool.denied).
    expect(mockedWriteAuditLog).toHaveBeenCalledTimes(1);
    const input = mockedWriteAuditLog.mock.calls[0][0];
    expect(input.action).toBe("tool.invoked");
    expect(input.orgId).toBe(TENANT_A);
    expect(input.newData).toMatchObject({
      toolName: RAG_SEARCH_TOOL_NAME,
      kbId: KB_A,
      surface: "embed",
      outcome: "error",
      errorCode: "EXECUTION_FAILED",
      durationMs: 7,
    });
  });
});

// ─── The incumbent-seam migration path ────────────────────────────────────────

describe("invokeClaraTool — the incumbent identity migration path", () => {
  it("mints the mandatory context from ClaraRuntimeContext and delegates to the registry", async () => {
    const outcome = await invokeClaraTool(
      { orgId: TENANT_A, agentId: "agent-1", kbId: KB_A, userId: "user-1", sessionId: "session-1" },
      RAG_SEARCH_TOOL_NAME,
      { query: "via incumbent identity" },
      "realtime",
    );

    expect(outcome.ok).toBe(true);
    expect(mockedRetrieve).toHaveBeenCalledTimes(1);
    expect(mockedRetrieve.mock.calls[0][0]).toEqual({
      orgId: TENANT_A,
      agentId: "agent-1",
      kbId: KB_A,
      userId: "user-1",
      sessionId: "session-1",
    });
  });

  it("fails closed when the incumbent identity carries no tenant (no ambient fallback)", async () => {
    const outcome = await invokeClaraTool(
      { orgId: null, agentId: null, kbId: KB_A, userId: null, sessionId: null },
      RAG_SEARCH_TOOL_NAME,
      { query: "q" },
    );
    expect((outcome as { error: { code: string } }).error.code).toBe("INVALID_CONTEXT");
    expect(mockedRetrieve).not.toHaveBeenCalled();
  });

  it("defaults to the realtime surface (the voice tool-call path this seam serves)", async () => {
    await invokeClaraTool({ orgId: TENANT_A, agentId: null, kbId: KB_A, userId: null, sessionId: null }, RAG_SEARCH_TOOL_NAME, { query: "q" });
    // Entitlement resolved against the realtime_voice capability.
    const outcome = await invokeClaraTool({ orgId: TENANT_FREE, agentId: null, kbId: KB_A, userId: null, sessionId: null }, RAG_SEARCH_TOOL_NAME, { query: "q" });
    expect((outcome as unknown as { error: { code: string } }).error.code).toBe("PLAN_NOT_ENTITLED");
  });
});

// ─── The Clara authorization adapter unit surface ─────────────────────────────

describe("buildClaraToolAuthorizationAdapter — unit surface", () => {
  it("returns allowed when the plan is entitled and no permission is required", async () => {
    const adapter = buildClaraToolAuthorizationAdapter();
    const decision = await adapter.authorize({
      toolName: RAG_SEARCH_TOOL_NAME,
      policy: { allowedSurfaces: ["realtime", "embed"], requiredPermission: null },
      context: realtimeContext(TENANT_A),
    });
    expect(decision.allowed).toBe(true);
  });
});
