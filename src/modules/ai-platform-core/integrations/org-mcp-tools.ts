/**
 * src/modules/ai-platform-core/integrations/org-mcp-tools.ts
 *
 * Organization-owned MCP tools exposed through the Unified Tool Runtime.
 *
 * Two dispatcher tools (the MCP tool set is dynamic per agent, so per-tool
 * static registration is impossible — the pair below mirrors the
 * integration_availability / integration_action pattern):
 *
 *   - mcp_availability: list the agent's advertised organization-approved MCP
 *     tools (connection, name, description, input schema summary).
 *   - mcp_tool: invoke one advertised tool by its server-assigned id.
 *
 * Every invocation re-authorizes: global enablement + emergency switch,
 * plan entitlement, subscription state, override, connection status, tool
 * approval, agent grant, quota admission and rate limit — all inside
 * `invokeAdvertisedTool` (src/modules/mcp/service.ts).
 *
 * Execution stays behind the existing ENABLE_MCP feature flag
 * (`isMcpEnabled` from mcp-tool-bridge) so the runtime remains dark until
 * the owner explicitly enables it after controlled verification.
 */
import { z } from "zod";
import { isMcpEnabled } from "../mcp-tool-bridge";
import { ToolExecutionError } from "../tool-contracts";
import type { PlatformExecutionContext } from "../contracts";
import type { ToolDefinition } from "../tool-contracts";

const availabilitySchema = z.object({}).strip();

const invokeSchema = z
  .object({
    toolId: z.string().uuid(),
    args: z.record(z.string(), z.unknown()).default({}),
  })
  .strip();

function requireMcpRuntime(): void {
  if (!isMcpEnabled()) {
    throw new ToolExecutionError(
      "PLAN_NOT_ENTITLED",
      "Organization MCP tools are disabled on this deployment.",
    );
  }
}

function requireRuntimeIdentity(context: PlatformExecutionContext): void {
  if (!context.userId || !context.agentId || !context.tenantId) {
    throw new ToolExecutionError(
      "MISSING_CONTEXT_IDENTITY",
      "MCP tools require tenant, agent, and user identity.",
    );
  }
}

/** Lazily imported so the AI core never eagerly loads DB modules. */
async function mcpService() {
  return import("@/modules/mcp/service");
}

export function buildMcpAvailabilityTool(): ToolDefinition {
  return {
    name: "mcp_availability",
    description:
      "List organization-approved MCP tools available to this agent, including the connection name, tool name, description and a compact input schema. Use mcp_tool with the returned toolId to invoke one.",
    inputSchema: availabilitySchema,
    authorization: {
      allowedSurfaces: ["chat", "realtime", "embed"],
      requiredPermission: null,
      requiredCapability: null,
      requireUserId: true,
      requireSessionId: false,
    },
    async execute(_raw, context: PlatformExecutionContext) {
      requireMcpRuntime();
      requireRuntimeIdentity(context);
      const { listAdvertisedMcpTools } = await mcpService();
      let tools;
      try {
        tools = await listAdvertisedMcpTools(context.tenantId, context.agentId!);
      } catch {
        throw new ToolExecutionError(
          "AUTHORIZATION_UNAVAILABLE",
          "MCP tool availability could not be verified.",
        );
      }
      return {
        available: true,
        tools: tools.map((tool) => ({
          toolId: tool.toolId,
          connection: tool.connectionName,
          name: tool.toolName,
          description: tool.description.slice(0, 500),
          inputSchema: tool.inputSchema,
        })),
      };
    },
  };
}

export function buildMcpToolInvoker(): ToolDefinition {
  return {
    name: "mcp_tool",
    description:
      "Invoke one organization-approved MCP tool by its toolId. Discover valid toolIds with mcp_availability first. Pass the tool's expected arguments in `args`.",
    inputSchema: invokeSchema,
    authorization: {
      allowedSurfaces: ["chat", "realtime", "embed"],
      requiredPermission: null,
      requiredCapability: null,
      requireUserId: true,
      requireSessionId: false,
    },
    async execute(raw, context: PlatformExecutionContext) {
      requireMcpRuntime();
      requireRuntimeIdentity(context);
      const input = raw as { toolId: string; args: Record<string, unknown> };
      const { invokeAdvertisedTool } = await mcpService();
      const surface =
        context.surface === "realtime"
          ? "realtime"
          : context.surface === "embed"
            ? "embed"
            : "chat";
      let result;
      try {
        result = await invokeAdvertisedTool({
          orgId: context.tenantId,
          agentId: context.agentId!,
          userId: context.userId!,
          surface,
          toolId: input.toolId,
          args: input.args,
        });
      } catch {
        throw new ToolExecutionError(
          "AUTHORIZATION_UNAVAILABLE",
          "MCP tool authorization could not be verified.",
        );
      }
      if (!result.ok) {
        throw new ToolExecutionError(
          mcpErrorToToolCode(result.code),
          result.message,
          { toolId: input.toolId, mcpErrorCode: result.code, retryable: result.retryable },
        );
      }
      // Untrusted MCP content is returned as structured data for the model;
      // the model — not the tool — decides how to phrase it. No
      // credential-shaped fields are included because the MCP client never
      // mixes credentials into results.
      return {
        content: result.content,
        structuredContent: result.structuredContent,
      };
    },
  };
}

/** Map MCP failure codes onto the runtime's typed error union. */
function mcpErrorToToolCode(code: string): ToolExecutionError["code"] {
  switch (code) {
    case "PERMISSION_REVOKED":
    case "CREDENTIALS_UNAVAILABLE":
      return "TENANT_SCOPE_VIOLATION";
    case "PERIOD_QUOTA_EXHAUSTED":
    case "RATE_LIMITED":
    case "GLOBAL_DISABLED":
    case "EMERGENCY_DISABLED":
    case "PLAN_NOT_ENTITLED":
    case "SUBSCRIPTION_NOT_ENTITLED":
    case "ENTITLEMENT_RESOLUTION_FAILED":
      return "PLAN_NOT_ENTITLED";
    case "AUTHORIZATION_UNAVAILABLE":
      return "AUTHORIZATION_UNAVAILABLE";
    default:
      return "EXECUTION_FAILED";
  }
}
