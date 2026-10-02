import { describe, expect, it } from "vitest";
import {
  ExecutionContextError,
  assertExecutionContext,
  assertTenantScope,
  createExecutionContext,
  isValidPlatformExecutionContext,
} from "./execution-context";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const KB_A = "kb-aaaaaaaa";
const KB_B = "kb-bbbbbbbb";

const validInput = {
  orgId: TENANT_A,
  kbId: KB_A,
  agentId: "agent-1",
  userId: "user-1",
  sessionId: "session-1",
};

describe("createExecutionContext (fail-closed factory)", () => {
  it("maps Clara runtime identity onto the host-neutral context", () => {
    const ctx = createExecutionContext(validInput);
    expect(ctx.tenantId).toBe(TENANT_A);
    expect(ctx.kbId).toBe(KB_A);
    expect(ctx.agentId).toBe("agent-1");
    expect(ctx.userId).toBe("user-1");
    expect(ctx.sessionId).toBe("session-1");
    expect(ctx.correlationId).toBeUndefined();
  });

  it("defaults the surface to chat and preserves explicit surface + correlation id", () => {
    expect(createExecutionContext(validInput).surface).toBe("chat");
    const explicit = createExecutionContext({ ...validInput, surface: "realtime", correlationId: "corr-42" });
    expect(explicit.surface).toBe("realtime");
    expect(explicit.correlationId).toBe("corr-42");
  });

  it("normalizes null optional identity fields to undefined", () => {
    const ctx = createExecutionContext({
      orgId: TENANT_A,
      kbId: KB_A,
      agentId: null,
      userId: null,
      sessionId: null,
      correlationId: null,
    });
    expect(ctx.agentId).toBeUndefined();
    expect(ctx.userId).toBeUndefined();
    expect(ctx.sessionId).toBeUndefined();
    expect(ctx.correlationId).toBeUndefined();
  });

  it("accepts the incumbent ClaraRuntimeContext shape (structural compatibility)", () => {
    // Exactly the shape clara-runtime.ts declares today.
    const incumbent = { orgId: TENANT_A as string | null, agentId: null as string | null, kbId: KB_A, userId: undefined, sessionId: undefined };
    const ctx = createExecutionContext(incumbent);
    expect(ctx.tenantId).toBe(TENANT_A);
    expect(ctx.kbId).toBe(KB_A);
    expect(ctx.agentId).toBeUndefined();
  });

  it("fails closed when tenant identity is missing, null, or blank", () => {
    for (const orgId of [undefined, null, "", "   "]) {
      const attempt = () => createExecutionContext({ ...validInput, orgId });
      expect(attempt).toThrow(ExecutionContextError);
      expect(attempt).toThrow(/tenant/i);
    }
  });

  it("fails closed when the knowledge-base binding is missing or blank", () => {
    for (const kbId of [undefined, null, "", "   "]) {
      const attempt = () => createExecutionContext({ ...validInput, kbId });
      expect(attempt).toThrow(ExecutionContextError);
      expect(attempt).toThrow(/knowledge-base/i);
    }
  });

  it("fails closed on non-object input", () => {
    for (const bad of [null, undefined, "string", 42, true, ["array"]]) {
      expect(() => createExecutionContext(bad as never)).toThrow(ExecutionContextError);
    }
  });

  it("fails closed on unknown identity keys (typo guard)", () => {
    const attempt = () => createExecutionContext({ ...validInput, organistaionId: TENANT_B } as never);
    expect(attempt).toThrow(ExecutionContextError);
    expect(attempt).toThrow(/organistaionId/);
  });

  it("fails closed on malformed optional fields", () => {
    expect(() => createExecutionContext({ ...validInput, userId: "" })).toThrow(ExecutionContextError);
    expect(() => createExecutionContext({ ...validInput, userId: 7 } as never)).toThrow(ExecutionContextError);
    expect(() => createExecutionContext({ ...validInput, surface: "admin" } as never)).toThrow(ExecutionContextError);
    expect(() => createExecutionContext({ ...validInput, surface: null } as never)).toThrow(ExecutionContextError);
    expect(() => createExecutionContext({ ...validInput, metadata: "nope" } as never)).toThrow(ExecutionContextError);
  });

  it("freezes the context — tenant identity cannot be swapped after creation", () => {
    const ctx = createExecutionContext(validInput);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(() => {
      (ctx as { tenantId?: string }).tenantId = TENANT_B;
    }).toThrow(TypeError);
    expect(ctx.tenantId).toBe(TENANT_A);
    expect(() => {
      (ctx as { kbId?: string }).kbId = KB_B;
    }).toThrow(TypeError);
    expect(ctx.kbId).toBe(KB_A);
  });

  it("freezes a defensive copy of metadata", () => {
    const source = { unit: "tokens" };
    const ctx = createExecutionContext({ ...validInput, metadata: source });
    expect(Object.isFrozen(ctx.metadata)).toBe(true);
    source.unit = "mutated-after";
    expect(ctx.metadata?.unit).toBe("tokens");
  });
});

describe("context validation helpers", () => {
  it("isValidPlatformExecutionContext accepts real contexts and rejects malformed values", () => {
    const ctx = createExecutionContext(validInput);
    expect(isValidPlatformExecutionContext(ctx)).toBe(true);
    expect(isValidPlatformExecutionContext(null)).toBe(false);
    expect(isValidPlatformExecutionContext({})).toBe(false);
    expect(isValidPlatformExecutionContext({ ...ctx, tenantId: "" } as never)).toBe(false);
    expect(isValidPlatformExecutionContext({ tenantId: TENANT_A, kbId: KB_A, surface: "nope" } as never)).toBe(false);
  });

  it("rejects hand-rolled context lookalikes — only factory-produced (frozen) contexts are valid", () => {
    // A2 — structurally complete but NOT produced by the factory (not frozen):
    // the sanctioned production path stays createExecutionContext.
    const lookalike = { tenantId: TENANT_A, kbId: KB_A, surface: "chat" };
    expect(isValidPlatformExecutionContext(lookalike)).toBe(false);
    expect(() => assertExecutionContext(lookalike)).toThrow(ExecutionContextError);
    // A4 — copies/serializations of a real context are equally rejected.
    expect(isValidPlatformExecutionContext(JSON.parse(JSON.stringify(createExecutionContext(validInput))))).toBe(false);
  });

  it("assertExecutionContext fails closed on malformed contexts", () => {
    expect(() => assertExecutionContext(null)).toThrow(ExecutionContextError);
    expect(() => assertExecutionContext({ tenantId: TENANT_A })).toThrow(ExecutionContextError);
    expect(assertExecutionContext(createExecutionContext(validInput)).tenantId).toBe(TENANT_A);
  });
});

describe("CORRECTION A — provenance trust boundary (architect review of 688070a5: frozen lookalikes are NOT valid contexts)", () => {
  it("A1: a genuine factory context is accepted", () => {
    const ctx = createExecutionContext(validInput);
    expect(isValidPlatformExecutionContext(ctx)).toBe(true);
    expect(assertExecutionContext(ctx)).toBe(ctx);
  });

  it("A3: a frozen structural lookalike is rejected — Object.freeze is not provenance", () => {
    // The exact attack from the corrective handoff: a caller independently
    // constructs and freezes an equivalent object. Structural validity plus
    // frozenness must NOT satisfy the platform-context trust boundary.
    const forged = Object.freeze({
      tenantId: TENANT_A,
      kbId: KB_A,
      surface: "chat",
    });
    expect(Object.isFrozen(forged)).toBe(true);
    expect(isValidPlatformExecutionContext(forged)).toBe(false);
    expect(() => assertExecutionContext(forged)).toThrow(ExecutionContextError);
    // The forgery also fails the tenant-scope guard — it can never authorize
    // a tenant-scoped platform-seam operation, even for its own tenant ids.
    expect(() => assertTenantScope(forged, TENANT_A)).toThrow(ExecutionContextError);
  });

  it("A3 (hardened): a fully-populated frozen lookalike with frozen metadata is still rejected", () => {
    const forgedFull = Object.freeze({
      tenantId: TENANT_B,
      kbId: KB_B,
      userId: "user-1",
      agentId: "agent-1",
      sessionId: "session-1",
      correlationId: "corr-1",
      surface: "realtime" as const,
      metadata: Object.freeze({ unit: "tokens" }),
    });
    expect(Object.isFrozen(forgedFull)).toBe(true);
    expect(Object.isFrozen(forgedFull.metadata)).toBe(true);
    expect(isValidPlatformExecutionContext(forgedFull)).toBe(false);
    expect(() => assertExecutionContext(forgedFull)).toThrow(ExecutionContextError);
  });

  it("A3 (identity): a re-frozen spread-copy of a REAL context is still rejected", () => {
    // Same shape, same values, frozen — but a different object that was never
    // produced by the factory. Provenance is carried by identity, not shape.
    const real = createExecutionContext(validInput);
    const copy = Object.freeze({ ...real });
    expect(isValidPlatformExecutionContext(copy)).toBe(false);
    expect(() => assertExecutionContext(copy)).toThrow(ExecutionContextError);
    // The genuine context remains valid regardless of the forgery attempts.
    expect(isValidPlatformExecutionContext(real)).toBe(true);
  });

  it("A5: factory contexts remain accepted after validation — provenance uses no marker property, symbol, or externally visible state", () => {
    const ctx = createExecutionContext(validInput);
    // No provenance marker was written onto the context: externally visible
    // state is exactly the documented contract vocabulary — no string-keyed
    // marker, no symbol-keyed marker, no magic metadata field.
    expect(Object.getOwnPropertySymbols(ctx)).toEqual([]);
    expect(Object.keys(ctx).sort()).toEqual(
      ["agentId", "correlationId", "kbId", "sessionId", "surface", "tenantId", "userId"].sort(),
    );
    expect(ctx.metadata).toBeUndefined();
    // Validation is repeatable and identity-based, not mutable-state-based.
    expect(isValidPlatformExecutionContext(ctx)).toBe(true);
    expect(isValidPlatformExecutionContext(ctx)).toBe(true);
    // Interleaved validations of other genuine contexts change nothing.
    const other = createExecutionContext({ orgId: TENANT_B, kbId: KB_B, surface: "embed" });
    expect(isValidPlatformExecutionContext(other)).toBe(true);
    expect(isValidPlatformExecutionContext(ctx)).toBe(true);
    // A rejected lookalike has no effect on genuine contexts.
    const lookalike = Object.freeze({ tenantId: TENANT_A, kbId: KB_A, surface: "chat" });
    expect(isValidPlatformExecutionContext(lookalike)).toBe(false);
    expect(isValidPlatformExecutionContext(ctx)).toBe(true);
    // Genuine contexts stay valid across use in the scope guard and assert.
    assertTenantScope(ctx, TENANT_A);
    assertExecutionContext(ctx);
    expect(isValidPlatformExecutionContext(ctx)).toBe(true);
    // Mutation attempts on the frozen context do not strip provenance.
    expect(() => {
      (ctx as { tenantId?: string }).tenantId = TENANT_B;
    }).toThrow(TypeError);
    expect(isValidPlatformExecutionContext(ctx)).toBe(true);
  });
});

describe("assertTenantScope (cross-tenant guard)", () => {
  it("accepts a context matching the expected tenant", () => {
    const ctx = createExecutionContext(validInput);
    expect(assertTenantScope(ctx, TENANT_A).tenantId).toBe(TENANT_A);
  });

  it("fails closed when tenant A is used against tenant B's scope", () => {
    const ctxA = createExecutionContext(validInput);
    expect(() => assertTenantScope(ctxA, TENANT_B)).toThrow(ExecutionContextError);
    expect(() => assertTenantScope(ctxA, TENANT_B)).toThrow(/tenant/i);
  });

  it("fails closed on malformed contexts and blank expected tenants", () => {
    expect(() => assertTenantScope(null, TENANT_A)).toThrow(ExecutionContextError);
    expect(() => assertTenantScope({}, TENANT_A)).toThrow(ExecutionContextError);
    const ctx = createExecutionContext(validInput);
    expect(() => assertTenantScope(ctx, "")).toThrow(ExecutionContextError);
    expect(() => assertTenantScope(ctx, "   ")).toThrow(ExecutionContextError);
  });
});
