/**
 * src/modules/mcp/runtime-resolver.ts
 *
 * Organization-owned MCP connections on the Unified Tool Runtime.
 *
 * This adapter implements the SAME McpToolResolver contract the platform
 * catalog uses (src/modules/ai-platform-core/mcp-tool-bridge.ts) so chat and
 * realtime advertise and execute organization-owned tools through the one
 * established request-scoped runtime — there is no parallel execution path.
 *
 * Authorization model (mirrors StreamableHttpMcpToolResolver):
 *   resolve()  — discovery-time gate: ENABLE_MCP flag, execution-context
 *                identity, KB membership recheck, effective entitlement
 *                (global policy ∩ plan ∩ subscription ∩ override), active
 *                connection + approved tool + enabled agent grant, and a
 *                runtime-safe descriptor built from the stored schema.
 *   invoke()   — execution-time reauthorization via invokeAdvertisedTool()
 *                which re-resolves entitlements, re-checks connection/tool/
 *                grant state, admits against quota + rate limits and meters
 *                both successes and failures.
 *
 * A resolver instance is cheap and request-scoped: create one per chat/
 * realtime request. Entitlement and KB-access lookups are memoized per
 * instance (they are org-scoped, not tool-scoped) while every invocation
 * still re-resolves from authoritative rows.
 */
import { query } from "@/lib/db";
import { getKbAccessContext } from "@/modules/auth/core/db";
import { isMcpEnabled } from "@/modules/ai-platform-core/mcp-tool-bridge";
import type {
  McpToolDescriptor,
  McpToolResolver,
  McpToolResolutionRequest,
  McpToolAllowlistEntry,
} from "@/modules/ai-platform-core/mcp-tool-bridge";
import { buildStoredMcpToolDescriptor } from "@/modules/ai-platform-core/mcp-streamable-http-resolver";
import type { PlatformExecutionContext, SurfaceKind } from "@/modules/ai-platform-core/contracts";
import { mcpToolName } from "@/modules/ai-platform-core/mcp-tool-bridge";
import { resolveEffectiveMcpEntitlements, type EffectiveMcpEntitlements } from "./entitlements";
import { invokeAdvertisedTool, listAdvertisedMcpTools } from "./service";

const ORG_MCP_SURFACES: readonly SurfaceKind[] = ["chat", "realtime", "embed"];

/** Cap on org-owned tools advertised to one surface (mirrors the platform LIMIT 8 discipline). */
const ORG_MCP_ADVERTISEMENT_LIMIT = 16;

type KbAccessRow = Awaited<ReturnType<typeof getKbAccessContext>>[number];

function contextIdentityOk(context: PlatformExecutionContext): boolean {
  return (
    ORG_MCP_SURFACES.includes(context.surface) &&
    Boolean(context.tenantId) &&
    Boolean(context.kbId) &&
    Boolean(context.userId) &&
    Boolean(context.agentId)
  );
}

export class OrgMcpToolResolver implements McpToolResolver {
  private effective: Promise<EffectiveMcpEntitlements> | null = null;
  private kbAccess: Promise<KbAccessRow | undefined> | null = null;
  private readonly toolIds = new Map<string, string>();

  private entitlements(context: PlatformExecutionContext): Promise<EffectiveMcpEntitlements> {
    this.effective ??= resolveEffectiveMcpEntitlements(context.tenantId);
    return this.effective;
  }

  private membership(context: PlatformExecutionContext): Promise<KbAccessRow | undefined> {
    this.kbAccess ??= (async () => (await getKbAccessContext(context.kbId, context.userId!))[0])();
    return this.kbAccess;
  }

  async resolve(request: McpToolResolutionRequest): Promise<McpToolDescriptor | null> {
    const { context } = request;
    try {
      if (!isMcpEnabled() || !contextIdentityOk(context)) return null;

      const kbAccess = await this.membership(context);
      if (!kbAccess?.membership || kbAccess.orgId !== context.tenantId || !kbAccess.permissions.has("kb:read")) {
        return null;
      }

      const effective = await this.entitlements(context);
      if (!effective.available) return null;

      const rows = await query<{
        tool_id: string;
        tool_name: string;
        description: string;
        input_schema: Record<string, unknown> | null;
      }>(
        `SELECT t.id AS tool_id, t.tool_name, t.description, t.input_schema
           FROM org_mcp_agent_grants g
           JOIN org_mcp_tools t ON t.id = g.tool_id
           JOIN org_mcp_connections c ON c.id = t.connection_id
           JOIN agents a ON a.id = g.agent_id AND a.org_id = g.org_id
           JOIN knowledge_bases kb ON kb.agent_id = a.id AND kb.id = $3
          WHERE g.org_id = $1 AND g.agent_id = $2 AND g.enabled = TRUE
            AND t.approved = TRUE AND t.status = 'approved'
            AND c.status = 'active'
            AND c.id = $4::uuid AND t.tool_name = $5
          LIMIT 1`,
        [context.tenantId, context.agentId, context.kbId, request.serverId, request.toolName],
      );
      const row = rows[0];
      if (!row) return null;

      const descriptor = buildStoredMcpToolDescriptor(
        request.serverId,
        row.tool_name,
        row.description ?? "",
        row.input_schema ?? {},
        ORG_MCP_SURFACES,
      );
      if (!descriptor) return null;

      this.toolIds.set(`${request.serverId}\0${request.toolName}`, row.tool_id);
      return descriptor;
    } catch {
      // Discovery must fail closed: an unavailable entitlement/store must
      // never widen into an advertised capability.
      return null;
    }
  }

  async invoke(
    descriptor: McpToolDescriptor,
    input: unknown,
    context: PlatformExecutionContext,
  ): Promise<unknown> {
    if (!isMcpEnabled() || !contextIdentityOk(context)) {
      throw new Error("MCP tool invocation failed safely. Check the server connection and approved tool configuration.");
    }

    // The runtime validated input against the descriptor schema at the
    // Unified Tool Runtime boundary; re-validate defensively exactly like the
    // platform resolver so a stale or forged descriptor cannot bypass it.
    const parsed = descriptor.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error("MCP tool arguments did not match the approved schema.");
    }

    let toolId = this.toolIds.get(`${descriptor.serverId}\0${descriptor.name}`);
    if (!toolId) {
      const rows = await query<{ tool_id: string }>(
        `SELECT t.id AS tool_id
           FROM org_mcp_tools t
           JOIN org_mcp_connections c ON c.id = t.connection_id
          WHERE c.id = $1 AND t.tool_name = $2 AND t.org_id = $3
            AND c.org_id = $3 AND t.approved = TRUE
          LIMIT 1`,
        [descriptor.serverId, descriptor.name, context.tenantId],
      );
      toolId = rows[0]?.tool_id;
    }
    if (!toolId) {
      throw new Error("MCP tool invocation failed safely. This tool is no longer available to the organisation.");
    }

    const outcome = await invokeAdvertisedTool({
      orgId: context.tenantId,
      agentId: context.agentId!,
      userId: context.userId ?? null,
      surface: context.surface,
      toolId,
      args: (parsed.data ?? {}) as Record<string, unknown>,
    });
    if (!outcome.ok) {
      // Sanitized, code-level diagnostics only: no endpoint URLs, headers or
      // credential material can leak through these messages.
      console.warn("[MCP] org-owned tool invocation rejected", {
        code: outcome.code,
        retryable: outcome.retryable,
        connectionId: descriptor.serverId,
        toolName: descriptor.name,
      });
      throw new Error("MCP tool invocation failed safely. Check the server connection and approved tool configuration.");
    }
    return {
      content: outcome.content,
      structuredContent: outcome.structuredContent,
      isError: outcome.isError,
    };
  }
}

/**
 * Composite resolver for a request that carries BOTH platform-catalog tools
 * and organization-owned tools. Routing is decided by the org-owned
 * connection-id set captured during this request's capability query, so a
 * resolver can never reclassify an id after the allowlist was built.
 */
export function createCompositeMcpResolver(options: {
  platform: McpToolResolver;
  orgOwned: McpToolResolver;
  orgOwnedServerIds: ReadonlySet<string>;
}): McpToolResolver {
  const { platform, orgOwned, orgOwnedServerIds } = options;
  const route = (serverId: string): McpToolResolver =>
    orgOwnedServerIds.has(serverId) ? orgOwned : platform;
  return {
    async resolve(request) {
      return route(request.serverId).resolve(request);
    },
    async invoke(descriptor, input, context) {
      return route(descriptor.serverId).invoke(descriptor, input, context);
    },
  };
}

export type OrgOwnedMcpCapabilityTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type OrgOwnedMcpCapabilities = {
  requests: McpToolResolutionRequest[];
  allowedServers: string[];
  allowedToolPairs: McpToolAllowlistEntry[];
  tools: OrgOwnedMcpCapabilityTool[];
  resolver: OrgMcpToolResolver;
};

/**
 * Discovery half for chat/realtime hosts: lists the agent's org-owned tools
 * (active connection + approved tool + enabled grant), resolves each through
 * the entitlement-gated OrgMcpToolResolver, and returns only the usable ones
 * as bridge requests, allowlist entries and provider tool definitions.
 */
export async function resolveOrgOwnedMcpCapabilities(
  context: PlatformExecutionContext,
  limit: number = ORG_MCP_ADVERTISEMENT_LIMIT,
): Promise<OrgOwnedMcpCapabilities> {
  const resolver = new OrgMcpToolResolver();
  const empty: OrgOwnedMcpCapabilities = {
    requests: [],
    allowedServers: [],
    allowedToolPairs: [],
    tools: [],
    resolver,
  };
  if (!isMcpEnabled() || !contextIdentityOk(context)) return empty;

  const advertised = (await listAdvertisedMcpTools(context.tenantId, context.agentId!)).slice(0, limit);
  const requests: McpToolResolutionRequest[] = advertised.map((tool) => ({
    serverId: tool.connectionId,
    toolName: tool.toolName,
    context,
  }));

  const resolved = await Promise.all(
    requests.map(async (request) => ({
      request,
      descriptor: await resolver.resolve(request),
    })),
  );
  const usable = resolved.filter((item) => item.descriptor !== null);
  return {
    requests: usable.map((item) => item.request),
    allowedServers: [...new Set(usable.map((item) => item.request.serverId))],
    allowedToolPairs: usable.map((item) => ({
      serverId: item.request.serverId,
      toolName: item.request.toolName,
    })),
    tools: usable.map(({ descriptor }) => ({
      name: mcpToolName(descriptor!.serverId, descriptor!.name),
      description: descriptor!.description.slice(0, 1000),
      parameters: descriptor!.inputSchemaJson ?? { type: "object", properties: {}, additionalProperties: false },
    })),
    resolver,
  };
}