import { describe, expect, it } from "vitest";
import {
  MCP_ENTITLEMENTS_DISABLED,
  MCP_SEED_PLAN_ENTITLEMENTS,
  MCP_SYSTEM_SAFETY_MAXIMA,
  mcpOverrideSchema,
  validateMcpEntitlements,
  parseStoredEntitlements,
} from "./entitlements";

const validBase = {
  enabled: true,
  customEndpoints: true,
  maxConnections: 5,
  maxToolsPerConnection: 50,
  maxAgentAssignments: 100,
  toolCallsPerPeriod: 10_000,
  toolCallsPerMinute: 60,
  allowedAuthMethods: ["none", "bearer_token"],
  allowedTransports: ["streamable_http"],
  platformCatalog: true,
  privateNetwork: false,
  usagePolicy: "deny",
  notes: "internal note",
};

describe("MCP entitlement validation — plan configuration", () => {
  it("accepts a fully valid entitlement document", () => {
    const result = validateMcpEntitlements(validBase);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.maxConnections).toBe(5);
  });

  it("rejects negative values other than the -1 unlimited sentinel", () => {
    const result = validateMcpEntitlements({ ...validBase, maxConnections: -2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("non-negative");
  });

  it("rejects non-integer and non-numeric limits", () => {
    const floaty = validateMcpEntitlements({ ...validBase, toolCallsPerMinute: 1.5 });
    expect(floaty.ok).toBe(false);
    const textual = validateMcpEntitlements({ ...validBase, maxConnections: "5" });
    expect(textual.ok).toBe(false);
  });

  it("rejects limits above the system safety maxima", () => {
    const result = validateMcpEntitlements({
      ...validBase,
      maxConnections: MCP_SYSTEM_SAFETY_MAXIMA.maxConnections + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("safety maximum");
    }
  });

  it("rejects contradictory configuration: capabilities granted while disabled", () => {
    const result = validateMcpEntitlements({
      ...validBase,
      enabled: false,
      customEndpoints: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("customEndpoints cannot be allowed");
    }
  });

  it("rejects custom endpoints with a zero connection limit", () => {
    const result = validateMcpEntitlements({
      ...validBase,
      maxConnections: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("maxConnections of 0");
  });

  it("rejects metered overage without a finite quota to meter against", () => {
    const result = validateMcpEntitlements({
      ...validBase,
      usagePolicy: "meter",
      toolCallsPerPeriod: -1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("finite toolCallsPerPeriod");
  });

  it("rejects unsupported authentication methods", () => {
    const result = validateMcpEntitlements({
      ...validBase,
      allowedAuthMethods: ["none", "oauth2_client_credentials"],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported transports", () => {
    const result = validateMcpEntitlements({
      ...validBase,
      allowedTransports: ["stdio", "sse"],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects empty auth-method and transport lists", () => {
    const noAuth = validateMcpEntitlements({ ...validBase, allowedAuthMethods: [] });
    expect(noAuth.ok).toBe(false);
    const noTransport = validateMcpEntitlements({ ...validBase, allowedTransports: [] });
    expect(noTransport.ok).toBe(false);
  });

  it("rejects private-network connectivity (no approved gateway exists)", () => {
    const result = validateMcpEntitlements({ ...validBase, privateNetwork: true });
    expect(result.ok).toBe(false);
  });

  it("accepts the seeded plan reference data", () => {
    for (const [planId, entitlements] of Object.entries(MCP_SEED_PLAN_ENTITLEMENTS)) {
      const result = validateMcpEntitlements(entitlements);
      expect(result.ok, `seed plan ${planId}`).toBe(true);
    }
  });

  it("accepts the disabled default", () => {
    expect(validateMcpEntitlements(MCP_ENTITLEMENTS_DISABLED).ok).toBe(true);
  });
});

describe("parseStoredEntitlements — fail closed on corrupted rows", () => {
  it("returns the disabled entitlement for null/undefined", () => {
    expect(parseStoredEntitlements(null).entitlements.enabled).toBe(false);
    expect(parseStoredEntitlements(undefined).entitlements.enabled).toBe(false);
  });

  it("returns valid stored documents unchanged", () => {
    const parsed = parseStoredEntitlements(validBase);
    expect(parsed.valid).toBe(true);
    expect(parsed.entitlements.maxConnections).toBe(5);
  });

  it("fails closed to disabled for invalid stored data", () => {
    const parsed = parseStoredEntitlements({ ...validBase, maxConnections: -7 });
    expect(parsed.valid).toBe(false);
    expect(parsed.entitlements.enabled).toBe(false);
  });
});

describe("organization override schema — limits only", () => {
  it("accepts limit-only overrides", () => {
    const result = mcpOverrideSchema.safeParse({
      maxConnections: 20,
      toolCallsPerMinute: 240,
    });
    expect(result.success).toBe(true);
  });

  it("rejects capability switches an override must never control", () => {
    // Unknown keys are stripped — an override document cannot smuggle in
    // capability switches like `enabled` or `customEndpoints`.
    const result = mcpOverrideSchema.safeParse({ enabled: false, customEndpoints: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
      expect("enabled" in result.data).toBe(false);
    }
  });

  it("rejects negative override limits", () => {
    const result = mcpOverrideSchema.safeParse({ maxConnections: -3 });
    expect(result.success).toBe(false);
  });
});