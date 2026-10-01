import { beforeEach, describe, expect, it, vi } from "vitest";

// The provider adapter's contract is DELEGATION to the incumbent seam; the
// unit boundary is therefore clara-runtime itself. Mocking it keeps this
// suite hermetic (no DB / provider stack) and lets the tests assert exactly
// which tenant context crosses the adapter boundary.
vi.mock("./clara-runtime", () => ({
  claraRuntime: {
    resolveProvider: vi.fn(async () => ({
      provider: "openai",
      chatModel: "gpt-test",
      embeddingProvider: "openai",
    })),
  },
}));

import { claraRuntime } from "./clara-runtime";
import {
  PlatformSecretAccessError,
  buildClaraPlatformAdapters,
  getClaraPlatformAdapter,
  getClaraPlatformRegistry,
} from "./clara-adapters";
import { createExecutionContext } from "./execution-context";

const TENANT_A = "org-tenant-a";
const TENANT_B = "org-tenant-b";
const KB_A = "kb-aaaa";
const KB_B = "kb-bbbb";

const mockedResolveProvider = vi.mocked(claraRuntime.resolveProvider);

function contextForTenant(tenantId: string, kbId: string) {
  return createExecutionContext({
    orgId: tenantId,
    kbId,
    userId: "user-1",
    agentId: "agent-1",
    sessionId: "session-1",
    surface: "chat",
  });
}

beforeEach(() => {
  mockedResolveProvider.mockClear();
});

describe("Clara identity adapter", () => {
  it("derives the tenant-scoped execution context from Clara runtime identity", () => {
    const identity = buildClaraPlatformAdapters().identity;
    const ctx = identity.resolve({ orgId: TENANT_A, kbId: KB_A, userId: "user-1" });
    expect(ctx.tenantId).toBe(TENANT_A);
    expect(ctx.kbId).toBe(KB_A);
    expect(ctx.userId).toBe("user-1");
    expect(ctx.surface).toBe("chat");
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it("fails closed on missing tenant identity — no ambient fallback", () => {
    const identity = buildClaraPlatformAdapters().identity;
    expect(() => identity.resolve({ orgId: null, kbId: KB_A })).toThrow(/tenant/i);
    expect(() => identity.resolve({ orgId: "", kbId: KB_A })).toThrow(/tenant/i);
  });
});

describe("Clara provider adapter (delegation + tenant isolation)", () => {
  it("delegates to the incumbent seam carrying the caller's tenant context unchanged", async () => {
    const provider = buildClaraPlatformAdapters().provider;
    const resolution = await provider.resolveModel(contextForTenant(TENANT_A, KB_A));

    expect(mockedResolveProvider).toHaveBeenCalledTimes(1);
    const [passedContext, passedSurface] = mockedResolveProvider.mock.calls[0];
    expect(passedContext.orgId).toBe(TENANT_A);
    expect(passedContext.kbId).toBe(KB_A);
    expect(passedContext.agentId).toBe("agent-1");
    expect(passedContext.userId).toBe("user-1");
    expect(passedContext.sessionId).toBe("session-1");
    expect(passedSurface).toBe("chat");

    expect(resolution.providerId).toBe("openai");
    expect(resolution.chatModel).toBe("gpt-test");
    expect(resolution.embeddingProviderId).toBe("openai");
    expect(Object.isFrozen(resolution)).toBe(true);
  });

  it("passes the surface through to the incumbent resolver", async () => {
    const provider = buildClaraPlatformAdapters().provider;
    await provider.resolveModel(contextForTenant(TENANT_A, KB_A));
    expect(mockedResolveProvider.mock.calls[0][1]).toBe("chat");
    await provider.resolveModel(createExecutionContext({ orgId: TENANT_A, kbId: KB_A, surface: "realtime" }));
    expect(mockedResolveProvider.mock.calls[1][1]).toBe("realtime");
    await provider.resolveModel(createExecutionContext({ orgId: TENANT_A, kbId: KB_A, surface: "embed" }));
    expect(mockedResolveProvider.mock.calls[2][1]).toBe("embed");
  });

  it("tenant A's invocation can never resolve tenant B's context", async () => {
    const provider = buildClaraPlatformAdapters().provider;
    const ctxA = contextForTenant(TENANT_A, KB_A);
    const ctxB = contextForTenant(TENANT_B, KB_B);

    await provider.resolveModel(ctxA);

    // Every call the incumbent seam received carried tenant A — never B.
    for (const [passedContext] of mockedResolveProvider.mock.calls) {
      expect(passedContext.orgId).toBe(TENANT_A);
      expect(passedContext.orgId).not.toBe(TENANT_B);
    }
    // The tenant-B context exists but was never forwarded.
    expect(ctxB.tenantId).toBe(TENANT_B);
    expect(mockedResolveProvider).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed invocation before reaching the incumbent resolver", async () => {
    const provider = buildClaraPlatformAdapters().provider;
    await expect(provider.resolveModel(null as never)).rejects.toThrow(/tenant-scoped PlatformExecutionContext/i);
    await expect(provider.resolveModel({ kbId: KB_A } as never)).rejects.toThrow(/tenant-scoped PlatformExecutionContext/i);
    await expect(
      provider.resolveModel({ tenantId: TENANT_A, kbId: KB_A, surface: "chat" } as never),
    ).rejects.toThrow(/tenant-scoped PlatformExecutionContext/i);
    expect(mockedResolveProvider).not.toHaveBeenCalled();
  });
});

describe("Clara secrets adapter (declaration only — nothing crosses the seam)", () => {
  it("declares the never-transfer policy", () => {
    expect(buildClaraPlatformAdapters().secrets.transferPolicy).toBe("never");
  });

  it("fails closed for every key, even with a fully valid tenant context", async () => {
    const secrets = buildClaraPlatformAdapters().secrets;
    const ctx = contextForTenant(TENANT_A, KB_A);
    for (const key of ["OPENAI_API_KEY", "provider:openai", "org_api_key", ""]) {
      await expect(secrets.get(ctx, key)).rejects.toBeInstanceOf(PlatformSecretAccessError);
      await expect(secrets.get(ctx, key)).rejects.toThrow(/never crosses/i);
    }
  });

  it("fails closed even for malformed contexts — it can never be coaxed into returning material", async () => {
    const secrets = buildClaraPlatformAdapters().secrets;
    await expect(secrets.get(null as never, "OPENAI_API_KEY")).rejects.toBeInstanceOf(PlatformSecretAccessError);
  });
});

describe("Clara transport adapter (declaration only — existing routes)", () => {
  it("describes exactly the three existing transport surfaces with real Clara routes", () => {
    const descriptors = buildClaraPlatformAdapters().transport.describe();
    expect(descriptors.map((d) => d.route).sort()).toEqual(["/api/chat", "/api/embed/chat", "/api/realtime/session"]);
    expect(descriptors.map((d) => d.surface).sort()).toEqual(["chat", "embed", "realtime"]);
    expect(new Set(descriptors.map((d) => d.kind)).size).toBe(3);
  });

  it("returns frozen declarations — the inventory cannot be mutated after the fact", () => {
    const descriptors = buildClaraPlatformAdapters().transport.describe();
    expect(() => {
      (descriptors[0] as { route?: string }).route = "/api/not-a-real-route";
    }).toThrow(TypeError);
  });
});

describe("Clara platform registry singleton", () => {
  it("registers the complete Clara adapter set exactly once and fails closed on re-registration", () => {
    const registry = getClaraPlatformRegistry();
    expect(registry.isRegistered()).toBe(true);
    expect(registry.listRegistered()).toEqual(["identity", "provider", "secrets", "transport"]);
    expect(() => registry.register(buildClaraPlatformAdapters())).toThrow(/already registered/i);
  });

  it("returns the same registry instance and exposes bound adapters", () => {
    expect(getClaraPlatformRegistry()).toBe(getClaraPlatformRegistry());
    expect(typeof getClaraPlatformAdapter("identity").resolve).toBe("function");
    expect(typeof getClaraPlatformAdapter("provider").resolveModel).toBe("function");
    expect(getClaraPlatformAdapter("secrets").transferPolicy).toBe("never");
    expect(getClaraPlatformAdapter("transport").describe().length).toBe(3);
    expect(() => getClaraPlatformAdapter("mcp" as never)).toThrow(/Unknown platform adapter/i);
  });

  it("the singleton's identity adapter fails closed like the factory", () => {
    expect(() => getClaraPlatformAdapter("identity").resolve({ orgId: null, kbId: KB_A })).toThrow(/tenant/i);
    const ctx = getClaraPlatformAdapter("identity").resolve({ orgId: TENANT_A, kbId: KB_A });
    expect(ctx.tenantId).toBe(TENANT_A);
  });
});
