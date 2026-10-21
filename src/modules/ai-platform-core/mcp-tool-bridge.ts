/**
 * Integrations Framework I-6 — bounded MCP Tool Runtime bridge.
 *
 * This module does not implement MCP transport. It accepts already-resolved
 * MCP tool capabilities from a host adapter and represents them as ordinary
 * Clara ToolDefinitions so execution remains inside the existing Unified
 * Tool Runtime.
 */
import { z } from "zod";
import { resolveFeatureAvailability, isPlatformFeatureEnabled } from "@/lib/feature-availability";
import { assertExecutionContext } from "./execution-context";
import type { PlatformExecutionContext, SurfaceKind } from "./contracts";
import type { ToolDefinition } from "./tool-contracts";
import { ToolExecutionError } from "./tool-contracts";
import {
  buildClaraToolAuthorizationAdapter,
  buildClaraToolMeteringHook,
} from "./clara-tools";
import {
  createToolRuntime,
  ToolRegistrationError,
  type ToolRuntime,
} from "./tool-registry";

export const MCP_TOOL_FLAG = "ENABLE_MCP";

const ALLOWED_MCP_SURFACES: readonly SurfaceKind[] = [
  "chat",
  "realtime",
  "embed",
];

export interface McpToolDescriptor {
  readonly serverId: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<unknown>;
  readonly inputSchemaJson?: Readonly<Record<string, unknown>>;
  readonly allowedSurfaces?: readonly SurfaceKind[];
}

export interface McpToolResolutionRequest {
  readonly serverId: string;
  readonly toolName: string;
  readonly context: PlatformExecutionContext;
}

export interface McpToolResolver {
  resolve(
    request: McpToolResolutionRequest,
  ): Promise<McpToolDescriptor | null>;
  invoke(
    descriptor: McpToolDescriptor,
    input: unknown,
    context: PlatformExecutionContext,
  ): Promise<unknown>;
}

export interface McpToolAllowlistEntry {
  readonly serverId: string;
  readonly toolName: string;
}

export interface McpToolBridgePolicy {
  /**
   * Coarse server boundary plus the authoritative server/tool pair allowlist.
   * A tool is allowed only when BOTH the server is allowed and the exact pair
   * is present; independent server/tool membership must never authorize a
   * cross-product pairing.
   */
  readonly allowedServers: readonly string[];
  readonly allowedToolPairs: readonly McpToolAllowlistEntry[];
  readonly requireUserId?: boolean;
}

function normalizeMcpToolName(serverId: string, toolName: string): string {
  const identity = `mcp_${serverId}_${toolName}`;
  const base = identity.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const suffix = simpleHash(identity);
  return `${base.slice(0, 55)}_${suffix}`;
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 8);
}

function isAllowed(
  descriptor: Pick<McpToolDescriptor, "serverId" | "name">,
  policy: McpToolBridgePolicy,
): boolean {
  return (
    policy.allowedServers.includes(descriptor.serverId) &&
    policy.allowedToolPairs.some(
      (entry) =>
        entry.serverId === descriptor.serverId &&
        entry.toolName === descriptor.name,
    )
  );
}

export function isMcpEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveFeatureAvailability(env).integrations && ["1", "true", "yes", "on"].includes(
    (env[MCP_TOOL_FLAG] ?? "").trim().toLowerCase(),
  );
}

export function mcpToolName(serverId: string, toolName: string): string {
  return normalizeMcpToolName(serverId, toolName);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertMcpPolicy(policy: McpToolBridgePolicy): void {
  if (
    policy === null ||
    typeof policy !== "object" ||
    !Array.isArray(policy.allowedServers) ||
    !Array.isArray(policy.allowedToolPairs)
  ) {
    throw new ToolExecutionError(
      "TENANT_SCOPE_VIOLATION",
      "MCP allowlist policy is malformed.",
    );
  }

  if (
    policy.requireUserId !== undefined &&
    typeof policy.requireUserId !== "boolean"
  ) {
    throw new ToolExecutionError(
      "TENANT_SCOPE_VIOLATION",
      "MCP requireUserId policy is malformed.",
    );
  }

  for (const serverId of policy.allowedServers) {
    if (!isNonEmptyString(serverId)) {
      throw new ToolExecutionError(
        "TENANT_SCOPE_VIOLATION",
        "MCP server allowlist is malformed.",
      );
    }
  }

  for (const entry of policy.allowedToolPairs) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !isNonEmptyString(entry.serverId) ||
      !isNonEmptyString(entry.toolName)
    ) {
      throw new ToolExecutionError(
        "TENANT_SCOPE_VIOLATION",
        "MCP tool-pair allowlist is malformed.",
      );
    }
  }
}

function snapshotMcpPolicy(policy: McpToolBridgePolicy): McpToolBridgePolicy {
  // Policy is supplied by a host and may be mutated while async resolution is
  // in flight. Bind an immutable copy before awaiting any untrusted resolver.
  return Object.freeze({
    allowedServers: Object.freeze([...policy.allowedServers]),
    allowedToolPairs: Object.freeze(
      policy.allowedToolPairs.map((entry) =>
        Object.freeze({ serverId: entry.serverId, toolName: entry.toolName }),
      ),
    ),
    requireUserId: policy.requireUserId ?? true,
  });
}

function assertMcpResolver(resolver: McpToolResolver): void {
  if (
    resolver === null ||
    typeof resolver !== "object" ||
    typeof resolver.resolve !== "function" ||
    typeof resolver.invoke !== "function"
  ) {
    throw new ToolExecutionError(
      "TENANT_SCOPE_VIOLATION",
      "MCP resolver is malformed.",
    );
  }
}

function assertMcpDescriptor(descriptor: McpToolDescriptor): void {
  if (
    descriptor === null ||
    typeof descriptor !== "object" ||
    !isNonEmptyString(descriptor.serverId) ||
    !isNonEmptyString(descriptor.name) ||
    typeof descriptor.description !== "string"
  ) {
    throw new ToolExecutionError(
      "TENANT_SCOPE_VIOLATION",
      "MCP tool descriptor is malformed.",
    );
  }

  if (
    descriptor.allowedSurfaces !== undefined &&
    !Array.isArray(descriptor.allowedSurfaces)
  ) {
    throw new ToolExecutionError(
      "UNAUTHORIZED_SURFACE",
      "MCP tool surface allowlist is malformed.",
    );
  }

  // The descriptor is host-adapter input, so do not rely on the TypeScript
  // Zod type alone. The public builder must never construct an executable
  // ToolDefinition around a runtime-invalid schema; Unified Tool Runtime
  // registration remains the final schema validation boundary.
  if (
    descriptor.inputSchema === null ||
    typeof descriptor.inputSchema !== "object" ||
    typeof descriptor.inputSchema.safeParse !== "function"
  ) {
    throw new ToolExecutionError(
      "INVALID_ARGUMENTS",
      "MCP tool input schema is malformed.",
    );
  }
}

export function buildMcpToolDefinition(
  descriptor: McpToolDescriptor,
  policy: McpToolBridgePolicy,
  resolver: McpToolResolver,
  boundContext: PlatformExecutionContext,
): ToolDefinition {
  assertExecutionContext(boundContext);
  assertMcpPolicy(policy);
  assertMcpDescriptor(descriptor);
  if (!isAllowed(descriptor, policy)) {
    throw new ToolExecutionError(
      "TENANT_SCOPE_VIOLATION",
      `MCP tool is not allowlisted: ${descriptor.serverId}/${descriptor.name}`,
    );
  }

  const allowedSurfaces =
    descriptor.allowedSurfaces === undefined
      ? [...ALLOWED_MCP_SURFACES]
      : [...descriptor.allowedSurfaces];

  if (
    allowedSurfaces.length === 0 ||
    allowedSurfaces.some(
      (surface) => !ALLOWED_MCP_SURFACES.includes(surface),
    )
  ) {
    throw new ToolExecutionError(
      "UNAUTHORIZED_SURFACE",
      `MCP tool has no allowed Clara surface: ${descriptor.serverId}/${descriptor.name}`,
    );
  }

  assertMcpResolver(resolver);

  // Snapshot every policy/identity value used after registration. TypeScript
  // readonly does not make caller-owned arrays immutable at runtime, and the
  // resolver descriptor is also an external object. A live closure over either
  // would let post-registration mutation widen or redirect the capability.
  // Execution contexts are provenance-verified and immutable. Bind the
  // exact context object rather than reconstructing an equivalent-looking
  // value, so correlation/metadata and any future context fields cannot drift
  // outside the fields currently enumerated by this bridge.
  const boundResolutionContext = boundContext;
  const boundInvoke = resolver.invoke.bind(resolver);

  const boundPolicy = snapshotMcpPolicy(policy);
  const boundDescriptor: McpToolDescriptor = Object.freeze({
    ...descriptor,
    allowedSurfaces: Object.freeze([...allowedSurfaces]),
  });

  return {
    name: mcpToolName(boundDescriptor.serverId, boundDescriptor.name),
    description:
      boundDescriptor.description ||
      `Invoke MCP tool ${boundDescriptor.name} from ${boundDescriptor.serverId}.`,
    inputSchema: boundDescriptor.inputSchema,
    authorization: {
      allowedSurfaces: Object.freeze([...allowedSurfaces]),
      requiredPermission: null,
      requiredCapability: null,
      requireUserId: boundPolicy.requireUserId ?? true,
      requireSessionId: false,
    },
    async execute(input, context) {
      if (!isPlatformFeatureEnabled("integrations")) {
        throw new ToolExecutionError("TENANT_SCOPE_VIOLATION", "MCP is disabled in this environment.");
      }
      assertExecutionContext(context);
      if (!isAllowed(boundDescriptor, boundPolicy)) {
        throw new ToolExecutionError(
          "TENANT_SCOPE_VIOLATION",
          "MCP tool is no longer allowlisted.",
        );
      }
      if (context !== boundResolutionContext) {
        throw new ToolExecutionError(
          "TENANT_SCOPE_VIOLATION",
          "MCP tool execution context does not match the resolution context.",
        );
      }
      return boundInvoke(boundDescriptor, input, context);
    },
  };
}

export async function resolveMcpToolDefinition(
  request: McpToolResolutionRequest,
  policy: McpToolBridgePolicy,
  resolver: McpToolResolver,
): Promise<ToolDefinition | null> {
  if (!isPlatformFeatureEnabled("integrations")) return null;
  assertExecutionContext(request.context);
  let boundPolicy: McpToolBridgePolicy;
  try {
    assertMcpResolver(resolver);
    assertMcpPolicy(policy);
    boundPolicy = snapshotMcpPolicy(policy);
  } catch {
    return null;
  }
  if (!isAllowed(
    { serverId: request.serverId, name: request.toolName },
    boundPolicy,
  )) {
    return null;
  }

  // Snapshot the authorization inputs before invoking the external
  // resolver. TypeScript readonly is compile-time only; a resolver receives a
  // normal object at runtime and must never be able to rewrite the identity
  // or tenant context that the pre-resolution allowlist check authorized.
  const requestedServerId = request.serverId;
  const requestedToolName = request.toolName;
  const requestedContext = request.context;
  const boundResolutionRequest: McpToolResolutionRequest = Object.freeze({
    serverId: requestedServerId,
    toolName: requestedToolName,
    context: requestedContext,
  });

  let descriptor: McpToolDescriptor | null;
  try {
    descriptor = await resolver.resolve(boundResolutionRequest);
  } catch {
    // Resolver availability is an infrastructure boundary. Discovery must
    // fail closed rather than leak provider/transport errors or construct a
    // capability from an unavailable adapter.
    return null;
  }
  if (!descriptor) return null;

  // The resolver receives a frozen request snapshot rather than the
  // caller-owned request object. This makes the readonly contract an actual
  // runtime boundary and prevents transient identity/context mutation during
  // async discovery. Keep the original-value checks below as defense in depth
  // for callers that retain references to the supplied request object.

  try {
    assertMcpDescriptor(descriptor);
  } catch {
    return null;
  }

  // The resolver is not trusted to widen identity after the allowlist check.
  // Its resolved descriptor must exactly match the original authorized request.
  if (
    descriptor.serverId !== requestedServerId ||
    descriptor.name !== requestedToolName
  ) {
    return null;
  }

  if (!isAllowed(descriptor, boundPolicy)) return null;

  try {
    return buildMcpToolDefinition(descriptor, boundPolicy, resolver, request.context);
  } catch {
    // A resolver-supplied descriptor is untrusted input. Any malformed
    // capability must be rejected during discovery so one bad MCP tool cannot
    // abort registration of otherwise valid allowlisted capabilities.
    return null;
  }
}

export async function buildMcpToolRuntime(
  context: PlatformExecutionContext,
  requests: readonly McpToolResolutionRequest[],
  policy: McpToolBridgePolicy,
  resolver: McpToolResolver,
  baseRuntime?: ToolRuntime,
): Promise<ToolRuntime | null> {
  assertExecutionContext(context);
  let boundPolicy: McpToolBridgePolicy;
  try {
    assertMcpResolver(resolver);
    assertMcpPolicy(policy);
    boundPolicy = snapshotMcpPolicy(policy);
  } catch {
    return null;
  }
  if (!isMcpEnabled()) return null;

  // Default to an isolated MCP-only runtime. A caller may explicitly pass a
  // fresh, request-scoped Clara runtime to compose MCP capabilities alongside
  // the existing RAG/integration tools (Chat parity); never pass a global
  // singleton because MCP definitions are bound to this exact execution
  // context. The runtime's shared authorization/metering adapters remain the
  // final Unified Tool Runtime boundary.
  const runtime = baseRuntime ?? createToolRuntime({
    authorizationAdapter: buildClaraToolAuthorizationAdapter(),
    meteringHook: buildClaraToolMeteringHook(),
  });
  const registeredMcpIdentities = new Map<string, string>();

  for (const request of requests) {
    try {
      assertExecutionContext(request.context);
    } catch {
      continue;
    }
    if (request.context !== context) {
      throw new ToolExecutionError(
        "TENANT_SCOPE_VIOLATION",
        "MCP request context must match the runtime execution context.",
      );
    }

    const definition = await resolveMcpToolDefinition(request, boundPolicy, resolver);
    if (!definition) continue;

    const identity = `${request.serverId}\0${request.toolName}`;
    const registeredIdentity = registeredMcpIdentities.get(definition.name);
    if (registeredIdentity !== undefined) {
      // Never let a normalized-name collision silently shadow one MCP
      // capability with another. Identical requests are harmless duplicates;
      // distinct server/tool identities that converge on one runtime name
      // are an ambiguous capability set and fail closed.
      if (registeredIdentity !== identity) {
        throw new ToolExecutionError(
          "TENANT_SCOPE_VIOLATION",
          "MCP tool-name collision detected; refusing ambiguous capability registration.",
        );
      }
      continue;
    }

    try {
      runtime.registerTool(definition);
      // Record the identity only after the capability has actually committed
      // to the runtime. A rejected registration must not poison a later
      // identical resolution attempt in the same build.
      registeredMcpIdentities.set(definition.name, identity);
    } catch (error) {
      // A host resolver is not trusted to supply a structurally valid tool
      // definition. Registration failures make that capability unavailable;
      // they must not turn into a partially trusted executable capability or
      // prevent unrelated allowlisted MCP tools from being registered.
      if (error instanceof ToolRegistrationError) continue;
      throw error;
    }
  }

  return runtime;
}

/**
 * Static allowlist inspection only. Full authorization remains the
 * responsibility of the Unified Tool Runtime, which also enforces surface,
 * identity, RBAC, plan entitlement, and tenant checks.
 */
export function isMcpToolAllowlisted(
  descriptor: McpToolDescriptor,
  policy: McpToolBridgePolicy,
): boolean {
  try {
    assertMcpPolicy(policy);
    assertMcpDescriptor(descriptor);
    return isAllowed(descriptor, policy);
  } catch {
    return false;
  }
}
