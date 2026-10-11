import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock("@/lib/plan-guard", () => ({}));

import { resolveEffectiveMcpEntitlements } from "./entitlements";

type Row = Record<string, unknown>;

function rows(...values: Row[]): Row[] {
  return values;
}

const GLOBAL_ON = {
  mcp_enabled: true,
  emergency_disabled: false,
  security_policy: {
    requireHttps: true,
    blockPrivateNetworks: true,
    maxRedirects: 0,
    requestTimeoutMs: 15000,
    tlsVerify: true,
  },
  platform_catalog_enabled: true,
  clara_hosted_enabled: false,
};

const PRO_PLAN_ENTITLEMENTS = {
  enabled: true,
  customEndpoints: true,
  maxConnections: 10,
  maxToolsPerConnection: 100,
  maxAgentAssignments: 500,
  toolCallsPerPeriod: 100_000,
  toolCallsPerMinute: 120,
  allowedAuthMethods: ["none", "bearer_token", "basic_auth", "api_key_header"],
  allowedTransports: ["streamable_http"],
  platformCatalog: true,
  privateNetwork: false,
  usagePolicy: "deny",
  notes: "",
};

const FREE_DISABLED = {
  enabled: false,
  customEndpoints: false,
  maxConnections: 0,
  maxToolsPerConnection: 0,
  maxAgentAssignments: 0,
  toolCallsPerPeriod: 0,
  toolCallsPerMinute: 0,
  allowedAuthMethods: ["none"],
  allowedTransports: ["streamable_http"],
  platformCatalog: false,
  privateNetwork: false,
  usagePolicy: "deny",
  notes: "",
};

function subscriptionRow(overrides: Partial<Row> = {}): Row {
  return {
    plan_id: "pro",
    plan_name: "Pro",
    status: "active",
    current_period_start: "2026-10-01T00:00:00Z",
    current_period_end: "2026-11-01T00:00:00Z",
    mcp_entitlements: PRO_PLAN_ENTITLEMENTS,
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("resolveEffectiveMcpEntitlements — global governance first", () => {
  it("fails closed when MCP is globally disabled", async () => {
    queryMock.mockResolvedValue([
      { ...GLOBAL_ON, mcp_enabled: false },
      [],
      [],
    ]);
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(false);
    expect(result.denialReason).toBe("GLOBAL_DISABLED");
  });

  it("emergency disablement overrides every plan-level grant", async () => {
    queryMock.mockResolvedValue([
      { ...GLOBAL_ON, emergency_disabled: true },
      [subscriptionRow()],
      [],
    ]);
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(false);
    expect(result.denialReason).toBe("EMERGENCY_DISABLED");
  });

  it("missing global settings row resolves to defaults (disabled)", async () => {
    queryMock.mockResolvedValue([[], [], []]);
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(false);
    expect(result.denialReason).toBe("GLOBAL_DISABLED");
  });
});

describe("resolveEffectiveMcpEntitlements — subscription state", () => {
  it("active subscription with entitled plan resolves available", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) return [subscriptionRow()];
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) return [];
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(true);
    expect(result.planId).toBe("pro");
    expect(result.entitlements.maxConnections).toBe(10);
  });

  it("trialing subscription keeps plan entitlements", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) {
        return [subscriptionRow({ status: "trialing" })];
      }
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) return [];
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(true);
  });

  it("past_due subscription downgrades to the free plan's entitlements", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) {
        return [subscriptionRow({ status: "past_due" })];
      }
      if (sql.includes("WHERE id = 'free'")) {
        return [{ plan_name: "Free", mcp_entitlements: FREE_DISABLED }];
      }
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) return [];
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(false);
    expect(result.denialReason).toBe("PLAN_NOT_ENTITLED");
    // Keeps the subscribed plan identity for diagnostics.
    expect(result.planId).toBe("pro");
    expect(result.subscriptionStatus).toBe("past_due");
  });

  it("expired period (active status, past end date) downgrades to free", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) {
        return [
          subscriptionRow({ current_period_end: "2020-01-01T00:00:00Z" }),
        ];
      }
      if (sql.includes("WHERE id = 'free'")) {
        return [{ plan_name: "Free", mcp_entitlements: FREE_DISABLED }];
      }
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) return [];
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(false);
    expect(result.denialReason).toBe("PLAN_NOT_ENTITLED");
  });

  it("cancelled subscription downgrades to free", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) {
        return [subscriptionRow({ status: "cancelled" })];
      }
      if (sql.includes("WHERE id = 'free'")) {
        return [{ plan_name: "Free", mcp_entitlements: FREE_DISABLED }];
      }
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) return [];
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(false);
  });

  it("no subscription row resolves the free plan", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) return [];
      if (sql.includes("WHERE id = 'free'")) {
        return [{ plan_name: "Free", mcp_entitlements: FREE_DISABLED }];
      }
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) return [];
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(false);
    expect(result.planId).toBe("free");
    expect(result.subscriptionStatus).toBe("none");
  });

  it("invalid stored plan entitlement fails closed to disabled", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) {
        return [
          subscriptionRow({
            mcp_entitlements: { ...PRO_PLAN_ENTITLEMENTS, maxConnections: -50 },
          }),
        ];
      }
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) return [];
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(false);
  });
});

describe("resolveEffectiveMcpEntitlements — organization overrides", () => {
  it("applies a valid unexpired override and marks the source", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) return [subscriptionRow()];
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) {
        return [
          {
            entitlements: { maxConnections: 25, toolCallsPerMinute: 300 },
            reason: "enterprise pilot",
            expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          },
        ];
      }
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.available).toBe(true);
    expect(result.entitlements.maxConnections).toBe(25);
    expect(result.entitlements.toolCallsPerMinute).toBe(300);
    expect(result.sources.maxConnections).toBe("override");
    expect(result.override?.active).toBe(true);
  });

  it("ignores an expired override (reverts to plan defaults)", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) return [subscriptionRow()];
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) {
        return [
          {
            entitlements: { maxConnections: 25 },
            reason: "expired pilot",
            expires_at: new Date(Date.now() - 86_400_000).toISOString(),
          },
        ];
      }
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.entitlements.maxConnections).toBe(10);
    expect(result.override?.active).toBe(false);
    expect(result.override?.expired).toBe(true);
  });

  it("clamps override limits to the system safety maxima", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) return [subscriptionRow()];
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) {
        return [
          {
            entitlements: { maxConnections: 1_000_000 },
            reason: "runaway override",
            expires_at: null,
          },
        ];
      }
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.entitlements.maxConnections).toBe(
      MCP_SYSTEM_SAFETY_MAXIMA.maxConnections,
    );
  });

  it("ignores an override that fails schema validation", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM org_subscriptions")) return [subscriptionRow()];
      if (sql.includes("FROM mcp_platform_settings")) return [GLOBAL_ON];
      if (sql.includes("FROM org_mcp_overrides")) {
        return [
          {
            entitlements: { enabled: true, customEndpoints: true },
            reason: "malformed override",
            expires_at: null,
          },
        ];
      }
      return [];
    });
    const result = await resolveEffectiveMcpEntitlements("org-1");
    expect(result.entitlements.maxConnections).toBe(10);
    expect(result.sources.maxConnections).toBeUndefined();
  });
});

import { MCP_SYSTEM_SAFETY_MAXIMA } from "./entitlements";
