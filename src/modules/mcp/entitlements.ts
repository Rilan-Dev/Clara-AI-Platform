/**
 * src/modules/mcp/entitlements.ts
 *
 * The single authoritative MCP entitlement system for Clara AI Platform.
 *
 * Effective entitlement =
 *   global security policy ∩ plan entitlements ∩ valid subscription state
 *   ∩ permitted organization overrides
 *
 * Storage model (migration 069):
 *   - subscription_plans.mcp_entitlements / subscription_plan_versions.mcp_entitlements
 *     (JSONB, validated by this module's Zod schema before every write)
 *   - mcp_platform_settings (singleton): global enablement, emergency
 *     disablement, security policy, system safety maxima
 *   - org_mcp_overrides (optional, per-org, expiring, audited)
 *
 * Numeric semantics (documented, centralized):
 *   - -1 means unlimited (matches the existing plan-guard convention).
 *   - 0 means "disabled" for max* limits ONLY when `enabled` is true; a limit
 *     of 0 with enabled=true blocks new usage without deleting anything.
 *   - Negative values other than -1 are invalid and rejected.
 *
 * Only capabilities the runtime actually enforces are representable here.
 * Auth methods and transports are constrained to implemented values.
 */

import { z } from "zod";
import { query } from "@/lib/db";
import type { SqlExecutor } from "@/lib/plan-guard";
import { NextResponse } from "next/server";

// ─── Implemented capability constants ────────────────────────────────────────

/** Auth methods the MCP client actually implements today. */
export const IMPLEMENTED_MCP_AUTH_METHODS = [
  "none",
  "bearer_token",
  "basic_auth",
  "api_key_header",
] as const;

/** Transports the MCP client actually implements today (Streamable HTTP). */
export const IMPLEMENTED_MCP_TRANSPORTS = ["streamable_http"] as const;

/** Usage policies the metering system actually enforces today. */
export const IMPLEMENTED_MCP_USAGE_POLICIES = ["deny", "meter"] as const;

export type McpAuthMethod = (typeof IMPLEMENTED_MCP_AUTH_METHODS)[number];
export type McpTransport = (typeof IMPLEMENTED_MCP_TRANSPORTS)[number];
export type McpUsagePolicy = (typeof IMPLEMENTED_MCP_USAGE_POLICIES)[number];

/**
 * System safety maxima — independent of commercial plan limits. A plan can
 * never configure a limit above these values, so even an "unlimited" commercial
 * tier remains inside platform-safe bounds.
 */
export const MCP_SYSTEM_SAFETY_MAXIMA = {
  maxConnections: 500,
  maxToolsPerConnection: 500,
  maxAgentAssignments: 10_000,
  toolCallsPerPeriod: 10_000_000,
  toolCallsPerMinute: 10_000,
} as const satisfies Record<McpNumericLimitKey, number>;

export type McpNumericLimitKey =
  | "maxConnections"
  | "maxToolsPerConnection"
  | "maxAgentAssignments"
  | "toolCallsPerPeriod"
  | "toolCallsPerMinute";

// ─── Entitlement schema ──────────────────────────────────────────────────────

const limitSchema = z
  .number({ message: "Limit must be a number" })
  .int("Limit must be a whole number of calls/items")
  .refine((v) => v === -1 || v >= 0, {
    message: "Limit must be -1 (unlimited) or a non-negative integer",
  });

export const mcpEntitlementsSchema = z.object({
  /** MCP feature switch for the plan. */
  enabled: z.boolean(),
  /** Organization-owned custom MCP endpoints allowed. */
  customEndpoints: z.boolean(),
  /** Maximum connections per organisation. -1 = unlimited, 0 = none. */
  maxConnections: limitSchema,
  /** Maximum discovered/approved tools per connection. */
  maxToolsPerConnection: limitSchema,
  /** Maximum agent-to-tool assignments per organisation. */
  maxAgentAssignments: limitSchema,
  /** Maximum metered MCP invocations per billing period. */
  toolCallsPerPeriod: limitSchema,
  /** Rate limit: metered invocations per minute. */
  toolCallsPerMinute: limitSchema,
  /** Auth methods this plan permits (subset of implemented methods). */
  allowedAuthMethods: z
    .array(z.enum(IMPLEMENTED_MCP_AUTH_METHODS))
    .min(1, "At least one auth method must be permitted"),
  /** Transports this plan permits (subset of implemented transports). */
  allowedTransports: z
    .array(z.enum(IMPLEMENTED_MCP_TRANSPORTS))
    .min(1, "At least one transport must be permitted"),
  /** Access to the optional platform-provided MCP catalog. */
  platformCatalog: z.boolean(),
  /**
   * Private-network MCP connectivity. Requires an approved private-network
   * gateway architecture, which does not exist yet — always false and the UI
   * marks it unavailable.
   */
  privateNetwork: z.literal(false, {
    message: "Private-network MCP connectivity is not available on this deployment",
  }),
  /** Behaviour when the billing-period quota is exhausted. */
  usagePolicy: z.enum(IMPLEMENTED_MCP_USAGE_POLICIES),
  /** Optional internal administration notes. */
  notes: z.string().max(2_000).default(""),
});

export type McpEntitlements = z.infer<typeof mcpEntitlementsSchema>;

/** Plan entitlement defaults: fully disabled (fail closed). */
export const MCP_ENTITLEMENTS_DISABLED: McpEntitlements = Object.freeze({
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
} satisfies McpEntitlements);

/**
 * Suggested entitlements per seeded plan tier, used only by the migration's
 * initial reference data and as UI "configure like <plan>" convenience.
 * Platform admins remain the source of truth after that.
 */
export const MCP_SEED_PLAN_ENTITLEMENTS: Record<string, McpEntitlements> = Object.freeze({
  free: Object.freeze({ ...MCP_ENTITLEMENTS_DISABLED } satisfies McpEntitlements),
  starter: Object.freeze({
    enabled: true,
    customEndpoints: true,
    maxConnections: 2,
    maxToolsPerConnection: 25,
    maxAgentAssignments: 50,
    toolCallsPerPeriod: 5_000,
    toolCallsPerMinute: 30,
    allowedAuthMethods: ["none", "bearer_token", "basic_auth", "api_key_header"],
    allowedTransports: ["streamable_http"],
    platformCatalog: true,
    privateNetwork: false,
    usagePolicy: "deny",
    notes: "",
  } satisfies McpEntitlements),
  pro: Object.freeze({
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
    usagePolicy: "meter",
    notes: "",
  } satisfies McpEntitlements),
  enterprise: Object.freeze({
    enabled: true,
    customEndpoints: true,
    maxConnections: -1,
    maxToolsPerConnection: -1,
    maxAgentAssignments: -1,
    toolCallsPerPeriod: -1,
    toolCallsPerMinute: 600,
    allowedAuthMethods: ["none", "bearer_token", "basic_auth", "api_key_header"],
    allowedTransports: ["streamable_http"],
    platformCatalog: true,
    privateNetwork: false,
    // Unlimited quota never denies, so overage metering is meaningless —
    // "deny" with -1 is the coherent unlimited representation.
    usagePolicy: "deny",
    notes: "",
  } satisfies McpEntitlements),
});

// ─── Global platform settings ────────────────────────────────────────────────

export const mcpGlobalSecurityPolicySchema = z.object({
  /** MCP endpoints must use HTTPS ( Streamable HTTP). */
  requireHttps: z.boolean(),
  /** Block private/loopback/link-local/metadata destinations (SSRF). */
  blockPrivateNetworks: z.boolean(),
  /** Hard ceiling on redirect hops (0 = no redirects permitted). */
  maxRedirects: z.number().int().min(0).max(5),
  /** Bounded request timeout for handshake/calls. */
  requestTimeoutMs: z.number().int().min(1_000).max(120_000),
  /** TLS certificate verification must stay enabled. */
  tlsVerify: z.literal(true, {
    message: "TLS verification cannot be disabled for MCP connections",
  }),
});

export type McpGlobalSecurityPolicy = z.infer<typeof mcpGlobalSecurityPolicySchema>;

export const MCP_GLOBAL_SECURITY_POLICY_DEFAULT: McpGlobalSecurityPolicy = Object.freeze({
  requireHttps: true,
  blockPrivateNetworks: true,
  maxRedirects: 0,
  requestTimeoutMs: 15_000,
  tlsVerify: true,
});

export const mcpPlatformSettingsSchema = z.object({
  /** Global MCP enablement (rollout switch). */
  mcpEnabled: z.boolean(),
  /** Emergency kill switch — overrides every plan-level grant. */
  emergencyDisabled: z.boolean(),
  securityPolicy: mcpGlobalSecurityPolicySchema,
  /** Optional platform-provided MCP catalog visibility. */
  platformCatalogEnabled: z.boolean(),
  /** Optional Clara-hosted MCP services. */
  claraHostedEnabled: z.boolean(),
});

export type McpPlatformSettings = z.infer<typeof mcpPlatformSettingsSchema>;

export const MCP_PLATFORM_SETTINGS_DEFAULT: McpPlatformSettings = Object.freeze({
  mcpEnabled: false,
  emergencyDisabled: false,
  securityPolicy: MCP_GLOBAL_SECURITY_POLICY_DEFAULT,
  platformCatalogEnabled: false,
  claraHostedEnabled: false,
});

// ─── Validation helpers ──────────────────────────────────────────────────────

export type McpEntitlementValidation =
  | { ok: true; value: McpEntitlements }
  | { ok: false; errors: string[] };

/**
 * Validate raw (client-supplied or stored) entitlement data. Enforces:
 *   - schema conformance (types, enum values, no unknown auth/transport)
 *   - numeric semantics (-1 unlimited, else >= 0)
 *   - system safety maxima
 *   - coherence: a disabled plan cannot grant custom endpoints or catalog
 */
export function validateMcpEntitlements(raw: unknown): McpEntitlementValidation {
  const parsed = mcpEntitlementsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  const value = parsed.data;
  const errors: string[] = [];

  for (const key of Object.keys(MCP_SYSTEM_SAFETY_MAXIMA) as McpNumericLimitKey[]) {
    const configured = value[key];
    if (configured !== -1 && configured > MCP_SYSTEM_SAFETY_MAXIMA[key]) {
      errors.push(
        `${key}: ${configured} exceeds the platform safety maximum of ${MCP_SYSTEM_SAFETY_MAXIMA[key]}`,
      );
    }
  }

  if (!value.enabled) {
    if (value.customEndpoints) {
      errors.push("customEndpoints cannot be allowed while the MCP feature is disabled for this plan");
    }
    if (value.platformCatalog) {
      errors.push("platformCatalog cannot be allowed while the MCP feature is disabled for this plan");
    }
  }

  if (value.enabled && value.customEndpoints && value.maxConnections === 0) {
    errors.push(
      "maxConnections of 0 with custom endpoints enabled would deny every new connection — disable the MCP feature instead",
    );
  }

  if (value.usagePolicy === "meter" && value.toolCallsPerPeriod === -1) {
    errors.push("usagePolicy 'meter' requires a finite toolCallsPerPeriod quota to meter against");
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/** Parse stored JSONB without trusting it; falls back to disabled. */
export function parseStoredEntitlements(
  raw: unknown,
): { entitlements: McpEntitlements; valid: boolean } {
  if (raw == null) return { entitlements: MCP_ENTITLEMENTS_DISABLED, valid: true };
  const result = validateMcpEntitlements(raw);
  if (result.ok) return { entitlements: result.value, valid: true };
  // Stored data is validated on write; invalid stored data fails closed to
  // the disabled entitlement instead of throwing, so one bad row cannot take
  // down every MCP operation platform-wide.
  return { entitlements: MCP_ENTITLEMENTS_DISABLED, valid: false };
}

// ─── Organization overrides ──────────────────────────────────────────────────

export const mcpOverrideSchema = z.object({
  /** Only these keys may be overridden. `enabled` itself is never overridable:
   *  it is plan-level only, so an override can never switch MCP on for a plan
   *  that does not include it. */
  maxConnections: limitSchema.optional(),
  maxToolsPerConnection: limitSchema.optional(),
  maxAgentAssignments: limitSchema.optional(),
  toolCallsPerPeriod: limitSchema.optional(),
  toolCallsPerMinute: limitSchema.optional(),
  platformCatalog: z.boolean().optional(),
});

export type McpOverrideInput = z.infer<typeof mcpOverrideSchema>;

export const MCP_OVERRIDE_KEYS = [
  "maxConnections",
  "maxToolsPerConnection",
  "maxAgentAssignments",
  "toolCallsPerPeriod",
  "toolCallsPerMinute",
  "platformCatalog",
] as const satisfies readonly (keyof McpOverrideInput)[];

// ─── Effective entitlement resolution ────────────────────────────────────────

/** Subscription states that keep the subscribed plan's entitlements. */
const ENTITLED_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export type McpDenialReason =
  | "GLOBAL_DISABLED"
  | "EMERGENCY_DISABLED"
  | "PLAN_NOT_ENTITLED"
  | "SUBSCRIPTION_NOT_ENTITLED"
  | "ENTITLEMENT_RESOLUTION_FAILED";

export type EffectiveMcpEntitlements = {
  /** Whether any MCP capability is available to this organisation. */
  available: boolean;
  /** Fail-closed denial reason when `available` is false. */
  denialReason: McpDenialReason | null;
  /** Effective entitlement after plan ∩ policy ∩ override intersection. */
  entitlements: McpEntitlements;
  /** Where each effective value came from (plan default or override). */
  sources: Partial<Record<keyof McpEntitlements, "plan" | "override">>;
  planId: string;
  planName: string;
  subscriptionStatus: string;
  /** Raw platform settings snapshot used during resolution. */
  globalSettings: McpPlatformSettings;
  override: {
    active: boolean;
    reason: string | null;
    expiresAt: string | null;
    expired: boolean;
  } | null;
  /** Billing-period anchor (subscription current_period_start date). */
  periodStart: string;
};

type SubscriptionRow = {
  plan_id: string;
  plan_name: string;
  status: string;
  current_period_start: Date | string;
  current_period_end: Date | string | null;
  mcp_entitlements: unknown;
};

type OverrideRow = {
  entitlements: unknown;
  reason: string;
  expires_at: Date | string | null;
};

type SettingsRow = {
  mcp_enabled: boolean;
  emergency_disabled: boolean;
  security_policy: unknown;
  platform_catalog_enabled: boolean;
  clara_hosted_enabled: boolean;
};

function parseGlobalSettings(raw: SettingsRow | undefined): McpPlatformSettings {
  if (!raw) return MCP_PLATFORM_SETTINGS_DEFAULT;
  const policy = mcpGlobalSecurityPolicySchema.safeParse(raw.security_policy ?? {});
  return {
    mcpEnabled: raw.mcp_enabled === true,
    emergencyDisabled: raw.emergency_disabled === true,
    securityPolicy: policy.success
      ? policy.data
      : MCP_GLOBAL_SECURITY_POLICY_DEFAULT,
    platformCatalogEnabled: raw.platform_catalog_enabled === true,
    claraHostedEnabled: raw.clara_hosted_enabled === true,
  };
}

/**
 * The single authoritative server-side entitlement resolver.
 *
 * Resolution order:
 *   1. Global platform settings (enablement + emergency switch).
 *   2. Subscription state (mirrors plan-guard semantics: only active/trialing
 *      with a non-expired period keeps plan entitlements; anything else
 *      resolves to the free plan's entitlements — failing closed when free
 *      does not include MCP).
 *   3. Plan MCP entitlements (validated, fail-closed to disabled).
 *   4. Valid, unexpired organization overrides (limit increases/decreases
 *      only, never capability switches).
 *
 * The resolver never trusts client input — it reads authoritative rows only.
 */
export async function resolveEffectiveMcpEntitlements(
  orgId: string,
  via?: SqlExecutor,
): Promise<EffectiveMcpEntitlements> {
  const run = via ?? { query };
  const today = new Date().toISOString().slice(0, 10);

  const [settingsRows, subRows, overrideRows] = await Promise.all([
    run.query<SettingsRow>(
      `SELECT mcp_enabled, emergency_disabled, security_policy,
              platform_catalog_enabled, clara_hosted_enabled
         FROM mcp_platform_settings
        WHERE id = TRUE
        LIMIT 1`,
    ),
    run.query<SubscriptionRow>(
      `SELECT os.plan_id,
              COALESCE(pv.name, sp.name) AS plan_name,
              os.status,
              os.current_period_start,
              os.current_period_end,
              sp.mcp_entitlements
         FROM org_subscriptions os
         JOIN subscription_plans sp ON sp.id = os.plan_id
         LEFT JOIN subscription_plan_versions pv ON pv.id = os.plan_version_id
        WHERE os.org_id = $1
        ORDER BY os.updated_at DESC
        LIMIT 1`,
      [orgId],
    ),
    run.query<OverrideRow>(
      `SELECT entitlements, reason, expires_at
         FROM org_mcp_overrides
        WHERE org_id = $1
        LIMIT 1`,
      [orgId],
    ),
  ]);

  const globalSettings = parseGlobalSettings(settingsRows[0]);

  if (!globalSettings.mcpEnabled) {
    return {
      available: false,
      denialReason: "GLOBAL_DISABLED",
      entitlements: MCP_ENTITLEMENTS_DISABLED,
      sources: {},
      planId: "none",
      planName: "None",
      subscriptionStatus: "none",
      globalSettings,
      override: null,
      periodStart: today,
    };
  }
  if (globalSettings.emergencyDisabled) {
    return {
      available: false,
      denialReason: "EMERGENCY_DISABLED",
      entitlements: MCP_ENTITLEMENTS_DISABLED,
      sources: {},
      planId: "none",
      planName: "None",
      subscriptionStatus: "none",
      globalSettings,
      override: null,
      periodStart: today,
    };
  }

  const sub = subRows[0];
  let planId: string;
  let planName: string;
  let subscriptionStatus: string;
  let entitlements: McpEntitlements;
  let periodStart: string;

  if (!sub) {
    // No subscription row → free plan entitlements (fail closed when free
    // does not include MCP).
    const freeRows = await run.query<{ plan_name: string; mcp_entitlements: unknown }>(
      `SELECT name AS plan_name, mcp_entitlements
         FROM subscription_plans
        WHERE id = 'free'
        LIMIT 1`,
    );
    planId = "free";
    planName = freeRows[0]?.plan_name ?? "Free";
    subscriptionStatus = "none";
    entitlements = parseStoredEntitlements(freeRows[0]?.mcp_entitlements).entitlements;
    periodStart = today;
  } else {
    const end = sub.current_period_end
      ? new Date(sub.current_period_end).getTime()
      : null;
    const expired = end !== null && end < Date.now();
    const entitled = ENTITLED_SUBSCRIPTION_STATUSES.has(sub.status) && !expired;
    if (entitled) {
      planId = sub.plan_id;
      planName = sub.plan_name;
      subscriptionStatus = sub.status;
      entitlements = parseStoredEntitlements(sub.mcp_entitlements).entitlements;
      periodStart = new Date(sub.current_period_start ?? Date.now())
        .toISOString()
        .slice(0, 10);
    } else {
      // Not in good standing → free-plan entitlements, keeping the subscribed
      // plan identity for diagnostics (mirrors plan-guard downgrade behavior).
      const freeRows = await run.query<{ plan_name: string; mcp_entitlements: unknown }>(
        `SELECT name AS plan_name, mcp_entitlements
           FROM subscription_plans
          WHERE id = 'free'
          LIMIT 1`,
      );
      planId = sub.plan_id;
      planName = sub.plan_name;
      subscriptionStatus = sub.status;
      entitlements = parseStoredEntitlements(freeRows[0]?.mcp_entitlements).entitlements;
      periodStart = today;
    }
  }

  if (!entitlements.enabled) {
    return {
      available: false,
      denialReason: sub ? "PLAN_NOT_ENTITLED" : "PLAN_NOT_ENTITLED",
      entitlements,
      sources: {},
      planId,
      planName,
      subscriptionStatus,
      globalSettings,
      override: null,
      periodStart,
    };
  }

  // Apply a valid, unexpired organization override (limits only).
  const sources: Partial<Record<keyof McpEntitlements, "plan" | "override">> = {};
  let overrideInfo: EffectiveMcpEntitlements["override"] = null;
  const rawOverride = overrideRows[0];
  if (rawOverride) {
    const expiresAt = rawOverride.expires_at
      ? new Date(rawOverride.expires_at).getTime()
      : null;
    const expiredOverride = expiresAt !== null && expiresAt < Date.now();
    overrideInfo = {
      active: !expiredOverride,
      reason: rawOverride.reason ?? null,
      expiresAt: rawOverride.expires_at
        ? new Date(rawOverride.expires_at).toISOString()
        : null,
      expired: expiredOverride,
    };
    if (!expiredOverride) {
      const parsed = mcpOverrideSchema.safeParse(rawOverride.entitlements ?? {});
      if (parsed.success) {
        const patch = parsed.data;
        for (const key of MCP_OVERRIDE_KEYS) {
          if (patch[key] !== undefined) {
            (entitlements as Record<string, unknown>)[key] = patch[key];
            sources[key] = "override";
          }
        }
        // System safety maxima still apply above any override.
        if (entitlements.maxConnections !== -1) {
          entitlements.maxConnections = Math.min(
            entitlements.maxConnections,
            MCP_SYSTEM_SAFETY_MAXIMA.maxConnections,
          );
        }
        if (entitlements.maxToolsPerConnection !== -1) {
          entitlements.maxToolsPerConnection = Math.min(
            entitlements.maxToolsPerConnection,
            MCP_SYSTEM_SAFETY_MAXIMA.maxToolsPerConnection,
          );
        }
        if (entitlements.maxAgentAssignments !== -1) {
          entitlements.maxAgentAssignments = Math.min(
            entitlements.maxAgentAssignments,
            MCP_SYSTEM_SAFETY_MAXIMA.maxAgentAssignments,
          );
        }
        if (entitlements.toolCallsPerPeriod !== -1) {
          entitlements.toolCallsPerPeriod = Math.min(
            entitlements.toolCallsPerPeriod,
            MCP_SYSTEM_SAFETY_MAXIMA.toolCallsPerPeriod,
          );
        }
        if (entitlements.toolCallsPerMinute !== -1) {
          entitlements.toolCallsPerMinute = Math.min(
            entitlements.toolCallsPerMinute,
            MCP_SYSTEM_SAFETY_MAXIMA.toolCallsPerMinute,
          );
        }
      }
    }
  }

  // The global security policy always wins over any weaker configuration:
  // a plan/override can never disable HTTPS enforcement or private-network
  // blocking, because those keys are not plan-configurable at all.

  return {
    available: entitlements.enabled,
    denialReason: null,
    entitlements,
    sources,
    planId,
    planName,
    subscriptionStatus,
    globalSettings,
    override: overrideInfo,
    periodStart,
  };
}

// ─── Shared error responses ──────────────────────────────────────────────────

export const MCP_DENIAL_MESSAGES: Record<McpDenialReason, string> = {
  GLOBAL_DISABLED: "MCP is not currently enabled on this platform.",
  EMERGENCY_DISABLED: "MCP access is temporarily disabled by the platform administrator.",
  PLAN_NOT_ENTITLED: "Your plan does not include MCP capabilities.",
  SUBSCRIPTION_NOT_ENTITLED: "An active subscription with MCP entitlement is required.",
  ENTITLEMENT_RESOLUTION_FAILED: "MCP entitlement could not be verified. Try again shortly.",
};

export function mcpDenialResponse(reason: McpDenialReason, status = 403): NextResponse {
  return NextResponse.json(
    { error: MCP_DENIAL_MESSAGES[reason], code: reason },
    { status },
  );
}