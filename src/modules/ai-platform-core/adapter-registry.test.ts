import { describe, expect, it } from "vitest";
import {
  AdapterRegistrationError,
  AdaptersNotRegisteredError,
  UnknownAdapterError,
  createPlatformAdapterRegistry,
} from "./adapter-registry";
import type { ExecutionContextInput, PlatformAdapters, PlatformAdapterName, PlatformExecutionContext } from "./contracts";

function stubAdapters(): PlatformAdapters {
  return {
    identity: {
      resolve: (input: ExecutionContextInput): PlatformExecutionContext =>
        input as unknown as PlatformExecutionContext,
    },
    provider: { resolveModel: async () => ({ providerId: "openai", chatModel: "m", embeddingProviderId: "openai" }) },
    secrets: { transferPolicy: "never" as const, get: async () => { throw new Error("stub"); } },
    transport: { describe: () => [] },
  };
}

const ALL_SLOTS: PlatformAdapterName[] = ["identity", "provider", "secrets", "transport"];

describe("adapter registration (fail-closed)", () => {
  it("accepts a complete, well-shaped adapter set", () => {
    const registry = createPlatformAdapterRegistry();
    const adapters = stubAdapters();
    expect(() => registry.register(adapters)).not.toThrow();
    expect(registry.isRegistered()).toBe(true);
    expect(registry.listRegistered()).toEqual(ALL_SLOTS);
  });

  it("rejects each missing slot deterministically, naming it, and stays unregistered", () => {
    for (const slot of ALL_SLOTS) {
      const incomplete = stubAdapters();
      delete (incomplete as unknown as Record<string, unknown>)[slot];
      const registry = createPlatformAdapterRegistry();
      const attempt = () => registry.register(incomplete);
      expect(attempt).toThrow(AdapterRegistrationError);
      expect(attempt).toThrow(new RegExp(slot));
      expect(registry.isRegistered()).toBe(false);
      expect(() => registry.get("identity")).toThrow(AdaptersNotRegisteredError);
    }
  });

  it("rejects mis-shaped adapters (non-object slots, missing required methods)", () => {
    const registry = createPlatformAdapterRegistry();
    expect(() => registry.register(null as never)).toThrow(AdapterRegistrationError);
    expect(() => registry.register("nope" as never)).toThrow(AdapterRegistrationError);
    expect(() => registry.register({ ...stubAdapters(), identity: {} as never })).toThrow(AdapterRegistrationError);
    expect(() => registry.register({ ...stubAdapters(), identity: "not-an-object" as never })).toThrow(AdapterRegistrationError);
    expect(() => registry.register({ ...stubAdapters(), provider: { resolveModel: "not-a-fn" } as never })).toThrow(AdapterRegistrationError);
    expect(() => registry.register({ ...stubAdapters(), secrets: { get: "not-a-fn" } as never })).toThrow(AdapterRegistrationError);
    expect(() => registry.register({ ...stubAdapters(), transport: { describe: 42 } as never })).toThrow(AdapterRegistrationError);
    expect(registry.isRegistered()).toBe(false);
  });

  it("rejects duplicate registration and preserves the original live binding", () => {
    const registry = createPlatformAdapterRegistry();
    const original = stubAdapters();
    registry.register(original);

    const hostile = stubAdapters();
    (hostile.transport as { describe: () => unknown[] }).describe = () => [{ kind: "evil", route: "/api/not-real", surface: "chat" }];

    expect(() => registry.register(hostile)).toThrow(AdapterRegistrationError);
    expect(() => registry.register(hostile)).toThrow(/already registered/i);
    // The live binding is unchanged — no silent overwrite.
    expect(registry.get("transport").describe()).toEqual(original.transport.describe());
    expect(registry.get("transport").describe()).not.toEqual(hostile.transport.describe());
  });

  it("holds a frozen adapter set — slots cannot be swapped after registration", () => {
    const registry = createPlatformAdapterRegistry();
    registry.register(stubAdapters());
    const committed = registry.requireRegistered();
    expect(Object.isFrozen(committed)).toBe(true);
    expect(() => {
      (committed as unknown as Record<string, unknown>).identity = { resolve: () => null };
    }).toThrow(TypeError);
  });

  it("a failed re-registration attempt leaves the registry fully usable", () => {
    const registry = createPlatformAdapterRegistry();
    registry.register(stubAdapters());
    expect(() => registry.register({ ...stubAdapters(), transport: {} as never })).toThrow(AdapterRegistrationError);
    // Still the original, complete set.
    expect(registry.get("provider")).toBeTypeOf("object");
    expect(registry.listRegistered()).toEqual(ALL_SLOTS);
  });
});

describe("adapter lookup (deterministic, no fallback)", () => {
  it("returns the exact bound adapter for each known slot", () => {
    const registry = createPlatformAdapterRegistry();
    const adapters = stubAdapters();
    registry.register(adapters);
    expect(registry.get("identity")).toBe(adapters.identity);
    expect(registry.get("provider")).toBe(adapters.provider);
    expect(registry.get("secrets")).toBe(adapters.secrets);
    expect(registry.get("transport")).toBe(adapters.transport);
  });

  it("fails closed for unknown adapter names — no implicit fallback", () => {
    const registry = createPlatformAdapterRegistry();
    registry.register(stubAdapters());
    for (const unknown of ["mcp", "integrations", "agents", "workspace", "sandbox", "memory", "skills", "tools", "default", "", "IDENTITY"]) {
      expect(() => registry.get(unknown as never)).toThrow(UnknownAdapterError);
    }
  });

  it("fails closed before any registration exists", () => {
    const registry = createPlatformAdapterRegistry();
    expect(() => registry.get("identity")).toThrow(AdaptersNotRegisteredError);
    expect(() => registry.requireRegistered()).toThrow(AdaptersNotRegisteredError);
    expect(registry.isRegistered()).toBe(false);
    expect(registry.listRegistered()).toEqual([]);
  });

  it("isolate registries never share state", () => {
    const first = createPlatformAdapterRegistry();
    const second = createPlatformAdapterRegistry();
    const adapters = stubAdapters();
    first.register(adapters);
    expect(first.isRegistered()).toBe(true);
    expect(second.isRegistered()).toBe(false);
    expect(() => second.get("identity")).toThrow(AdaptersNotRegisteredError);
    second.register({ ...stubAdapters(), transport: { describe: () => [{ kind: "embed-widget", route: "/api/embed/chat", surface: "embed" }] } });
    expect(second.get("transport").describe()).not.toEqual(first.get("transport").describe());
  });
});

describe("CORRECTION B — committed adapter immutability (architect review of 688070a5: freezing only the slot container was shallow)", () => {
  // Mutation attempts must be safe to attempt: in strict mode (ES modules) a
  // write to a frozen object throws TypeError; in sloppy mode it silently
  // fails. Either way the security property under test is that the committed
  // implementation is unchanged — so the attempt is wrapped and the committed
  // state is asserted afterwards.
  function attemptMutation(mutate: () => void): void {
    try {
      mutate();
    } catch {
      // TypeError expected in strict mode — the mutation did not take.
    }
  }

  function hostileResolveModel() {
    return async () => ({ providerId: "hostile", chatModel: "pwned", embeddingProviderId: "hostile" });
  }

  it("B1: mutating the ORIGINAL adapter object after registration cannot alter committed behavior", async () => {
    const registry = createPlatformAdapterRegistry();
    const adapters = stubAdapters();
    const committedResolveModel = adapters.provider.resolveModel;
    registry.register(adapters);

    // The in-place commit freeze reaches the caller's original reference:
    expect(Object.isFrozen(adapters.provider)).toBe(true);

    // The exact attack from the corrective handoff: swap the method through
    // the original reference supplied to register().
    attemptMutation(() => {
      adapters.provider.resolveModel = hostileResolveModel();
    });
    expect(adapters.provider.resolveModel).toBe(committedResolveModel);
    expect(registry.get("provider").resolveModel).toBe(committedResolveModel);
    // The committed implementation still behaves exactly as validated.
    const resolution = await registry.get("provider").resolveModel({ tenantId: "t", kbId: "k", surface: "chat" } as never);
    expect(resolution).toEqual({ providerId: "openai", chatModel: "m", embeddingProviderId: "openai" });
    expect(resolution.providerId).not.toBe("hostile");
  });

  it("B2: the adapter returned by get()/requireRegistered() cannot be mutated", async () => {
    const registry = createPlatformAdapterRegistry();
    const adapters = stubAdapters();
    const committedResolveModel = adapters.provider.resolveModel;
    registry.register(adapters);

    // Mutation through the registry.get() reference:
    const viaGet = registry.get("provider");
    attemptMutation(() => {
      viaGet.resolveModel = hostileResolveModel();
    });
    attemptMutation(() => {
      (viaGet as unknown as Record<string, unknown>).injectedSlot = "hostile";
    });
    expect(registry.get("provider").resolveModel).toBe(committedResolveModel);
    expect((viaGet as unknown as Record<string, unknown>).injectedSlot).toBeUndefined();

    // Mutation through the requireRegistered() set AND its slots:
    const viaRequire = registry.requireRegistered();
    attemptMutation(() => {
      (viaRequire as unknown as Record<string, unknown>).provider = { resolveModel: hostileResolveModel() };
    });
    attemptMutation(() => {
      viaRequire.provider.resolveModel = hostileResolveModel();
    });
    expect(registry.requireRegistered().provider).toBe(adapters.provider);
    expect(registry.get("provider").resolveModel).toBe(committedResolveModel);

    // Committed behavior is untouched after every attempt.
    const resolution = await registry.get("provider").resolveModel({ tenantId: "t", kbId: "k", surface: "chat" } as never);
    expect(resolution.providerId).toBe("openai");
  });

  it("B3: a failed registration remains atomic — the registry stays unregistered and the rejected objects are untouched", () => {
    // Preserved from the original suite, plus the freeze-order property: the
    // freeze happens only AFTER validation, so a rejected (invalid) set is
    // never frozen and the registry remains unchanged.
    const registry = createPlatformAdapterRegistry();
    const invalid = { ...stubAdapters(), transport: { describe: 42 } as never };
    expect(() => registry.register(invalid)).toThrow(AdapterRegistrationError);
    expect(registry.isRegistered()).toBe(false);
    expect(() => registry.get("identity")).toThrow(AdaptersNotRegisteredError);
    // The rejected (invalid) objects were not frozen by the failed attempt.
    expect(Object.isFrozen(invalid.identity)).toBe(false);
  });

  it("B4: duplicate registration remains atomic — first registration stays active, the rejected second set is untouched", () => {
    const registry = createPlatformAdapterRegistry();
    const first = stubAdapters();
    const committedDescribe = first.transport.describe;
    registry.register(first);

    const second = stubAdapters();
    // (The hostile second set is still mutable — the duplicate check fires
    // BEFORE any validation or freezing touches it.)
    (second.transport as { describe: () => unknown[] }).describe = () => [{ kind: "evil", route: "/api/not-real", surface: "chat" }];
    expect(() => registry.register(second)).toThrow(AdapterRegistrationError);
    expect(() => registry.register(second)).toThrow(/already registered/i);

    // The first registration remains active and immutable: the committed
    // FUNCTION is still the original one, and it still returns its original
    // (empty) inventory — not the hostile replacement.
    expect(registry.get("transport").describe).toBe(committedDescribe);
    expect(registry.get("transport").describe()).toEqual([]);
    expect(registry.get("transport").describe()).not.toEqual(second.transport.describe());
    // The rejected second set was not frozen by the duplicate attempt.
    expect(Object.isFrozen(second.transport)).toBe(false);
  });

  it("B5: all four adapter slots retain their committed behavior and immutability after registration", async () => {
    const registry = createPlatformAdapterRegistry();
    const adapters = stubAdapters();
    const committed = {
      identity: adapters.identity.resolve,
      provider: adapters.provider.resolveModel,
      secrets: adapters.secrets.get,
      transport: adapters.transport.describe,
    };
    registry.register(adapters);

    // Identity: the registry keeps the EXACT validated implementation...
    expect(registry.get("identity")).toBe(adapters.identity);
    expect(registry.get("provider")).toBe(adapters.provider);
    expect(registry.get("secrets")).toBe(adapters.secrets);
    expect(registry.get("transport")).toBe(adapters.transport);
    // ...and every slot object is frozen (immutable through every reference).
    for (const slot of ALL_SLOTS) {
      expect(Object.isFrozen(registry.get(slot))).toBe(true);
      expect(Object.isFrozen(registry.requireRegistered()[slot])).toBe(true);
    }

    // Hostile mutation attempts against every slot's methods:
    attemptMutation(() => { (adapters.identity as unknown as Record<string, unknown>).resolve = () => null; });
    attemptMutation(() => { (adapters.provider as unknown as Record<string, unknown>).resolveModel = hostileResolveModel(); });
    attemptMutation(() => { (adapters.secrets as unknown as Record<string, unknown>).get = async () => "LEAKED"; });
    attemptMutation(() => { (adapters.transport as unknown as Record<string, unknown>).describe = () => [{ kind: "evil", route: "/api/not-real", surface: "chat" }]; });
    attemptMutation(() => { Object.assign(registry.get("secrets"), { transferPolicy: "always" }); });

    // The committed bindings are unchanged...
    expect(registry.get("identity").resolve).toBe(committed.identity);
    expect(registry.get("provider").resolveModel).toBe(committed.provider);
    expect(registry.get("secrets").get).toBe(committed.secrets);
    expect(registry.get("transport").describe).toBe(committed.transport);
    expect(registry.get("secrets").transferPolicy).toBe("never");

    // ...and every slot still behaves exactly as originally validated.
    const input = { orgId: "org-1", kbId: "kb-1" };
    expect(registry.get("identity").resolve(input)).toBe(input);
    await expect(registry.get("provider").resolveModel({ tenantId: "t", kbId: "k", surface: "chat" } as never))
      .resolves.toEqual({ providerId: "openai", chatModel: "m", embeddingProviderId: "openai" });
    await expect(registry.get("secrets").get({ tenantId: "t", kbId: "k", surface: "chat" } as never, "OPENAI_API_KEY"))
      .rejects.toThrow("stub");
    expect(registry.get("transport").describe()).toEqual([]);
  });
});
