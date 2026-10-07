/**
 * Integrations Framework I-6 — bounded MCP Tool Runtime bridge.
 *
 * This module does not implement MCP transport. It accepts already-resolved
 * MCP tool capabilities from a host adapter and represents them as ordinary
 * Clara ToolDefinitions so execution remains inside the existing Unified
 * Tool Runtime.
 */
import { z } from "zod";
import { assertExecutionContext } from "./execution-context";
import type { PlatformExecutionContext, SurfaceKind } from "./contracts";
import type { ToolDefinition, ToolAuthorizationDecision } from "./tool-contracts";
import { ToolExecutionError } from "./tool-contracts";
import { buildClaraToolRuntime } from "./clara-tools";
import type { ToolRuntime } from "./tool-registry";

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

export interface McpToolBridgePolicy {
  readonly allowedServers: readonly string[];
  readonly allowedTools: readonly string[];
  readonly requireUserId?: boolean;
}

function normalizeMcpToolName(serverId: string, toolName: string): string {
  const base = `mcp_${serverId}_${toolName}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  if (base.length <= 64) return base;
  return `${base.slice(0, 55)}_${simpleHash(base)}`;
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
    policy.allowedTools.includes(descriptor.name)
  );
}

export function isMcpEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    (env[MCP_TOOL_FLAG] ?? "").trim().toLowerCase(),
  );
}

export function mcpToolName(serverId: string, toolName: string): string {
  return normalizeMcpToolName(serverId, toolName);
}

export function buildMcpToolDefinition(
  descriptor: McpToolDescriptor,
  policy: McpToolBridgePolicy,
  resolver: McpToolResolver,
): ToolDefinition {
  if (!isAllowed(descriptor, policy)) {
    throw new ToolExecutionError(
      "TENANT_SCOPE_VIOLATION",
      `MCP tool is not allowlisted: ${descriptor.serverId}/${descriptor.name}`,
    );
  }

  const allowedSurfaces = descriptor.allowedSurfaces?.length
    ? descriptor.allowedSurfaces.filter((surface) =>
        ALLOWED_MCP_SURFACES.includes(surface),
      )
    : ALLOWED_MCP_SURFACES;

  if (allowedSurfaces.length === 0) {
    throw new ToolExecutionError(
      "UNAUTHORIZED_SURFACE",
      `MCP tool has no allowed Clara surface: ${descriptor.serverId}/${descriptor.name}`,
    );
  }

  return {
    name: mcpToolName(descriptor.serverId, descriptor.name),
    description:
      descriptor.description ||
      `Invoke MCP tool ${descriptor.name} from ${descriptor.serverId}.`,
    inputSchema: descriptor.inputSchema,
    authorization: {
      allowedSurfaces,
      requiredPermission: null,
      requiredCapability: null,
      requireUserId: policy.requireUserId ?? true,
      requireSessionId: false,
    },
    async execute(input, context) {
      assertExecutionContext(context);
      if (!isAllowed(descriptor, policy)) {
        throw new ToolExecutionError(
          "TENANT_SCOPE_VIOLATION",
          "MCP tool is no longer allowlisted.",
        );
      }
      return resolver.invoke(descriptor, input, context);
    },
  };
}

export async function resolveMcpToolDefinition(
  request: McpToolResolutionRequest,
  policy: McpToolBridgePolicy,
  resolver: McpToolResolver,
): Promise<ToolDefinition | null> {
  assertExecutionContext(request.context);
  if (!isAllowed(
    { serverId: request.serverId, name: request.toolName },
    policy,
  )) {
    return null;
  }

  const descriptor = await resolver.resolve(request);
  if (!descriptor) return null;

  // The resolver is not trusted to widen identity after the allowlist check.
  // Its resolved descriptor must exactly match the already-authorized request.
  if (
    descriptor.serverId !== request.serverId ||
    descriptor.name !== request.toolName
  ) {
    return null;
  }

  if (!isAllowed(descriptor, policy)) return null;
  return buildMcpToolDefinition(descriptor, policy, resolver);
}

export async function buildMcpToolRuntime(
  context: PlatformExecutionContext,
  requests: readonly McpToolResolutionRequest[],
  policy: McpToolBridgePolicy,
  resolver: McpToolResolver,
): Promise<ToolRuntime | null> {
  assertExecutionContext(context);
  if (!isMcpEnabled()) return null;

  const runtime = buildClaraToolRuntime();

  for (const request of requests) {
    if (request.context !== context) {
      throw new ToolExecutionError(
        "TENANT_SCOPE_VIOLATION",
        "MCP request context must match the runtime execution context.",
      );
    }

    const definition = await resolveMcpToolDefinition(request, policy, resolver);
    if (!definition || runtime.hasTool(definition.name)) continue;
    runtime.registerTool(definition);
  }

  return runtime;
}

/**
 * Small adapter helper for hosts that need to inspect a policy decision
 * before constructing a tool. The bridge itself never replaces Clara's
 * Unified Tool Runtime authorization adapter.
 */
export function authorizeMcpTool(
  descriptor: McpToolDescriptor,
  policy: McpToolBridgePolicy,
): ToolAuthorizationDecision {
  if (!isAllowed(descriptor, policy)) {
    return {
      allowed: false,
      code: "TENANT_SCOPE_VIOLATION",
      message: `MCP tool is not allowlisted: ${descriptor.serverId}/${descriptor.name}`,
    };
  }
  return { allowed: true };
}
