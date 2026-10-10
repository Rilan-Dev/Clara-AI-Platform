import { NextRequest, NextResponse } from "next/server";
import { query as dbQuery } from "@/lib/db";
import { getAuthContext } from "@/modules/auth/core/rbac";
import { getKbAccessContext } from "@/modules/auth/core/db";
import {
  buildMcpToolRuntime,
  createExecutionContext,
  getClaraToolRuntime,
  isMcpEnabled,
  mcpToolName,
  streamableHttpMcpToolResolver,
  isAgentLoopEnabled,
  isProviderToolCallingEnabled,
} from "@/modules/ai-platform-core";

const ALLOWED_REALTIME_INTEGRATION_TOOLS = new Set([
  "integration_availability",
  "integration_action",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Executes a model-requested realtime integration tool through the same
 * Unified Tool Runtime used by provider chat. All identity is re-derived from
 * the authenticated request and KB relationship; body-supplied identity is
 * deliberately ignored.
 */
export async function postRealtimeTool(request: NextRequest): Promise<NextResponse> {
  if (!isAgentLoopEnabled() || !isProviderToolCallingEnabled()) {
    return NextResponse.json({ error: "Realtime integration tools are disabled." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (!isPlainObject(body)) {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }

  const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
  const toolName = typeof body.toolName === "string" ? body.toolName : "";
  const input = body.arguments;
  const isMcpCandidate = toolName.startsWith("mcp_") && /^[a-z0-9_]{3,64}$/.test(toolName);
  if (!kbId || kbId.length > 128 ||
      (!ALLOWED_REALTIME_INTEGRATION_TOOLS.has(toolName) && !(isMcpEnabled() && isMcpCandidate)) ||
      !isPlainObject(input)) {
    return NextResponse.json({ error: "Invalid realtime integration tool request." }, { status: 400 });
  }

  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (auth.user.isSuperAdmin) {
    return NextResponse.json({ error: "Platform administrators cannot invoke tenant integration tools." }, { status: 403 });
  }

  const [access] = await getKbAccessContext(kbId, auth.user.id);
  if (!access?.membership || !access.permissions.has("kb:read")) {
    return NextResponse.json({ error: "Knowledge base access denied." }, { status: 403 });
  }

  const agentRows = await dbQuery<{ agent_id: string }>(
    `SELECT a.id AS agent_id
       FROM agents a
       JOIN knowledge_bases kb ON kb.agent_id = a.id
      WHERE kb.id = $1 AND a.org_id = $2
      LIMIT 1`,
    [kbId, access.orgId],
  );
  const agentId = agentRows[0]?.agent_id;
  if (!agentId) return NextResponse.json({ error: "Knowledge base agent was not found." }, { status: 404 });

  const context = createExecutionContext({
    orgId: access.orgId,
    kbId,
    agentId,
    userId: auth.user.id,
    sessionId: auth.session.id,
    surface: "realtime",
  });

  if (isMcpCandidate && !ALLOWED_REALTIME_INTEGRATION_TOOLS.has(toolName)) {
    // The model/client supplies only the public tool alias. Resolve it back to
    // an exact tenant-owned server/tool pair from current grants, then build a
    // one-tool runtime whose resolver rechecks every grant before execution.
    const grants = await dbQuery<{ server_id: string; tool_name: string }>(
      `SELECT DISTINCT s.id AS server_id, t.tool_name
         FROM platform_mcp_servers s
         JOIN platform_mcp_tools t ON t.server_id=s.id AND t.approved=true
         JOIN organisation_mcp_connections c ON c.server_id=s.id AND c.org_id=$1 AND c.status='configured'
         JOIN organisation_mcp_tool_grants g ON g.org_id=$1 AND g.server_id=s.id AND g.tool_name=t.tool_name AND g.enabled=true
         JOIN agent_mcp_tool_grants ag ON ag.org_id=$1 AND ag.server_id=s.id AND ag.tool_name=t.tool_name AND ag.agent_id=$2::uuid AND ag.enabled=true
         JOIN knowledge_bases kb ON kb.agent_id=ag.agent_id AND kb.id=$3
        WHERE s.platform_enabled=true
        ORDER BY s.id, t.tool_name
        LIMIT 128`,
      [access.orgId, agentId, kbId],
    );
    const grant = grants.find((row) => mcpToolName(row.server_id, row.tool_name) === toolName);
    if (!grant) return NextResponse.json({ error: "MCP tool is not currently granted to this agent." }, { status: 403 });
    const requestForTool = { serverId: grant.server_id, toolName: grant.tool_name, context };
    const runtime = await buildMcpToolRuntime(
      context,
      [requestForTool],
      { allowedServers: [grant.server_id], allowedToolPairs: [{ serverId: grant.server_id, toolName: grant.tool_name }] },
      streamableHttpMcpToolResolver,
    );
    if (!runtime) return NextResponse.json({ error: "MCP tool is unavailable or no longer authorized." }, { status: 404 });
    const outcome = await runtime.invoke(toolName, input, context);
    return NextResponse.json({ outcome });
  }

  const outcome = await getClaraToolRuntime().invoke(toolName, input, context);
  // The runtime returns typed success/failure envelopes. Keep this response
  // transport-neutral; the voice client passes the envelope back to the model.
  return NextResponse.json({ outcome });
}
