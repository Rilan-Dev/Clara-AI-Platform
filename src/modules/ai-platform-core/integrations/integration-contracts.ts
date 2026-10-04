/**
 * Phase I-1 — host-neutral integrations contracts.
 *
 * These contracts intentionally stop at trust boundaries. They describe
 * catalog, connection, credential, OAuth, action execution, egress, and
 * Unified Tool Runtime bridges without implementing persistence, OAuth
 * transport, outbound HTTP, or provider SDK behavior.
 *
 * Security invariant: no contract in this module carries decrypted
 * credentials as model-visible metadata or tool arguments. Credential access
 * is an explicit host adapter operation.
 */
import type { z } from "zod";
import type { PlatformExecutionContext, SurfaceKind } from "../contracts";
import type { ToolDefinition } from "../tool-contracts";

export type IntegrationId = string;
export type IntegrationActionName = string;

export type IntegrationCategory =
  | "communication"
  | "productivity"
  | "developer_tools"
  | "crm_sales"
  | "marketing"
  | "finance_payments"
  | "ai_ml"
  | "data_storage"
  | "social_media"
  | "ecommerce"
  | "project_management"
  | "customer_support"
  | "hr"
  | "analytics"
  | "content"
  | "automation"
  | "other";

export type IntegrationAuthType =
  | "oauth2"
  | "secret_text"
  | "custom_auth"
  | "basic_auth"
  | "none";

export type IntegrationConnectionScope = "tenant" | "project" | "user";

export interface IntegrationDescriptor {
  readonly id: IntegrationId;
  readonly displayName: string;
  readonly description: string;
  readonly category: IntegrationCategory;
  readonly tags: readonly string[];
  readonly authType: IntegrationAuthType;
  readonly actions: readonly IntegrationActionName[];
  readonly supportsOAuth: boolean;
}

export interface IntegrationConnectionRef {
  readonly id: string;
  readonly integrationId: IntegrationId;
  readonly scope: IntegrationConnectionScope;
  readonly projectId?: string;
  readonly userId?: string;
  readonly status: "active" | "error" | "expired" | "revoked";
  readonly displayName?: string;
  /** Provider/account identifiers only; decrypted credentials are never modeled here. */
  readonly providerAccountId?: string;
}

/** Deliberately excludes decrypted credential material. */
export interface IntegrationCredentialHandle {
  readonly connectionId: string;
  readonly integrationId: IntegrationId;
  readonly scope: IntegrationConnectionScope;
}

export interface IntegrationOAuthConfig {
  readonly authorizationUrl: string;
  readonly tokenUrl: string;
  readonly scopes: readonly string[];
  readonly pkce?: "S256";
}

export interface IntegrationActionDefinition {
  readonly integrationId: IntegrationId;
  readonly name: IntegrationActionName;
  readonly displayName: string;
  readonly description: string;
  readonly inputSchema: z.ZodType;
  readonly allowedSurfaces: readonly SurfaceKind[];
  readonly requiresConnection: boolean;
}

export interface IntegrationExecutionRequest {
  readonly context: PlatformExecutionContext;
  readonly integrationId: IntegrationId;
  readonly actionName: IntegrationActionName;
  readonly input: unknown;
  readonly connection: IntegrationCredentialHandle | null;
}

export interface IntegrationExecutionResult {
  readonly ok: boolean;
  readonly output?: unknown;
  readonly error?: {
    readonly code:
      | "UNKNOWN_INTEGRATION"
      | "UNKNOWN_ACTION"
      | "CONNECTION_REQUIRED"
      | "CONNECTION_UNAVAILABLE"
      | "INVALID_ARGUMENTS"
      | "UNAUTHORIZED"
      | "EGRESS_DENIED"
      | "EXECUTION_FAILED";
    readonly message: string;
  };
}

export interface IntegrationCatalogAdapter {
  list(context: PlatformExecutionContext): Promise<readonly IntegrationDescriptor[]>;
  get(context: PlatformExecutionContext, integrationId: IntegrationId): Promise<IntegrationDescriptor | null>;
}

export interface IntegrationConnectionStoreAdapter {
  list(context: PlatformExecutionContext, integrationId?: IntegrationId): Promise<readonly IntegrationConnectionRef[]>;
  get(context: PlatformExecutionContext, connectionId: string): Promise<IntegrationConnectionRef | null>;
  connect(
    context: PlatformExecutionContext,
    integrationId: IntegrationId,
    configuration: Readonly<Record<string, unknown>>,
  ): Promise<IntegrationConnectionRef>;
  disconnect(
    context: PlatformExecutionContext,
    connectionId: string,
  ): Promise<void>;
}

export interface IntegrationCredentialVaultAdapter {
  /**
   * Returns an opaque handle only. Decryption/execution must remain inside a
   * host-controlled action boundary; raw credentials never enter the generic
   * platform context, tool definition, or telemetry contract.
   */
  getHandle(
    context: PlatformExecutionContext,
    connectionId: string,
  ): Promise<IntegrationCredentialHandle | null>;
}

export interface IntegrationOAuthAdapter {
  buildAuthorizationUrl(
    context: PlatformExecutionContext,
    integrationId: IntegrationId,
    config: IntegrationOAuthConfig,
  ): Promise<string>;

  exchangeCallback(
    context: PlatformExecutionContext,
    integrationId: IntegrationId,
    callback: IntegrationOAuthCallback,
  ): Promise<IntegrationConnectionRef>;
}

export interface IntegrationOAuthCallback {
  readonly code: string;
  readonly state: string;
  readonly error?: string;
  readonly errorDescription?: string;
}

export interface IntegrationEgressPolicyAdapter {
  authorize(
    context: PlatformExecutionContext,
    request: {
      readonly integrationId: IntegrationId;
      readonly actionName: IntegrationActionName;
      readonly url: string;
      readonly method: string;
    },
  ): Promise<{ readonly allowed: boolean; readonly reason?: string }>;
}

export interface IntegrationActionRunnerAdapter {
  listActions(
    context: PlatformExecutionContext,
    integrationId: IntegrationId,
  ): Promise<readonly IntegrationActionDefinition[]>;

  invoke(
    request: IntegrationExecutionRequest,
  ): Promise<IntegrationExecutionResult>;
}

/**
 * Host-neutral bridge contract. A concrete implementation must convert an
 * integration action into the Phase 7 ToolDefinition/Unified Tool Runtime
 * rather than creating a second tool executor.
 */
export interface IntegrationToolBridgeAdapter {
  listToolDefinitions(
    context: PlatformExecutionContext,
    integrationId: IntegrationId,
  ): Promise<readonly ToolDefinition[]>;

  invokeThroughRuntime(
    request: IntegrationExecutionRequest,
  ): Promise<IntegrationExecutionResult>;
}

export interface IntegrationRuntimeAdapters {
  readonly catalog: IntegrationCatalogAdapter;
  readonly connections: IntegrationConnectionStoreAdapter;
  readonly credentials: IntegrationCredentialVaultAdapter;
  readonly oauth: IntegrationOAuthAdapter;
  readonly egress: IntegrationEgressPolicyAdapter;
  readonly actions: IntegrationActionRunnerAdapter;
  readonly toolBridge: IntegrationToolBridgeAdapter;
}
