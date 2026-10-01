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
