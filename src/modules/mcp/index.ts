/**
 * src/modules/mcp/index.ts — public surface of the MCP module.
 *
 * Organization-owned MCP connections, entitlement resolution, metering and
 * audit. Consumers: org APIs, platform admin APIs, chat/realtime runtime.
 */

export {
  IMPLEMENTED_MCP_AUTH_METHODS,
  IMPLEMENTED_MCP_TRANSPORTS,
  IMPLEMENTED_MCP_USAGE_POLICIES,
  MCP_SYSTEM_SAFETY_MAXIMA,
  MCP_ENTITLEMENTS_DISABLED,
  MCP_SEED_PLAN_ENTITLEMENTS,
  MCP_GLOBAL_SECURITY_POLICY_DEFAULT,
  MCP_PLATFORM_SETTINGS_DEFAULT,
  MCP_DENIAL_MESSAGES,
  MCP_OVERRIDE_KEYS,
  mcpEntitlementsSchema,
  mcpGlobalSecurityPolicySchema,
  mcpPlatformSettingsSchema,
  mcpOverrideSchema,
  validateMcpEntitlements,
  parseStoredEntitlements,
  resolveEffectiveMcpEntitlements,
  mcpDenialResponse,
} from "./entitlements";
export type {
  McpAuthMethod,
  McpTransport,
  McpUsagePolicy,
  McpEntitlements,
  McpGlobalSecurityPolicy,
  McpPlatformSettings,
  McpOverrideInput,
  McpEntitlementValidation,
  McpDenialReason,
  EffectiveMcpEntitlements,
  McpNumericLimitKey,
} from "./entitlements";

export {
  McpClientError,
  mcpHandshake,
  mcpDiscoverTools,
  mcpInvokeTool,
  parseCredentials,
  MCP_AUTH_METHOD_FIELDS,
  MCP_PROTOCOL_VERSION,
} from "./client";
export type {
  McpCredentials,
  McpHandshakeResult,
  McpDiscoveredTool,
  McpInvocationResult,
  McpClientOptions,
} from "./client";

export {
  checkMcpQuotaAdmission,
  recordMcpUsage,
  getMcpUsageSummary,
  acquireOrgMcpLock,
  withMcpAdmission,
} from "./metering";
export type {
  MeteredSurface,
  QuotaCheck,
  MeterRecord,
  McpUsageSummary,
} from "./metering";

export {
  recordOrgMcpAudit,
  recordPlatformMcpAudit,
  listOrgMcpAudit,
} from "./audit";
export type {
  OrgMcpAuditAction,
  PlatformMcpAuditAction,
  OrgMcpAuditEntry,
} from "./audit";